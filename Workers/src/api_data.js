import { json } from "./util";

export async function handleData(_req, env) {
  const raw = await env.CACHE.get("DATA_JSON");
  if (!raw) {
    return json({ facilities: {}, availability: {}, updated_at: null });
  }
  return new Response(raw, {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
