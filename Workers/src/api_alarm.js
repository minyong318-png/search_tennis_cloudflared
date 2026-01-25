import { json } from "./util";
import { dbAll, dbRun } from "./db";

export async function handleAlarm(req, env) {
  const url = new URL(req.url);

  if (url.pathname === "/api/alarm/add" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const subscription_id = body.subscription_id;
    const court_group = body.court_group;
    const date_raw = body.date; // YYYY-MM-DD

    if (!subscription_id || !court_group || !date_raw) return json({ error: "invalid request" }, 400);
    const date = String(date_raw).replaceAll("-", ""); // YYYYMMDD

    const r = await env.DB.prepare(`
      INSERT INTO alarms (subscription_id, court_group, date)
      VALUES (?, ?, ?)
      ON CONFLICT(subscription_id, court_group, date) DO NOTHING
    `).bind(subscription_id, court_group, date).run();

    if (r.changes === 0) return json({ status: "duplicate" });
    return json({ status: "added" });
  }

  if (url.pathname === "/api/alarm/list" && req.method === "GET") {
    const subscription_id = url.searchParams.get("subscription_id");
    if (!subscription_id) return json([]);

    const rows = await dbAll(env, `
      SELECT court_group, date, created_at
      FROM alarms
      WHERE subscription_id = ?
      ORDER BY created_at DESC
    `, [subscription_id]);

    return json(rows.results || []);
  }

  if (url.pathname === "/api/alarm/delete" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const subscription_id = body.subscription_id;
    const court_group = body.court_group;
    const date = body.date; // YYYYMMDD (프론트에서 그대로 내려옴)

    if (!subscription_id || !court_group || !date) return json({ error: "invalid request" }, 400);

    await dbRun(env, `
      DELETE FROM alarms
      WHERE subscription_id=? AND court_group=? AND date=?
    `, [subscription_id, court_group, date]);

    return json({ status: "deleted" });
  }

  return new Response("Not Found", { status: 404 });
}
