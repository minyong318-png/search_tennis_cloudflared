import { pMap } from "./util";

const BASE_URL = "https://publicsports.yongin.go.kr/publicsports/sports/selectFcltyRceptResveListU.do";
const TIME_URL = "https://publicsports.yongin.go.kr/publicsports/sports/selectRegistTimeByChosenDateFcltyRceptResveApply.do";

const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Referer": BASE_URL
};


function getMonthFromFacilityTitle(title) {
  const m = title.match(/_(\d{2})월/);
  if (!m) return null;
  return m[1]; // "01", "02"
}

function filterDatesByRid(rid, facilities, allDates) {
  const title = facilities[rid]?.title;
  if (!title) return [];

  const month = getMonthFromFacilityTitle(title);
  if (!month) return [];

  // dateVal: YYYYMMDD
  return allDates.filter(d => d.slice(4, 6) === month);
}


async function fetchText(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), ...HEADERS } });
  return await res.text();
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), ...HEADERS } });
  return await res.json();
}

function extractMaxPage(html) {
  const m = [...html.matchAll(/pageIndex=(\d+)/g)].map(x => parseInt(x[1], 10)).filter(n => Number.isFinite(n));
  return m.length ? Math.max(...m) : 1;
}

function parseFacilities(html) {
  // reserve_box_item 단위로 대충 블록 파싱 (원본 구조 변경에 대비해 넓게 잡음)
  const blocks = html.split("reserve_box_item");
  const out = {};
  for (const b of blocks) {
    const rid = (b.match(/resveId=(\d+)/) || [])[1];
    if (!rid) continue;

    // title/location은 HTML 구조가 바뀔 수 있어서 strip 대충
    let title = "";
    let location = "";

    const titleMatch = b.match(/reserve_title[^>]*>([\s\S]*?)<\/div>/);
    if (titleMatch) {
      const raw = titleMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      title = raw;
    }

    const locMatch = b.match(/reserve_position[^>]*>([\s\S]*?)<\/div>/);
    if (locMatch) {
      location = locMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      // title 안에 location이 섞여 들어오면 제거(대충)
      if (title && location) title = title.replace(location, "").trim();
    }

    out[rid] = { title: title || `시설 ${rid}`, location };
  }
  return out;
}

function listDatesAhead(daysAhead) {
  const dates = [];
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);

  // 오늘 포함
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(nowKST.getTime() + i * 24 * 60 * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${dd}`);
  }

  return dates;
}


async function fetchTimesForDate(rid, dateVal) {
  const body = new URLSearchParams({ dateVal, resveId: rid });
  try {
    const j = await fetchJson(TIME_URL, { method: "POST", body });
    const list = j?.resveTmList || [];
    // slot 형태를 프론트에 맞춰 통일
    return list.map(x => ({
      timeContent: x.timeContent || x.resveTmNm || x.tmNm || "",
      resveId: rid
    })).filter(x => x.timeContent);
  } catch {
    return [];
  }
}


export async function runCrawl({ daysAhead = 60, concurrency = 10 } = {}) {
  // 1) 시설 목록 페이지 1 로드
  const baseParams = new URLSearchParams({
    searchFcltyFieldNm: "ITEM_01",
    pageUnit: "20",
    pageIndex: "1",
    checkSearchMonthNow: "false"
  });

  const firstHtml = await fetchText(`${BASE_URL}?${baseParams.toString()}`);
  const maxPage = extractMaxPage(firstHtml);

  const facilities = { ...parseFacilities(firstHtml) };

  // 2) 나머지 페이지 병렬
  const pages = [];
  for (let p = 2; p <= maxPage; p++) {
    const params = new URLSearchParams(baseParams);
    params.set("pageIndex", String(p));
    pages.push(`${BASE_URL}?${params.toString()}`);
  }

  const htmls = await pMap(pages, Math.min(concurrency, 10), async (u) => fetchText(u));
  for (const h of htmls) Object.assign(facilities, parseFacilities(h));

  // 3) 각 시설 rid × datesAhead 조회 (동시성 제한)
  const rids = Object.keys(facilities);
  const dates = listDatesAhead(daysAhead);
  const availability = {};

  // 시설 단위로 순회하되, 내부 날짜는 제한 concurrency로
  for (const rid of rids) {
  const ridDates = filterDatesByRid(rid, facilities, dates);
  if (ridDates.length === 0) continue;

  const results = await pMap(ridDates, concurrency, async (dateVal) => {
    const slots = await fetchTimesForDate(rid, dateVal);
    return { dateVal, slots };
  });

  for (const { dateVal, slots } of results) {
    if (!slots || slots.length === 0) continue;

    availability[rid] ??= {};
    availability[rid][dateVal] ??= [];
    availability[rid][dateVal].push(...slots);
    }
  console.log(
    `[CRAWL] rid=${rid} month=${getMonthFromFacilityTitle(facilities[rid]?.title)} dates=${ridDates.length}`
    );
  }


  return { facilities, availability };
}

