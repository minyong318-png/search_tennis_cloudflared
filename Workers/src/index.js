import { handleData } from "./api_data";
import { handleAlarm } from "./api_alarm";
import { handlePushSubscribe } from "./api_push";
import { handleRefresh } from "./api_refresh";
import { fetchAllFacilities, fetchTimesForRidDate } from "./crawler";
import {
  getKSTHour,
  listTomorrowOnly,
  pickRidsByFacilityNames,
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
  const myRids = splitFacilitiesByPart(facilities, part, 3);

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

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },

  async scheduled(event, env, ctx) {
    const hour = getKSTHour();

    // 🔥 23시는 priority만
    if (hour === 23) {
      ctx.waitUntil(priorityCrawl(env));
      return;
    }

    // 🔁 그 외 시간: 시설 1/3 분할 크롤
    ctx.waitUntil(normalCrawl(env));
  }
};
