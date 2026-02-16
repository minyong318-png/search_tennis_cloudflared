import { json } from "./util";
import { dbRun } from "./db";
import { sha256Hex } from "./util";

export async function handlePushSubscribe(req, env) {
  const sub = await req.json().catch(() => null);
  if (!sub) return json({ error: "no subscription" }, 400);

  const endpoint = sub.endpoint;
  const keys = sub.keys || {};
  const p256dh = keys.p256dh;
  const auth = keys.auth;

  if (!endpoint || !p256dh || !auth)
    return json({ error: "invalid subscription" }, 400);

  const subscription_id = await sha256Hex(endpoint);

  await dbRun(
    env,
    `
    INSERT INTO push_subscriptions (id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      endpoint=excluded.endpoint,
      p256dh=excluded.p256dh,
      auth=excluded.auth
  `,
    [subscription_id, endpoint, p256dh, auth]
  );

  return json({ subscription_id });
}

export async function handlePushDebug(request, env) {
  const body = await request.json().catch(() => ({}));
  console.log("[PUSH DEBUG]", body);
  return new Response("ok");
}

