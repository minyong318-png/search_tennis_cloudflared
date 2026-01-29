import { json, buildCourtGroupMap, flattenSlots, kstNowISOString, yyyymmddKST } from "./util";
import { dbAll, dbGet, dbRun } from "./db";
import { runCrawl } from "./crawler";
import { sendWebPush } from "./webpush";



async function cleanupOld(env) {
  const today = yyyymmddKST(new Date());
  await dbRun(env, `DELETE FROM alarms WHERE date < ?`, [today]);
  await dbRun(env, `DELETE FROM baseline_slots WHERE date < ?`, [today]);
  // sent_slots는 하루만 유지
  await dbRun(env, `DELETE FROM sent_slots WHERE sent_at < datetime('now','-1 day')`);
}

async function sendPush(env, subscription, title, body) {
  const res = await sendWebPush({
    subscription,
    title,
    body,
    ttl: 60,
    env
  });

  // 구독 만료(410/404)면 DB에서 구독 삭제(선택)
  if (res.status === 410 || res.status === 404) {
    // 여기서 subscription_id를 알고 있으면 삭제하면 더 깔끔함
    // (지금 구조에선 subsMap 키가 subscription_id라서 호출부에서 처리 권장)
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`WebPush failed: ${res.status} ${txt}`);
  }
}


export async function handleRefresh(req, env, ctx, opts = {}) {
  const fromCron = opts.fromCron === true || !req;

  let force = false;
  if (!fromCron && req) {
    const url = new URL(req.url);
    force = url.searchParams.get("force") === "1";
  }

  const last = await env.CACHE.get("LAST_REFRESH_TS");
  if (!force && last && Date.now() - Number(last) < 1 * 60 * 1000) {
    console.log("[REFRESH] skip (too soon)");
    return fromCron ? undefined : new Response("skip");
  }

  await env.CACHE.put("LAST_REFRESH_TS", Date.now().toString());

  console.log("[REFRESH] start", fromCron ? "cron" : "manual");


  let url = null;
  if (req) {
    url = new URL(req.url);
  }

  // 🔐 수동 호출만 토큰 검사
  if (!fromCron) {
    const token = url.searchParams.get("token");
    if (!token || token !== env.REFRESH_TOKEN) {
      return new Response("forbidden", { status: 403 });
    }
  }

  // 0) 오래된 데이터 정리
  await cleanupOld(env);

  // 1) 크롤링
  let crawlOptions = {
    daysAhead: 10,        // 이번 달 + 다음 달 커버
    concurrency: 10       // CPU 안정 우선
  };

const facilities = await getFacilities();
const dates = getDates(10);

let availability = {};

for (const f of facilities) {
  for (const d of dates) {
    const slots = await runCrawlByFacilityDate({
      facilityId: f.id,
      date: d
    });

    availability[f.id] ??= {};
    availability[f.id][d] = slots;
  }
}


  console.log(
    "[REFRESH] crawl result",
    Object.keys(facilities).length,
    Object.keys(availability).length
  );

  const updated_at = kstNowISOString();

  // 2) KV 저장
  const payload = JSON.stringify({ facilities, availability, updated_at });
  await env.CACHE.put("DATA_JSON", payload, { expirationTtl: 120 });

  console.log("[REFRESH] cache updated");

  // ⬇️⬇️⬇️ 여기서부터 알람 로직 ⬇️⬇️⬇️


  // 3) 알람 처리
  const alarms = await dbAll(env, `SELECT subscription_id, court_group, date FROM alarms`);
  if (!alarms.results?.length) return fromCron ? undefined : new Response("ok");

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

    // baseline 로드
    const baselineRows = await dbAll(env, `
      SELECT time_content
      FROM baseline_slots
      WHERE subscription_id=? AND court_group=? AND date=?
    `, [subscription_id, group, date]);

    const baseline = new Set((baselineRows.results || []).map(r => r.time_content));

    // 최초 baseline 없으면: baseline만 쌓고 알람 X
    if (baseline.size === 0) {
      const times = new Set(
        currentSlots
          .filter(s => groupCids.includes(s.cid) && s.date === date)
          .map(s => s.time)
      );

      for (const t of times) {
        await dbRun(env, `
          INSERT INTO baseline_slots (subscription_id, court_group, date, time_content)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(subscription_id, court_group, date, time_content) DO NOTHING
        `, [subscription_id, group, date, t]);
      }
      continue;
    }

    // 신규 슬롯만 발송
    for (const slot of currentSlots) {
      if (!groupCids.includes(slot.cid)) continue;
      if (slot.date !== date) continue;
      if (baseline.has(slot.time)) continue;

      const sub = subsMap[subscription_id];
      if (!sub) continue;

      const slot_key = `${group}|${date}|${slot.time}`;

      const already = await dbGet(env, `
        SELECT 1 FROM sent_slots WHERE subscription_id=? AND slot_key=? LIMIT 1
      `, [subscription_id, slot_key]);

      if (already) continue;

      await sendPush(env, sub, "🎾 예약 가능 알림", `${group} ${date} ${slot.time}`);
      fired++;

      // baseline + sent 기록
      await dbRun(env, `
        INSERT INTO baseline_slots (subscription_id, court_group, date, time_content)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(subscription_id, court_group, date, time_content) DO NOTHING
      `, [subscription_id, group, date, slot.time]);

      await dbRun(env, `
        INSERT INTO sent_slots (subscription_id, slot_key)
        VALUES (?, ?)
        ON CONFLICT(subscription_id, slot_key) DO NOTHING
      `, [subscription_id, slot_key]);

      baseline.add(slot.time);
    }
  }

  return fromCron ? undefined : json({ status: "ok", fired });
}
