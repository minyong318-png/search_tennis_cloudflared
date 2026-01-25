export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export function getCourtGroup(title = "") {
  return title
    .replace(/\[.*?\]/g, "")
    .split("테니스장")[0]
    .trim();
}

export function buildCourtGroupMap(facilities) {
  const map = {};
  for (const [cid, info] of Object.entries(facilities || {})) {
    const group = getCourtGroup(info.title || "");
    if (!group) continue;
    map[group] ??= [];
    map[group].push(String(cid));
  }
  return map;
}

export function flattenSlots(facilities, availability) {
  const slots = [];
  for (const [cid, days] of Object.entries(availability || {})) {
    const title = facilities?.[cid]?.title || "";
    for (const [date, items] of Object.entries(days || {})) {
      for (const s of (items || [])) {
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

export function makeReserveLink(resveId) {
  const base = "https://publicsports.yongin.go.kr/publicsports/sports/selectFcltyRceptResveViewU.do";
  return `${base}?key=4236&resveId=${encodeURIComponent(resveId)}&pageUnit=8&pageIndex=1&checkSearchMonthNow=false`;
}

export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// 간단 동시성 제한
export async function pMap(items, concurrency, fn) {
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

export function kstNowISOString() {
  // KST = UTC+9
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString();
}

export function yyyymmddKST(date = new Date()) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}
