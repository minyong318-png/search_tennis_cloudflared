export const SUPABASE_URL = "https://fqrvdwfyemdpalvtvccl.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxcnZkd2Z5ZW1kcGFsdnR2Y2NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDk5MDYsImV4cCI6MjA4MzgyNTkwNn0.qHPjTARomfJ6fbz7vQy--C6RFclVXLbM8mxQ-ov0wp0";

export const CITY_LABELS = {
  yongin: "용인",
  goyang: "고양",
  suwon: "수원",
  seongnam: "성남",
  anyang: "안양",
  paju: "파주",
  hanam: "하남",
  uiwang: "의왕",
  incheon: "인천"
};

export const CITY_KEYS = Object.keys(CITY_LABELS);
export const UNKNOWN_DISTRICT = "구 정보 없음";
export const DEFAULT_HOURS = { start: 7, end: 22 };
export const CITY_HOURS = {
  yongin: { start: 6, end: 22 },
  goyang: { start: 6, end: 22 },
  anyang: { start: 7, end: 22 },
  paju: { start: 7, end: 22 }
};

export async function fetchCourtData(daysAhead = 45) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_data`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ p_days_ahead: daysAhead })
  });
  if (!response.ok) throw new Error(`Supabase data load failed: ${response.status}`);
  return response.json();
}

export function todayKst(offset = 0) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  now.setDate(now.getDate() + offset);
  return toInputDate(now);
}

export function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function compactDate(dateText) {
  const date = ymd(dateText);
  if (date.length !== 8) return "-";
  return `${Number(date.slice(4, 6))}.${Number(date.slice(6, 8))}`;
}

export function weekday(dateText) {
  const d = ymd(dateText);
  if (d.length !== 8) return "";
  return ["일", "월", "화", "수", "목", "금", "토"][
    new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8))).getDay()
  ];
}

export function ymd(dateText = "") {
  return String(dateText || "").replaceAll("-", "");
}

export function cityOfFacilityId(id) {
  id = String(id || "");
  if (id.startsWith("anseong:") || id.startsWith("ggshare:anseong")) return "";
  if (id.startsWith("ggshare:")) {
    const city = id.slice("ggshare:".length).split("-", 1)[0] || "";
    return CITY_LABELS[city] ? city : "";
  }
  for (const city of CITY_KEYS) if (id.startsWith(`${city}:`)) return city;
  return /^\d+$/.test(id) ? "yongin" : "";
}

export function activeHours(city) {
  const range = CITY_HOURS[city] || DEFAULT_HOURS;
  const start = Number.isFinite(range.start) ? range.start : DEFAULT_HOURS.start;
  const end = Number.isFinite(range.end) ? range.end : DEFAULT_HOURS.end;
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => i + start);
}

export function normalizeFilterText(value) {
  return String(value || "")
    .trim()
    .replace(/[\/|_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ko-KR");
}

export function getCourtGroup(title, city) {
  const t = String(title || "").replace(/\[.*?\]/g, "").trim();
  if (city === "goyang") return t.replace(/고양\s*(특례시)?\s*테니스협회/g, "").replace(/^고양\s+/, "").replace(/\s*\d+\s*코트\s*$/, "").replace(/\s*테니스장\s*$/, "").replace(/\s*코트\s*$/, "").replace(/\s+/g, " ").trim() || t;
  if (city === "seongnam") return t.replace(/\s*\([^)]*\)/g, "").replace(/\s*당일예약\s*/g, " ").replace(/\s*반쪽\s*코트.*$/, "").replace(/\s*\d+\s*번?\s*코트.*$/, "").replace(/\s*테니스장\s*$/, "").trim() || t;
  if (city === "uiwang" && /청계체육공원/.test(t)) return "청계체육공원";
  if (city === "hanam") return t.replace(/^하남국민체육센터\s*/, "").replace(/\s*\d+\s*(?:코트|면)\s*$/, "").trim() || t;
  if (city === "anyang" || city === "paju") return t.replace(/\s*\d+\s*코트\s*$/, "").replace(/\s*테니스장\s*$/, "").trim() || t;
  return t
    .replace(/[_-]?\s*\d{1,2}월.*$/i, "")
    .replace(/\s*\(?유료\)?\s*/g, " ")
    .replace(/\s*\(?[A-Z]\s*존\)?\s*/gi, " ")
    .replace(/\s*\(?장애인\s*코트\)?\s*/g, " ")
    .replace(/\s*\(?\d+[\s.·_-]*(?:번)?\s*코트\)?\s*/gi, " ")
    .replace(/\s*\(?[A-Z][\s.·_-]*(?:번)?\s*코트\)?\s*/gi, " ")
    .replace(/\s*\d+[\s.·_-]*(?:번)?\s*코트\s*$/i, "")
    .replace(/\s*[A-Z][\s.·_-]*(?:번)?\s*코트\s*$/i, "")
    .replace(/\s*테니스장\s*$/, "")
    .replace(/\s+/g, " ")
    .trim() || t;
}

export function explicitCourtLabel(title, courtGroup) {
  const text = String(title || "");
  if (courtGroup === "청계체육공원") {
    const cheonggye = text.match(/(\d+)\s*번?.*코트/);
    if (cheonggye) return `${Number(cheonggye[1])}코트`;
  }
  const numbered = text.match(/(\d+)[\s.·_-]*(?:번)?\s*(?:코트|면)/);
  if (numbered) return `${Number(numbered[1])}코트`;
  if (/장애인\s*코트/.test(text)) return "장애인코트";
  const lettered = text.match(/([A-Z])[\s.·_-]*(?:번)?\s*코트/i);
  if (lettered) return `${lettered[1].toUpperCase()}코트`;
  return "";
}

export function districtFromFacility(fac) {
  const direct = fac?.district || fac?.gu || fac?.sigungu || fac?.area || fac?.region;
  if (direct) return String(direct).trim();
  const haystack = [fac?.location, fac?.address, fac?.addr, fac?.title].filter(Boolean).join(" ");
  const match = haystack.match(/([가-힣A-Za-z0-9]+(?:구|군|읍|면|동))/);
  return match ? match[1] : UNKNOWN_DISTRICT;
}

export function slotRange(slot) {
  const matches = [...String(slot?.timeContent || "").matchAll(/(\d{1,2}):(\d{2})/g)];
  if (!matches.length) return null;
  const start = Number(matches[0][1]) * 60 + Number(matches[0][2]);
  const end = matches[1] ? Number(matches[1][1]) * 60 + Number(matches[1][2]) : start + 60;
  return { start, end: end <= start ? end + 1440 : end };
}

export function firstTime(slot) {
  const m = String(slot?.timeContent || "").match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, "0") : "";
}

export function slotHour(slot) {
  const t = firstTime(slot);
  return t ? Number(t.slice(0, 2)) : null;
}

export function slotMatches(slot, hourFilter = "", timeMode = "contains") {
  if (!hourFilter) return true;
  const range = slotRange(slot);
  if (!range) return true;
  const target = Number(hourFilter) * 60;
  if (timeMode === "after") return range.start >= target;
  if (timeMode === "before") return range.start < target;
  return target >= range.start && target < range.end;
}

export function reserveHref(cid, slot) {
  const raw = slot?.reserveUrl || slot?.url || "";
  if (raw) return raw;
  const slotCid = slot?._cid || cid;
  if (String(slotCid).startsWith("yongin:") || slot?.resveId) {
    const id = slot?.resveId || String(slotCid).split(":")[1];
    return `https://publicsports.yongin.go.kr/publicsports/sports/selectFcltyRceptResveViewU.do?key=4236&resveId=${encodeURIComponent(id)}&pageUnit=8&pageIndex=1&checkSearchMonthNow=false`;
  }
  return "";
}

export function buildCourtOptions(data, city) {
  const groups = new Map();
  const raw = Object.entries(data?.facilities || {})
    .filter(([, fac]) => fac?.title)
    .filter(([cid]) => cityOfFacilityId(cid) === city)
    .map(([cid, fac]) => ({ cid, fac, courtGroup: getCourtGroup(fac.title, city) }));
  raw.forEach(({ cid, fac, courtGroup }) => {
    const district = districtFromFacility(fac);
    if (!groups.has(courtGroup)) {
      groups.set(courtGroup, {
        value: courtGroup,
        label: courtGroup,
        facilityName: courtGroup,
        city,
        district,
        courtIds: [],
        locations: new Set(),
        searchParts: new Set([courtGroup, district])
      });
    }
    const group = groups.get(courtGroup);
    group.courtIds.push(String(cid));
    if (fac.location || fac.address || fac.title) group.locations.add(fac.location || fac.address || fac.title);
    [fac.location, fac.address, fac.title].filter(Boolean).forEach((text) => group.searchParts.add(text));
  });
  return [...groups.values()].map((group) => ({
      value: group.value,
      label: group.label,
      city,
      district: group.district,
      facilityName: group.facilityName,
      courtIds: group.courtIds,
      courtCount: group.courtIds.length,
      locationText: [...group.locations][0] || "",
      searchText: normalizeFilterText([...group.searchParts].join(" "))
    }))
    .sort((a, b) => a.facilityName.localeCompare(b.facilityName, "ko", { numeric: true }));
}

export function collectCourtRows(data, filters, favorites = new Set()) {
  const city = filters.city;
  const date = ymd(filters.date);
  const selectedCourtGroups = new Set(filters.courtGroups || []);
  const facilities = Object.entries(data?.facilities || {})
    .filter(([, fac]) => fac?.title)
    .filter(([cid]) => cityOfFacilityId(cid) === city)
    .filter(([, fac]) => !filters.district || districtFromFacility(fac) === filters.district)
    .map(([cid, fac]) => ({ cid, fac, courtGroup: getCourtGroup(fac.title, city) }))
    .filter((item) => !selectedCourtGroups.size || selectedCourtGroups.has(item.courtGroup))
    .sort((a, b) => a.courtGroup.localeCompare(b.courtGroup, "ko") || String(a.fac.title).localeCompare(String(b.fac.title), "ko") || a.cid.localeCompare(b.cid));

  const groupSizes = new Map();
  facilities.forEach((item) => groupSizes.set(item.courtGroup, (groupSizes.get(item.courtGroup) || 0) + 1));
  const groupSeen = new Map();
  const buckets = new Map();

  facilities.forEach(({ cid, fac, courtGroup }) => {
    const index = (groupSeen.get(courtGroup) || 0) + 1;
    groupSeen.set(courtGroup, index);
    const courtLabel = explicitCourtLabel(fac.title, courtGroup) || (groupSizes.get(courtGroup) > 1 ? `${index}코트` : "");
    if (!buckets.has(courtGroup)) {
      buckets.set(courtGroup, {
        cid,
        fac,
        courtGroup,
        district: districtFromFacility(fac),
        locations: new Set(),
        labels: new Set(),
        slots: [],
        byHour: new Map(),
        count: 0,
        first: "99:99",
        favorite: favorites.has(`${city}|${courtGroup}`)
      });
    }
    const row = buckets.get(courtGroup);
    if (fac.location) row.locations.add(fac.location);
    if (courtLabel) row.labels.add(courtLabel);
    const slots = ((data?.availability?.[cid]?.[date]) || [])
      .filter((slot) => slot?.timeContent)
      .filter((slot) => slotMatches(slot, filters.hour, filters.timeMode));
    slots.forEach((slot) => {
      const enriched = { ...slot, _cid: cid, _fac: fac, _courtLabel: courtLabel };
      const hour = slotHour(slot);
      row.slots.push(enriched);
      if (hour !== null) {
        if (!row.byHour.has(hour)) row.byHour.set(hour, []);
        row.byHour.get(hour).push(enriched);
      }
    });
  });

  return [...buckets.values()].map((row) => {
    row.slots.sort((a, b) => firstTime(a).localeCompare(firstTime(b)) || String(a._courtLabel).localeCompare(String(b._courtLabel), "ko"));
    row.byHour.forEach((slots) => slots.sort((a, b) => String(a._courtLabel).localeCompare(String(b._courtLabel), "ko") || firstTime(a).localeCompare(firstTime(b))));
    row.count = row.slots.length;
    row.first = row.slots.map(firstTime).filter(Boolean).sort()[0] || "99:99";
    row.locationText = [...row.locations][0] || row.fac.location || row.fac.title;
    row.courtLabelList = [...row.labels].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    row.priority = row.count > 0 && row.favorite ? 0 : row.count > 0 ? 1 : row.favorite ? 2 : 3;
    return row;
  }).sort((a, b) => a.priority - b.priority || b.count - a.count || a.first.localeCompare(b.first) || a.courtGroup.localeCompare(b.courtGroup, "ko"));
}

export function cityHealth(data, city) {
  const facilities = Object.entries(data?.facilities || {}).filter(([cid]) => cityOfFacilityId(cid) === city);
  const today = ymd(todayKst());
  let cacheRowCount = 0;
  let slotCount = 0;
  let nonEmptyFutureDays = 0;
  let dateMax = "";
  facilities.forEach(([cid]) => {
    Object.entries(data?.availability?.[cid] || {}).forEach(([date, slots]) => {
      const compact = String(date).replaceAll("-", "");
      if (compact.length !== 8) return;
      cacheRowCount += 1;
      if (compact > dateMax) dateMax = compact;
      const count = Array.isArray(slots) ? slots.filter((slot) => slot?.timeContent).length : 0;
      slotCount += count;
      if (compact >= today && count > 0) nonEmptyFutureDays += 1;
    });
  });
  if (!facilities.length || !cacheRowCount || (dateMax && dateMax < today)) return "error";
  if (!slotCount || !nonEmptyFutureDays) return "warn";
  return "ok";
}
