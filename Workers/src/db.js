export async function dbAll(env, sql, params = []) {
  return env.DB.prepare(sql).bind(...params).all();
}

export async function dbGet(env, sql, params = []) {
  return env.DB.prepare(sql).bind(...params).first();
}

export async function dbRun(env, sql, params = []) {
  return env.DB.prepare(sql).bind(...params).run();
}
