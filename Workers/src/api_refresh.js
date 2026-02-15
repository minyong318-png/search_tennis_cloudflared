import {
  json,
  buildCourtGroupMap,
  flattenSlots,
  kstNowISOString,
  yyyymmddKST,
  getKSTNow
} from "./util";
import { dbAll, dbGet, dbRun } from "./db";
import { fetchAllFacilities, fetchTimesForRidDate } from "./crawler";
import { sendWebPush } from "./webpush";

/**
 * ✅ 오래된 데이터 정리
 * - alarms/baseline: date < today 삭제
 * - sent_slots: 1일 유지
 * - availability_cache: date < today 삭제 (만료 데이터 문제 해결)
 */
export async function cleanupOld(env) {
  const today = yyyymmddKST(new Date());
  await dbRun(env, `DELETE FROM alarms WHERE date < ?`, [today]);
  await dbRun(env, `DELETE FROM baseline_slots WHERE date < ?`, [today]);
  await dbRun(env, `DELETE FROM sent_slots WHERE sent_at < datetime('now','-1 day')`);
  await dbRun(env, `DELETE FROM availability_cache WHERE date < ?`, [today]);
}

async function sendPush(env, subscription, title, body) {
  const res = await sendWebPush({
    subscription,
    title,
    body,
    ttl: 60,
    env
  });

  // 구독 만료(410/404)면 호출부에서 DB 삭제 처리 가능
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`WebPush failed: ${res.status} ${txt}`);
  }
}

/**
 * ✅ (통합) 크롤 → DB 저장 → KV 저장용 payload 생성
 * availability 구조는 util.flattenSlots가 기대하는 형태:
 * availability[rid][date] = [{timeContent,resveId}, ...]
 */
export async function crawlAndStore(env, { targetRids, targetDates, concurrency = 6 } = {}) {
  const { facilities } = await fetchAllFacilities({ concurrency: Math.min(concurrency, 8) });

  const allRids = Object.keys(facilities).sort();
  const rids = (targetRids && targetRids.length) ? targetRids : allRids;

  const availability = {};
  const updated_at = kstNowISOString();

  for (const rid of rids) {
    for (const dateVal of targetDates || []) {
      const slots = await fetchTimesForRidDate({ rid, dateVal });

      // 메모리용 availability
      availability[rid] ??= {};
      availability[rid][dateVal] = Array.isArray(slots) ? slots : [];

      // DB 캐시 저장 (빈 배열도 저장해서 “없음” 상태를 명확히)
      await dbRun(
        env,
        `
        INSERT INTO availability_cache (rid, date, slots_json, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(rid, date) DO UPDATE SET
          slots_json=excluded.slots_json,
          updated_at=excluded.updated_at
        `,
        [String(rid), String(dateVal), JSON.stringify(availability[rid][dateVal])]
      );
    }
  }

  // KV 데이터(프론트 조회용)
  const payload = JSON.stringify({ facilities, availability, updated_at });
  await env.CACHE.put("DATA_JSON", payload, { expirationTtl: 120 });

  return { facilities, availability, updated_at };
}

/**
 * ✅ (통합) 알람 체크 + 푸시 발송
 * - baseline 비어있을 때도 "첫 발생"은 알람 보내도록 개선 (원하면 끌 수 있음)
 */
export async function runAlarmChecks(
  env,
  { facilities, availability },
  { fireOnBaselineEmpty = true, maxPerAlarm = 5 } = {}
) {
  const alarms = await dbAll(env, `SELECT subscription_id, court_group, date FROM alarms`);
  if (!alarms.results?.length) return { fired: 0 };

  const subs = await dbAll(env, `SELECT * FROM push_subscriptions`);
  const subsMap = {};
  for (const s of (subs.results || [])) {
    subsMap[s.id] = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth }
    };
  }

  const courtGroupMap = buildCourtGroupMap(facilities);
  const currentSlots = flattenSlots(facilities, availability);

  let fired = 0;

  for (const alarm of alarms.results) {
    const subscription_id = alarm.subscription_id;
    const group = alarm.court_group;
    const date = alarm.date;

    const groupCids = courtGroupMap[group] || [];
    if (!groupCids.length) continue;

    const sub = subsMap[subscription_id];
    if (!sub) continue;

    // baseline 로드
    const baselineRows = await dbAll(
      env,
      `
      SELECT time_content
      FROM baseline_slots
      WHERE subscription_id=? AND court_group=? AND date=?
    `,
      [subscription_id, group, date]
    );

    const baseline = new Set((baselineRows.results || []).map(r => r.time_content));

    const timesNow = currentSlots
      .filter(s => groupCids.includes(s.cid) && s.date === date)
      .map(s => s.time);

    const uniqueNow = Array.from(new Set(timesNow));

    // baseline 비어있으면: baseline 적재 + (옵션) 첫 발생 알림
    if (baseline.size === 0) {
      for (const t of uniqueNow) {
        await dbRun(
          env,
          `
          INSERT INTO baseline_slots (subscription_id, court_group, date, time_content)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(subscription_id, court_group, date, time_content) DO NOTHING
        `,
          [subscription_id, group, date, t]
        );
      }

      if (!fireOnBaselineEmpty || uniqueNow.length === 0) continue;

      // ✅ 첫 발생 알림: 너무 많이 보내지 않게 제한
      const toSend = uniqueNow.slice(0, maxPerAlarm);
      for (const t of toSend) {
        const slot_key = `${group}|${date}|${t}`;

        const already = await dbGet(
          env,
          `SELECT 1 FROM sent_slots WHERE subscription_id=? AND slot_key=? LIMIT 1`,
          [subscription_id, slot_key]
        );
        if (already) continue;

        await sendPush(env, sub, "🎾 예약 가능 알림", `${group} ${date} ${t}`);
        fired++;

        await dbRun(
          env,
          `
          INSERT INTO sent_slots (subscription_id, slot_key)
          VALUES (?, ?)
          ON CONFLICT(subscription_id, slot_key) DO NOTHING
        `,
          [subscription_id, slot_key]
        );
      }
      continue;
    }

    // 신규 슬롯만 발송
    let sentCountForAlarm = 0;

    for (const t of uniqueNow) {
      if (baseline.has(t)) continue;

      const slot_key = `${group}|${date}|${t}`;

      const already = await dbGet(
        env,
        `SELECT 1 FROM sent_slots WHERE subscription_id=? AND slot_key=? LIMIT 1`,
        [subscription_id, slot_key]
      );
      if (already) continue;

      await sendPush(env, sub, "🎾 예약 가능 알림", `${group} ${date} ${t}`);
      fired++;
      sentCountForAlarm++;
      if (sentCountForAlarm >= maxPerAlarm) break;

      await dbRun(
        env,
        `
        INSERT INTO baseline_slots (subscription_id, court_group, date, time_content)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(subscription_id, court_group, date, time_content) DO NOTHING
      `,
        [subscription_id, group, date, t]
      );

      await dbRun(
        env,
        `
        INSERT INTO sent_slots (subscription_id, slot_key)
        VALUES (?, ?)
        ON CONFLICT(subscription_id, slot_key) DO NOTHING
      `,
        [subscription_id, slot_key]
      );

      baseline.add(t);
    }
  }

  return { fired };
}

/**
 * ✅ 수동/크론 공용 엔트리
 * - targetRids/targetDates를 index.js(크론)에서 계산해서 여기로 넘기면 완전 통합됨
 */
export async function runCrawlCycle(env, { targetRids, targetDates, concurrency = 6 } = {}) {
  await cleanupOld(env);
  const data = await crawlAndStore(env, { targetRids, targetDates, concurrency });
  const alarm = await runAlarmChecks(env, data, { fireOnBaselineEmpty: true, maxPerAlarm: 5 });
  return { ...data, ...alarm };
}

/**
 * 기존 /api/refresh 유지 (수동 호출)
 */
export async function handleRefresh(req, env, ctx) {
  const url = new URL(req.url);

  // 🔐 수동 호출 토큰 검사
  const token = url.searchParams.get("token");
  if (!token || token !== env.REFRESH_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }

  // 수동 호출은 “풀”로 돌리고 싶으면 여기서 targetDates/targetRids 계산해서 넣으면 됨
  // 일단 현재는 "내일부터 10일" 같은 정책을 index.js 크론에 맡기는 게 더 일관됨.
  return json({ ok: true, msg: "Use cron cycle; manual refresh is for diagnostics." });
}
