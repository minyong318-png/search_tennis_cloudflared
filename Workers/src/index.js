import { handleData } from "./api_data";
import { handleAlarm } from "./api_alarm";
import { handlePushSubscribe } from "./api_push";
import { handleRefresh } from "./api_refresh";
import { fetchAllFacilities, fetchTimesForRidDate } from "./crawler";
import {
  getKSTHour,
  listTomorrowOnly,
  pickRidsByFacilityNames,
  listTomorrowToEndOfNextMonth,
  splitTomorrowToEndOfNextMonth,
  splitFacilitiesByPart
} from "./util";
import { runCrawlCycle } from "./api_refresh";
import { yyyymmddKST, getKSTNow } from "./util";
import { dbRun } from "./db";
import { handleTestAlarm } from "./api_test_alarm.js";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

/* =========================
   23시 Priority 크롤
   ========================= */

async function priorityCrawl(env) {
  const hour = getKSTHour();
  if (hour !== 23) return;

  const raw = await env.CACHE.get("PRIORITY_FACILITY_NAMES");
  if (!raw) return;

  let names = [];
  try {
    names = JSON.parse(raw);
  } catch {
    return;
  }
  if (!names.length) return;

  const { facilities, jsessionid } = await fetchAllFacilities({
    concurrency: 4
  });

  const priorityRids = pickRidsByFacilityNames(facilities, names);
  if (!priorityRids.length) return;

  const dates = listTomorrowOnly();

  console.log("[PRIORITY]", {
    names,
    rids: priorityRids.length,
    dates
  });

  for (const rid of priorityRids) {
    for (const dateVal of dates) {
      const slots = await fetchTimesForRidDate({
        rid,
        dateVal,
        jsessionid
      });

      await dbRun(
        env,
        `
        INSERT INTO availability_cache (rid, date, slots_json, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(rid, date) DO UPDATE SET
          slots_json=excluded.slots_json,
          updated_at=excluded.updated_at
      `,
        [rid, dateVal, JSON.stringify(slots || [])]
      );
    }
  }
}

/* =========================
   일반 크롤 (시설 1/3 분할)
   ========================= */

async function normalCrawl(env) {
  const { facilities, jsessionid } = await fetchAllFacilities({
    concurrency: 6
  });

  // 🔁 2분 크론 기준 → part 자동 순환 (0,1,2)
  const part = Math.floor(Date.now() / (2 * 60 * 1000)) % 3;
  const myRids = splitFacilitiesByPart(facilities, part, 8);

  console.log("[NORMAL]", {
    part,
    totalFacilities: Object.keys(facilities).length,
    myFacilities: myRids.length
  });

  // 날짜 범위는 기존 refresh 로직에 맡김
  // (handleRefresh 내부에서 DAYS_AHEAD / 7일 판단)
  for (const rid of myRids) {
    await handleRefresh(null, env, null, {
      fromCron: true,
      limitToRid: rid
    });
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (path === "/api/data") {
      const res = await handleData(req, env);
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...corsHeaders }
      });
    }

    // 라우팅에 /api/vapid-public 추가
    if (path === "/api/data") {
      return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (path.startsWith("/api/alarm")) {
      const res = await handleAlarm(req, env);
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...corsHeaders }
      });
    }
    if (path === "/api/test_alarm") return handleTestAlarm(req, env);

    if (path === "/api/push/subscribe") {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: corsHeaders
        });
      }

      const res = await handlePushSubscribe(req, env);
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...corsHeaders }
      });
    }

    if (path === "/api/refresh") {
      const token = url.searchParams.get("token");
      if (token !== env.REFRESH_TOKEN) {
        return new Response("unauthorized", {
          status: 401,
          headers: corsHeaders
        });
      }
      return handleRefresh(req, env, ctx);
    }

    if (path === "/ping") {
      return new Response("pong", { headers: corsHeaders });
    }

    if (path === "/api/debug/state") {
      const state = await env.CACHE.get("CRAWL_STATE");
      return new Response(state || "no state");
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
  
  async scheduled(event, env, ctx) {
  ctx.waitUntil(runScheduledCrawl(env));
  }
};


async function runScheduledCrawl(env) {
  let state = await env.CACHE.get("CRAWL_STATE", { type: "json" });
  if (!state) {
    state = {
      phase: "FULL",
      facilityPart: 0,
      datePart: 0,
      fullDone: false,
      retry: 0,
      lastError: null,
      lastResetDate: null
    };
  }

  const nowKST = getKSTNow();
  const hour = nowKST.getHours();
  const today = yyyymmddKST(new Date());

  // ✅ 00시(하루 1회) DB 초기화 + FULL 재시작
  if (hour === 0 && state.lastResetDate !== today) {
    console.log("[DAILY RESET] start", { today });

    // availability_cache 전체 삭제 (요구한 “매일 초기화”)
    await dbRun(env, `DELETE FROM availability_cache`);

    // 인덱스/상태 초기화
    state.facilityPart = 0;
    state.datePart = 0;
    state.fullDone = false;
    state.retry = 0;
    state.lastError = null;
    state.lastResetDate = today;

    await env.CACHE.put("CRAWL_STATE", JSON.stringify(state));
  }

  // PHASE 결정
  if (hour === 23) {
    state.phase = "NIGHT";
  } else if (!state.fullDone) {
    state.phase = "FULL";
  } else {
    state.phase = "DELTA";
  }

  console.log("[CRON] start", {
    phase: state.phase,
    facilityPart: state.facilityPart,
    datePart: state.datePart,
    retry: state.retry
  });

  // 시설 목록 확보
  const { facilities } = await fetchAllFacilities({ concurrency: 4 });
  const allRids = Object.keys(facilities).sort();

  let targetRids = [];
  let targetDates = [];

  if (state.phase === "FULL") {
    targetRids = splitFacilitiesByPart(facilities, state.facilityPart, 10);
    const dateParts = splitTomorrowToEndOfNextMonth(10);
    targetDates = dateParts[state.datePart] || [];
  } else if (state.phase === "DELTA") {
  // ✅ DELTA도 시설을 분할해서 CPU Limit 방지
  // 1분 크론 기준: 10~15분할 추천 (시설 수에 따라 조정)
  const DELTA_PARTS = 10;

  targetRids = splitFacilitiesByPart(facilities, state.facilityPart, DELTA_PARTS);

  const allDates = listTomorrowToEndOfNextMonth();
  targetDates = allDates.slice(0, 3);

  // 로그로 확인하기 쉽게
  console.log("[DELTA] parts", {
    part: state.facilityPart,
    parts: DELTA_PARTS,
    rids: targetRids.length,
    dates: targetDates.length
  });
  }
 else {
    const raw = await env.CACHE.get("PRIORITY_FACILITY_NAMES");
    if (!raw) {
      console.log("[NIGHT] no priority facilities");
      return;
    }

    let names = [];
    try { names = JSON.parse(raw); } catch {
      console.error("[NIGHT] invalid PRIORITY_FACILITY_NAMES");
      return;
    }

    targetRids = allRids.filter(rid =>
      names.some(name => facilities[rid]?.title?.includes(name))
    );
    targetDates = listTomorrowOnly();
  }

  console.log("[CRAWL] target", { rids: targetRids.length, dates: targetDates.length });

  try {
    // ✅ 여기서 통합 파이프라인 실행: 크롤 → DB → KV → 알람
    const { fired } = await runCrawlCycle(env, {
      targetRids,
      targetDates,
      concurrency: 6
    });

    console.log("[ALARM] fired", fired);

    state.retry = 0;
    state.lastError = null;

    if (state.phase === "FULL") advanceIndexFull(state);
    else advanceIndexDelta(state);

  } catch (e) {
    state.retry = (state.retry || 0) + 1;
    state.lastError = e.message;

    console.error("[CRAWL] error", {
      phase: state.phase,
      facilityPart: state.facilityPart,
      datePart: state.datePart,
      retry: state.retry,
      error: e.message
    });

    if (state.retry >= 3 && (state.phase === "FULL" || state.phase === "DELTA")) {
      console.error("[CRAWL] skip part", { facilityPart: state.facilityPart, datePart: state.datePart });
      state.retry = 0;
      if (state.phase === "FULL") advanceIndexFull(state);
      else advanceIndexDelta(state);
    }

    await env.CACHE.put("CRAWL_STATE", JSON.stringify(state));
    return;
  }

  await env.CACHE.put("CRAWL_STATE", JSON.stringify(state));

  console.log("[CRON] done", {
    phase: state.phase,
    facilityPart: state.facilityPart,
    datePart: state.datePart,
    fullDone: state.fullDone
  });
}



function advanceIndexFull(state) {
  state.datePart++;
  if (state.datePart >= 10) {
    state.datePart = 0;
    state.facilityPart++;
  }
  if (state.facilityPart >= 10) {
    state.facilityPart = 0;
    state.fullDone = true;
  }
}

function advanceIndexDelta(state) {
  const DELTA_PARTS = 10; // 위에서 쓴 값과 동일하게 맞추기

  state.facilityPart = (state.facilityPart + 1) % DELTA_PARTS;
  state.datePart = 0; // DELTA에서는 사실상 고정이므로 0으로 유지

  // 시설 파트 한 바퀴 돌면 또 계속 감시하는 거니까 fullDone은 그대로 유지
}

