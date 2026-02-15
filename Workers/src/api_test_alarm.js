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
    // 최신 구독 1개로 테스트 (테스트 편의)
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

  const title = "🧪 테스트 알람";
  const body = `test_alarm ok (sub=${row.id}) @ ${new Date().toISOString()}`;

  // webpush.js 시그니처에 맞게 호출 :contentReference[oaicite:2]{index=2}
  const res = await sendWebPush({
    subscription,
    title,
    body,
    ttl: 60,
    env,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return json(
      { ok: false, status: res.status, statusText: res.statusText, body: text },
      500
    );
  }

  return json({ ok: true, status: res.status, subId: row.id });
}
