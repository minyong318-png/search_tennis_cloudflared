const DB_BINDING = "yongin_tennis_db";

export async function dbAll(env, sql, params = []) {
  return env[DB_BINDING].prepare(sql).bind(...params).all();
}
export async function dbGet(env, sql, params = []) {
  return env[DB_BINDING].prepare(sql).bind(...params).first();
}
export async function dbRun(env, sql, params = []) {
  return env[DB_BINDING].prepare(sql).bind(...params).run();
}
