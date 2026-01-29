import { json } from "./util";
import { dbAll, dbRun } from "./db";

/**
 * /api/alarm
 *
 * POST /api/alarm/add
 * GET  /api/alarm/list?subscription_id=xxx
 * POST /api/alarm/delete
 */
export async function handleAlarm(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;

  /* =========================
     CORS Preflight
     ========================= */
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  /* =========================
     알람 추가
     POST /api/alarm/add
     ========================= */
  if (path === "/api/alarm/add" && req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }

    const { subscription_id, court_group, date } = body;

    if (!subscription_id || !court_group || !date) {
      return json({ error: "missing field" }, 400);
    }

    // YYYY-MM-DD → YYYYMMDD
    const yyyymmdd = String(date).replaceAll("-", "");

    await dbRun(
      env,
      `
      INSERT INTO alarms (subscription_id, court_group, date)
      VALUES (?, ?, ?)
      ON CONFLICT(subscription_id, court_group, date) DO NOTHING
      `,
      [subscription_id, court_group, yyyymmdd]
    );

    return json({ status: "added" });
  }

  /* =========================
     알람 목록
     GET /api/alarm/list
     ========================= */
  if (path === "/api/alarm/list" && req.method === "GET") {
    const subscription_id = url.searchParams.get("subscription_id");
    if (!subscription_id) {
      return json([]);
    }

    const rows = await dbAll(
      env,
      `
      SELECT court_group, date, created_at
      FROM alarms
      WHERE subscription_id = ?
      ORDER BY created_at DESC
      `,
      [subscription_id]
    );

    return json(rows.results || []);
  }

  /* =========================
     알람 삭제
     POST /api/alarm/delete
     ========================= */
  if (path === "/api/alarm/delete" && req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }

    const { subscription_id, court_group, date } = body;

    if (!subscription_id || !court_group || !date) {
      return json({ error: "missing field" }, 400);
    }

    await dbRun(
      env,
      `
      DELETE FROM alarms
      WHERE subscription_id = ?
        AND court_group = ?
        AND date = ?
      `,
      [subscription_id, court_group, date]
    );

    return json({ status: "deleted" });
  }

  /* =========================
     Not Found
     ========================= */
  return new Response("Not Found", { status: 404 });
}
