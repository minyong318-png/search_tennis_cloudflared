import { handleData } from "./api_data";
import { handleAlarm } from "./api_alarm";
import { handlePushSubscribe } from "./api_push";
import { handleRefresh } from "./api_refresh";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // 🔹 데이터 조회
    if (path === "/data") {
      return handleData(req, env);
    }

    // 🔹 알람 관련
    if (path.startsWith("/alarm")) {
      return handleAlarm(req, env);
    }

    // 🔹 푸시 구독
    if (path === "/api/push/subscribe") {
      return handlePushSubscribe(req, env);
    }

    // 🔹 수동 refresh (보안 토큰)
    if (path === "/api/refresh") {
      const token = url.searchParams.get("token");
      if (token !== env.REFRESH_TOKEN) {
        return new Response("unauthorized", { status: 401 });
      }
      return handleRefresh(req, env, ctx);
    }

    // 🔹 디버깅용 (지금 상태 확인)
    if (path === "/ping") {
      return new Response("pong");
    }

    return new Response("Not Found", { status: 404 });
  },

  // ⏱ cron 트리거
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleRefresh(null, env, ctx));
  }
};
