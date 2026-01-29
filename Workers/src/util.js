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
  const base =
    "https://publicsports.yongin.go.kr/publicsports/sports/selectFcltyRceptResveViewU.do";
  return `${base}?key=4236&resveId=${encodeURIComponent(
    resveId
  )}&pageUnit=8&pageIndex=1&checkSearchMonthNow=false`;
}

export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// 간단 동시성 제한
export async function pMap(items, concurrency, fn) {
  const ret = [];
  let i = 0;
  const workers = Array.from(
    { length: Math.max(1, concurrency) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        ret[idx] = await fn(items[idx], idx);
      }
    }
  );
  await Promise.all(workers);
  return ret;
}

/* =========================
   🔥 추가된 유틸 (핵심)
   ========================= */

// KST 현재 시각
export function getKSTNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

export function getKSTHour() {
  return getKSTNow().getHours();
}

// 내일 하루만 (YYYYMMDD 배열 1개)
export function listTomorrowOnly() {
  const now = getKSTNow();
  const t = new Date(now);
  t.setDate(t.getDate() + 1);

  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");

  return [`${y}${m}${d}`];
}
export function splitFacilitiesByPart(facilities, part, totalParts = 3) {
  const rids = Object.keys(facilities || {}).sort();
  if (rids.length === 0) return [];

  const size = Math.ceil(rids.length / totalParts);
  const start = part * size;
  const end = Math.min(start + size, rids.length);

  return rids.slice(start, end);
}

// 시설명 목록 → 해당되는 모든 rid 선택
export function pickRidsByFacilityNames(facilities, nameList) {
  if (!facilities || !Array.isArray(nameList) || nameList.length === 0) {
    return [];
  }

  const rids = [];
  for (const [rid, info] of Object.entries(facilities)) {
    const title = info?.title || "";
    for (const name of nameList) {
      if (title.includes(name)) {
        rids.push(String(rid));
        break;
      }
    }
  }
  return [...new Set(rids)];
}

/* =========================
   🔧 기존 코드 호환용 export
   ========================= */

// api_refresh.js에서 사용 중
export function kstNowISOString() {
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

export function pickWorkSlice({ rids, dates, part, totalParts }) {
  const work = [];

  let idx = 0;
  for (const rid of rids) {
    for (const date of dates) {
      if (idx % totalParts === part) {
        work.push({ rid, date });
      }
      idx++;
    }
  }

  return work;
}

export function splitDatesAhead(days, totalParts = 10) {
  const dates = [];
  const now = getKSTNow();

  for (let i = 1; i <= days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${dd}`);
  }

  const size = Math.ceil(dates.length / totalParts);
  return Array.from({ length: totalParts }, (_, i) =>
    dates.slice(i * size, (i + 1) * size)
  );
}

export function listTomorrowToEndOfNextMonth() {
  const dates = [];

  // KST 기준
  const now = getKSTNow();

  // 시작: 내일
  const start = new Date(now);
  start.setDate(start.getDate() + 1);

  // 끝: 다음 달 말일
  const end = new Date(now);
  end.setMonth(end.getMonth() + 2, 0); // 다음달의 0일 = 다음달 말일

  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${d}`);
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
}


export function splitTomorrowToEndOfNextMonth(totalParts = 10) {
  const all = listTomorrowToEndOfNextMonth();
  const size = Math.ceil(all.length / totalParts);

  return Array.from({ length: totalParts }, (_, i) =>
    all.slice(i * size, (i + 1) * size)
  );
}
