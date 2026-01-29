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
import { dbRun } from "./db";


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

    if (path.startsWith("/api/alarm")) {
      const res = await handleAlarm(req, env);
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...corsHeaders }
      });
    }

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
  // 1️⃣ 상태 로드 (없으면 초기화)
  let state = await env.CACHE.get("CRAWL_STATE", { type: "json" });
  if (!state) {
    state = {
      phase: "FULL",
      facilityPart: 0,
      datePart: 0,
      fullDone: false,
      retry: 0,
      lastError: null
    };
  }

  const hour = getKSTHour();

  // 2️⃣ PHASE 결정
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

  // 3️⃣ 시설 목록 확보
  const { facilities } = await fetchAllFacilities({ concurrency: 4 });
  const allRids = Object.keys(facilities).sort();

  let targetRids = [];
  let targetDates = [];

  // 4️⃣ PHASE별 대상 계산
  if (state.phase === "FULL") {
    // 시설 10분할
    targetRids = splitFacilitiesByPart(
      facilities,
      state.facilityPart,
      10
    );

    const dateParts = splitTomorrowToEndOfNextMonth(10);
    targetDates = dateParts[state.datePart] || [];

  } else if (state.phase === "DELTA") {
    // 모든 시설 + 최근 3일
    targetRids = allRids;
    const allDates = listTomorrowToEndOfNextMonth();
    targetDates = allDates.slice(0, 3); // 내일 기준 3일


  } else {
    // NIGHT: 지정 시설 + 내일
    const raw = await env.CACHE.get("PRIORITY_FACILITY_NAMES");
    if (!raw) {
      console.log("[NIGHT] no priority facilities");
      return;
    }

    let names = [];
    try {
      names = JSON.parse(raw);
    } catch {
      console.error("[NIGHT] invalid PRIORITY_FACILITY_NAMES");
      return;
    }

    targetRids = allRids.filter(rid =>
      names.some(name =>
        facilities[rid]?.title?.includes(name)
      )
    );

    targetDates = listTomorrowOnly();
  }

  console.log("[CRAWL] target", {
    rids: targetRids.length,
    dates: targetDates.length
  });

  // 5️⃣ 실제 크롤 + 재시도 제어
  try {
    for (const rid of targetRids) {
      for (const dateVal of targetDates) {
        const slots = await fetchTimesForRidDate({
          rid,
          dateVal
        });

        if (!Array.isArray(slots)) {
          throw new Error(`Invalid slots for rid=${rid} date=${dateVal}`);
        }

        await dbRun(
          env,
          `
          INSERT INTO availability_cache (rid, date, slots_json, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(rid, date) DO UPDATE SET
            slots_json=excluded.slots_json,
            updated_at=excluded.updated_at
        `,
          [rid, dateVal, JSON.stringify(slots)]
        );
      }
    }

    // ✅ 성공 시
    state.retry = 0;
    state.lastError = null;

    if(state.phase === "FULL") {
      advanceIndexFull(state);
      }
      else{
      advanceIndexDelta(state);
      }

  } catch (e) {
    // ❌ 실패 시
    state.retry = (state.retry || 0) + 1;
    state.lastError = e.message;

    console.error("[CRAWL] error", {
      phase: state.phase,
      facilityPart: state.facilityPart,
      datePart: state.datePart,
      retry: state.retry,
      error: e.message
    });

    // 3회 실패 시 해당 part 스킵
    if (state.retry >= 3 && (state.phase === "FULL" || state.phase === "DELTA")) {
      console.error("[CRAWL] skip part", {
        facilityPart: state.facilityPart,
        datePart: state.datePart
      });

      state.retry = 0;
      if(state.phase === "FULL") {
      advanceIndexFull(state);
      }
      else{
      advanceIndexDelta(state);
      }
    }

    await env.CACHE.put("CRAWL_STATE", JSON.stringify(state));
    return; // ⛔ 실패 시 여기서 종료
  }

  // 6️⃣ 상태 저장
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
  state.facilityPart++;

  if (state.facilityPart >= 3) {
    state.facilityPart = 0;
    state.datePart = (state.datePart + 1) % 3;
  }
}
