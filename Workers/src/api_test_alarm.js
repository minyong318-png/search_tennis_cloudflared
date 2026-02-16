// Workers/src/api_test_alarm.js
import { dbGet } from "./db.js";
import { sendWebPush } from "./webpush.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// GET /api/test_alarm?token=...&subscription_id=...
// GET /api/test_alarm?token=...           (subscription_id 없으면 최신 구독으로 전송)
export async function handleTestAlarm(request, env) {
  try {
    const url = new URL(request.url);
    console.log("[WORKER VAPID_PUBLIC_KEY head]", (env.VAPID_PUBLIC_KEY || "").trim().slice(0, 30));

    const token = url.searchParams.get("token");
    if (!token || token !== env.REFRESH_TOKEN) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const subscriptionId = url.searchParams.get("subscription_id");

    let row;
    if (subscriptionId) {
      row = await dbGet(
        env,
        `SELECT id, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE id = ?`,
        [subscriptionId]
      );
    } else {
      row = await dbGet(
        env,
        `SELECT id, endpoint, p256dh, auth
         FROM push_subscriptions
         ORDER BY rowid DESC
         LIMIT 1`
      );
    }

    if (!row) {
      return json({ ok: false, error: "subscription not found" }, 404);
    }

    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };

    const debug = {
      p256dh_len: (row.p256dh || "").length,
      auth_len: (row.auth || "").length,
      endpoint_head: (row.endpoint || "").slice(0, 40),
    };

    const title = "테스트 알람";
    const body = `TEST PUSH ${Date.now()} (sub=${row.id})`;

    const res = await sendWebPush({ subscription, title, body, ttl: 60, env });

    // ✅ 여기서 body는 한 번만 읽기
    const respText = await res.text().catch(() => "");

    console.log("[TEST_ALARM] send done", {
      status: res.status,
      statusText: res.statusText,
      endpointHead: subscription.endpoint.slice(0, 35),
      respBodyHead: respText.slice(0, 200),
    });

    if (!res.ok) {
      return json(
        { ok: false, status: res.status, statusText: res.statusText, body: respText, debug },
        500
      );
    }

    return json({ ok: true, status: res.status, subId: row.id, debug });
  } catch (e) {
    console.error("[TEST_ALARM] ERROR", e?.stack || e?.message || String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
}

