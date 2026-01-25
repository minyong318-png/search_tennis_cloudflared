var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/util.js
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function getCourtGroup(title = "") {
  return title.replace(/\[.*?\]/g, "").split("\uD14C\uB2C8\uC2A4\uC7A5")[0].trim();
}
__name(getCourtGroup, "getCourtGroup");
function buildCourtGroupMap(facilities) {
  const map = {};
  for (const [cid, info] of Object.entries(facilities || {})) {
    const group = getCourtGroup(info.title || "");
    if (!group) continue;
    map[group] ??= [];
    map[group].push(String(cid));
  }
  return map;
}
__name(buildCourtGroupMap, "buildCourtGroupMap");
function flattenSlots(facilities, availability) {
  const slots = [];
  for (const [cid, days] of Object.entries(availability || {})) {
    const title = facilities?.[cid]?.title || "";
    for (const [date, items] of Object.entries(days || {})) {
      for (const s of items || []) {
        const time = s.timeContent;
        if (!time) continue;
        slots.push({
          cid: String(cid),
          court_title: title,
          date: String(date),
          time: String(time),
          resveId: s.resveId || cid,
          key: `${cid}|${date}|${time}`
        });
      }
    }
  }
  return slots;
}
__name(flattenSlots, "flattenSlots");
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function pMap(items, concurrency, fn) {
  const ret = [];
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
}
__name(pMap, "pMap");
function kstNowISOString() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1e3);
  return now.toISOString();
}
__name(kstNowISOString, "kstNowISOString");
function yyyymmddKST(date = /* @__PURE__ */ new Date()) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1e3);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}
__name(yyyymmddKST, "yyyymmddKST");

// src/api_data.js
async function handleData(_req, env) {
  const raw = await env.CACHE.get("DATA_JSON");
  if (!raw) {
    return json({ facilities: {}, availability: {}, updated_at: null });
  }
  return new Response(raw, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    }
  });
}
__name(handleData, "handleData");

// src/db.js
var DB_BINDING = "yongin_tennis_db";
async function dbAll(env, sql, params = []) {
  return env[DB_BINDING].prepare(sql).bind(...params).all();
}
__name(dbAll, "dbAll");
async function dbGet(env, sql, params = []) {
  return env[DB_BINDING].prepare(sql).bind(...params).first();
}
__name(dbGet, "dbGet");
async function dbRun(env, sql, params = []) {
  return env[DB_BINDING].prepare(sql).bind(...params).run();
}
__name(dbRun, "dbRun");

// src/api_alarm.js
async function handleAlarm(req, env) {
  const url = new URL(req.url);
  if (url.pathname === "/api/alarm/add" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const subscription_id = body.subscription_id;
    const court_group = body.court_group;
    const date_raw = body.date;
    if (!subscription_id || !court_group || !date_raw) return json({ error: "invalid request" }, 400);
    const date = String(date_raw).replaceAll("-", "");
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
    const date = body.date;
    if (!subscription_id || !court_group || !date) return json({ error: "invalid request" }, 400);
    await dbRun(env, `
      DELETE FROM alarms
      WHERE subscription_id=? AND court_group=? AND date=?
    `, [subscription_id, court_group, date]);
    return json({ status: "deleted" });
  }
  return new Response("Not Found", { status: 404 });
}
__name(handleAlarm, "handleAlarm");

// src/api_push.js
async function handlePushSubscribe(req, env) {
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
__name(handlePushSubscribe, "handlePushSubscribe");

// src/crawler.js
var BASE_URL = "https://publicsports.yongin.go.kr/publicsports/sports/selectFcltyRceptResveListU.do";
var TIME_URL = "https://publicsports.yongin.go.kr/publicsports/sports/selectRegistTimeByChosenDateFcltyRceptResveApply.do";
var HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Referer": BASE_URL
};
async function fetchText(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...init.headers || {}, ...HEADERS } });
  return await res.text();
}
__name(fetchText, "fetchText");
async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...init.headers || {}, ...HEADERS } });
  return await res.json();
}
__name(fetchJson, "fetchJson");
function extractMaxPage(html) {
  const m = [...html.matchAll(/pageIndex=(\d+)/g)].map((x) => parseInt(x[1], 10)).filter((n) => Number.isFinite(n));
  return m.length ? Math.max(...m) : 1;
}
__name(extractMaxPage, "extractMaxPage");
function parseFacilities(html) {
  const blocks = html.split("reserve_box_item");
  const out = {};
  for (const b of blocks) {
    const rid = (b.match(/resveId=(\d+)/) || [])[1];
    if (!rid) continue;
    let title = "";
    let location = "";
    const titleMatch = b.match(/reserve_title[^>]*>([\s\S]*?)<\/div>/);
    if (titleMatch) {
      const raw = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      title = raw;
    }
    const locMatch = b.match(/reserve_position[^>]*>([\s\S]*?)<\/div>/);
    if (locMatch) {
      location = locMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (title && location) title = title.replace(location, "").trim();
    }
    out[rid] = { title: title || `\uC2DC\uC124 ${rid}`, location };
  }
  return out;
}
__name(parseFacilities, "parseFacilities");
function listDatesAhead(daysAhead) {
  const dates = [];
  const now = new Date(Date.now() + 9 * 60 * 60 * 1e3);
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1e3);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${y}${m}${dd}`);
  }
  return dates;
}
__name(listDatesAhead, "listDatesAhead");
async function fetchTimesForDate(rid, dateVal) {
  const body = new URLSearchParams({ dateVal, resveId: rid });
  try {
    const j = await fetchJson(TIME_URL, { method: "POST", body });
    const list = j?.resveTmList || [];
    return list.map((x) => ({
      timeContent: x.timeContent || x.resveTmNm || x.tmNm || "",
      resveId: rid
    })).filter((x) => x.timeContent);
  } catch {
    return [];
  }
}
__name(fetchTimesForDate, "fetchTimesForDate");
async function runCrawl({ daysAhead = 45, concurrency = 15 } = {}) {
  const baseParams = new URLSearchParams({
    searchFcltyFieldNm: "ITEM_01",
    pageUnit: "20",
    pageIndex: "1",
    checkSearchMonthNow: "false"
  });
  const firstHtml = await fetchText(`${BASE_URL}?${baseParams.toString()}`);
  const maxPage = extractMaxPage(firstHtml);
  const facilities = { ...parseFacilities(firstHtml) };
  const pages = [];
  for (let p = 2; p <= maxPage; p++) {
    const params = new URLSearchParams(baseParams);
    params.set("pageIndex", String(p));
    pages.push(`${BASE_URL}?${params.toString()}`);
  }
  const htmls = await pMap(pages, Math.min(concurrency, 10), async (u) => fetchText(u));
  for (const h of htmls) Object.assign(facilities, parseFacilities(h));
  const rids = Object.keys(facilities);
  const dates = listDatesAhead(daysAhead);
  const availability = {};
  for (const rid of rids) {
    const results = await pMap(dates, concurrency, async (dateVal) => {
      const slots = await fetchTimesForDate(rid, dateVal);
      return { dateVal, slots };
    });
    for (const { dateVal, slots } of results) {
      if (!slots || slots.length === 0) continue;
      availability[rid] ??= {};
      availability[rid][dateVal] = slots;
    }
  }
  return { facilities, availability };
}
__name(runCrawl, "runCrawl");

// src/webpush.js
function b64urlToBytes(b64url) {
  const pad = "=".repeat((4 - b64url.length % 4) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(b64urlToBytes, "b64urlToBytes");
function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return b64;
}
__name(bytesToB64url, "bytesToB64url");
function concatBytes(...arrs) {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
__name(concatBytes, "concatBytes");
function u16be(n) {
  return new Uint8Array([n >> 8 & 255, n & 255]);
}
__name(u16be, "u16be");
function textBytes(s) {
  return new TextEncoder().encode(s);
}
__name(textBytes, "textBytes");
function endpointAudience(endpoint) {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}
__name(endpointAudience, "endpointAudience");
async function hkdfExtract(saltBytes, ikmBytes) {
  const saltKey = await crypto.subtle.importKey("raw", saltBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = await crypto.subtle.sign("HMAC", saltKey, ikmBytes);
  return new Uint8Array(prk);
}
__name(hkdfExtract, "hkdfExtract");
async function hkdfExpand(prkBytes, infoBytes, length) {
  const prkKey = await crypto.subtle.importKey("raw", prkBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = new Uint8Array(length);
  let prev = new Uint8Array(0);
  let pos = 0;
  let counter = 1;
  while (pos < length) {
    const data = concatBytes(prev, infoBytes, new Uint8Array([counter]));
    const t = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, data));
    const take = Math.min(t.length, length - pos);
    out.set(t.slice(0, take), pos);
    pos += take;
    prev = t;
    counter++;
  }
  return out;
}
__name(hkdfExpand, "hkdfExpand");
async function encryptAes128Gcm({ subscription, payloadBytes }) {
  const clientPub = b64urlToBytes(subscription.keys.p256dh);
  const authSecret = b64urlToBytes(subscription.keys.auth);
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const serverKp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientKey },
    serverKp.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prkAuth = await hkdfExtract(authSecret, sharedSecret);
  const prk = await hkdfExpand(prkAuth, textBytes("Content-Encoding: auth\0"), 32);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKp.publicKey));
  const context = concatBytes(u16be(clientPub.length), clientPub, u16be(serverPubRaw.length), serverPubRaw);
  const cekInfo = concatBytes(textBytes("Content-Encoding: aes128gcm\0"), textBytes("P-256\0"), context);
  const nonceInfo = concatBytes(textBytes("Content-Encoding: nonce\0"), textBytes("P-256\0"), context);
  const prkSalt = await hkdfExtract(salt, prk);
  const cek = await hkdfExpand(prkSalt, cekInfo, 16);
  const nonce = await hkdfExpand(prkSalt, nonceInfo, 12);
  const plaintext = concatBytes(payloadBytes, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext)
  );
  return {
    ciphertext,
    salt,
    serverPubRaw
    // for Crypto-Key: dh=
  };
}
__name(encryptAes128Gcm, "encryptAes128Gcm");
async function createVapidAuthorization({ endpoint, env }) {
  const aud = endpointAudience(endpoint);
  const exp = Math.floor(Date.now() / 1e3) + 12 * 60 * 60;
  const sub = env.VAPID_SUBJECT?.startsWith("mailto:") ? env.VAPID_SUBJECT : `mailto:${env.VAPID_SUBJECT}`;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub };
  const enc = /* @__PURE__ */ __name((obj) => {
    const json2 = JSON.stringify(obj);
    return bytesToB64url(textBytes(json2));
  }, "enc");
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("Invalid VAPID_PUBLIC_KEY format");
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(x),
    y: bytesToB64url(y),
    d: env.VAPID_PRIVATE_KEY
    // already base64url
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sigDer = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textBytes(signingInput)));
  const sigJose = derToJose(sigDer, 64);
  const jwt = `${signingInput}.${bytesToB64url(sigJose)}`;
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}
__name(createVapidAuthorization, "createVapidAuthorization");
function derToJose(derSig, joseLen) {
  let i = 0;
  if (derSig[i++] !== 48) throw new Error("Invalid DER signature");
  const seqLen = derSig[i++];
  if (seqLen + 2 !== derSig.length && seqLen + 3 !== derSig.length) {
  }
  if (derSig[i++] !== 2) throw new Error("Invalid DER signature (r)");
  const rLen = derSig[i++];
  let r = derSig.slice(i, i + rLen);
  i += rLen;
  if (derSig[i++] !== 2) throw new Error("Invalid DER signature (s)");
  const sLen = derSig[i++];
  let s = derSig.slice(i, i + sLen);
  while (r.length > 1 && r[0] === 0) r = r.slice(1);
  while (s.length > 1 && s[0] === 0) s = s.slice(1);
  const half = joseLen / 2;
  const out = new Uint8Array(joseLen);
  out.set(r.length > half ? r.slice(-half) : r, half - Math.min(r.length, half));
  out.set(s.length > half ? s.slice(-half) : s, joseLen - Math.min(s.length, half));
  return out;
}
__name(derToJose, "derToJose");
async function sendWebPush({ subscription, title, body, ttl = 60, env }) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Invalid subscription object");
  }
  if (!env?.VAPID_PRIVATE_KEY || !env?.VAPID_PUBLIC_KEY || !env?.VAPID_SUBJECT) {
    throw new Error("Missing VAPID env vars (VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT)");
  }
  const payloadObj = { title, body };
  const payloadBytes = textBytes(JSON.stringify(payloadObj));
  const { ciphertext, salt, serverPubRaw } = await encryptAes128Gcm({ subscription, payloadBytes });
  const authorization = await createVapidAuthorization({ endpoint: subscription.endpoint, env });
  const cryptoKey = `dh=${bytesToB64url(serverPubRaw)}; p256ecdsa=${env.VAPID_PUBLIC_KEY}`;
  const encryption = `salt=${bytesToB64url(salt)}`;
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: String(ttl),
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Crypto-Key": cryptoKey,
      "Encryption": encryption,
      "Authorization": authorization
    },
    body: ciphertext
  });
  return res;
}
__name(sendWebPush, "sendWebPush");

// src/api_refresh.js
async function cleanupOld(env) {
  const today = yyyymmddKST(/* @__PURE__ */ new Date());
  await dbRun(env, `DELETE FROM alarms WHERE date < ?`, [today]);
  await dbRun(env, `DELETE FROM baseline_slots WHERE date < ?`, [today]);
  await dbRun(env, `DELETE FROM sent_slots WHERE sent_at < datetime('now','-1 day')`);
}
__name(cleanupOld, "cleanupOld");
async function sendPush(env, subscription, title, body) {
  const res = await sendWebPush({
    subscription,
    title,
    body,
    ttl: 60,
    env
  });
  if (res.status === 410 || res.status === 404) {
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`WebPush failed: ${res.status} ${txt}`);
  }
}
__name(sendPush, "sendPush");
async function handleRefresh(req, env, ctx, opts = {}) {
  const fromCron = opts.fromCron === true || !req;
  let url = null;
  if (req) {
    url = new URL(req.url);
  }
  if (!fromCron) {
    const token = url.searchParams.get("token");
    if (!token || token !== env.REFRESH_TOKEN) {
      return new Response("forbidden", { status: 403 });
    }
  }
  console.log("[REFRESH] start", fromCron ? "cron" : "manual");
  await cleanupOld(env);
  const daysAhead = parseInt(env.DAYS_AHEAD || "45", 10);
  const concurrency = parseInt(env.CONCURRENCY || "15", 10);
  const { facilities, availability } = await runCrawl({ daysAhead, concurrency });
  console.log(
    "[REFRESH] crawl result",
    Object.keys(facilities).length,
    Object.keys(availability).length
  );
  const updated_at = kstNowISOString();
  const payload = JSON.stringify({ facilities, availability, updated_at });
  await env.CACHE.put("DATA_JSON", payload, { expirationTtl: 120 });
  console.log("[REFRESH] cache updated");
  const alarms = await dbAll(env, `SELECT subscription_id, court_group, date FROM alarms`);
  if (!alarms.results?.length) return fromCron ? void 0 : new Response("ok");
  const subs = await dbAll(env, `SELECT * FROM push_subscriptions`);
  const subsMap = {};
  for (const s of subs.results || []) {
    subsMap[s.id] = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth }
    };
  }
  const courtGroupMap = buildCourtGroupMap(facilities);
  const currentSlots = flattenSlots(facilities, availability);
  let fired = 0;
  for (const alarm of alarms.results) {
    const subscription_id = alarm.subscription_id;
    const group = alarm.court_group;
    const date = alarm.date;
    const groupCids = courtGroupMap[group] || [];
    if (!groupCids.length) continue;
    const baselineRows = await dbAll(env, `
      SELECT time_content
      FROM baseline_slots
      WHERE subscription_id=? AND court_group=? AND date=?
    `, [subscription_id, group, date]);
    const baseline = new Set((baselineRows.results || []).map((r) => r.time_content));
    if (baseline.size === 0) {
      const times = new Set(
        currentSlots.filter((s) => groupCids.includes(s.cid) && s.date === date).map((s) => s.time)
      );
      for (const t of times) {
        await dbRun(env, `
          INSERT INTO baseline_slots (subscription_id, court_group, date, time_content)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(subscription_id, court_group, date, time_content) DO NOTHING
        `, [subscription_id, group, date, t]);
      }
      continue;
    }
    for (const slot of currentSlots) {
      if (!groupCids.includes(slot.cid)) continue;
      if (slot.date !== date) continue;
      if (baseline.has(slot.time)) continue;
      const sub = subsMap[subscription_id];
      if (!sub) continue;
      const slot_key = `${group}|${date}|${slot.time}`;
      const already = await dbGet(env, `
        SELECT 1 FROM sent_slots WHERE subscription_id=? AND slot_key=? LIMIT 1
      `, [subscription_id, slot_key]);
      if (already) continue;
      await sendPush(env, sub, "\u{1F3BE} \uC608\uC57D \uAC00\uB2A5 \uC54C\uB9BC", `${group} ${date} ${slot.time}`);
      fired++;
      await dbRun(env, `
        INSERT INTO baseline_slots (subscription_id, court_group, date, time_content)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(subscription_id, court_group, date, time_content) DO NOTHING
      `, [subscription_id, group, date, slot.time]);
      await dbRun(env, `
        INSERT INTO sent_slots (subscription_id, slot_key)
        VALUES (?, ?)
        ON CONFLICT(subscription_id, slot_key) DO NOTHING
      `, [subscription_id, slot_key]);
      baseline.add(slot.time);
      console.log("[REFRESH] start", (/* @__PURE__ */ new Date()).toISOString());
      console.log(
        "[REFRESH] crawl result",
        Object.keys(facilities).length,
        Object.keys(availability).length
      );
      await env.CACHE.put("DATA_JSON", payload, { expirationTtl: 120 });
      console.log("[REFRESH] cache updated");
    }
  }
  return fromCron ? void 0 : json({ status: "ok", fired });
}
__name(handleRefresh, "handleRefresh");

// src/index.js
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
var index_default = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
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
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
