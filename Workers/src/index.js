import { handleData } from "./api_data";
import { handleAlarm } from "./api_alarm";
import { handlePushSubscribe } from "./api_push";
import { handleRefresh } from "./api_refresh";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // 🔥 CORS preflight (최상단, 단 한 번)
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
    ctx.waitUntil(handleRefresh(null, env, ctx, { fromCron: true }));
  }
};
