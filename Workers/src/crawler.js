import { pMap } from "./util";

const BASE_URL =
  "https://publicsports.yongin.go.kr/publicsports/sports/selectFcltyRceptResveListU.do";
const TIME_URL =
  "https://publicsports.yongin.go.kr/publicsports/sports/selectRegistTimeByChosenDateFcltyRceptResveApply.do";

const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: BASE_URL
};

async function fetchText(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), ...HEADERS }
  });
  return await res.text();
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), ...HEADERS }
  });
  return await res.json();
}

function extractMaxPage(html) {
  const m = [...html.matchAll(/pageIndex=(\d+)/g)]
    .map(x => parseInt(x[1], 10))
    .filter(n => Number.isFinite(n));
  return m.length ? Math.max(...m) : 1;
}

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
      title = titleMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const locMatch = b.match(/reserve_position[^>]*>([\s\S]*?)<\/div>/);
    if (locMatch) {
      location = locMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (title && location) title = title.replace(location, "").trim();
    }

    out[rid] = { title: title || `시설 ${rid}`, location };
  }
  return out;
}

/**
 * ✅ 날짜 생성: Python과 동일하게 "내일"부터 시작
 * (기존 코드는 오늘 포함이었음)
 */
function listDatesAhead(daysAhead) {
  const dates = [];
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);

  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(nowKST.getTime() + i * 24 * 60 * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${dd}`);
  }

  return dates;
}

async function fetchTimesForDate(rid, dateVal, retry = 2) {
  const body = new URLSearchParams({ dateVal, resveId: rid });
  try {
    const j = await fetchJson(TIME_URL, { method: "POST", body });
    const list = j?.resveTmList || [];
    return list
      .map(x => ({
        timeContent: x.timeContent || x.resveTmNm || x.tmNm || "",
        resveId: rid
      }))
      .filter(x => x.timeContent);
  } catch (e) {
    if (retry > 0) {
      await new Promise(res => setTimeout(res, 500));
      return fetchTimesForDate(rid, dateVal, retry - 1);
    }
    return [];
  }
}

/**
 * ✅ 새로 추가: 시설 목록만 가져오기
 * return: { facilities }
 */
export async function fetchAllFacilities({ concurrency = 10 } = {}) {
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

  const htmls = await pMap(pages, Math.min(concurrency, 10), async u =>
    fetchText(u)
  );
  for (const h of htmls) Object.assign(facilities, parseFacilities(h));

  return { facilities };
}

/**
 * ✅ 새로 추가: rid + dateVal 단일 조회
 * return: [{timeContent,resveId}, ...]
 */
export async function fetchTimesForRidDate({
  rid,
  dateVal,
  retry = 2
} = {}) {
  return fetchTimesForDate(String(rid), String(dateVal), retry);
}

/**
 * 기존 export 유지: 전체 크롤
 * ✅ 중요 변경: "월 필터" 제거(모든 시설×모든 날짜 조회)
 */
export async function runCrawl({
  facilityIds = null,
  dates = null,
  daysAhead = 60,
  concurrency = 10
} = {}) {
  const { facilities } = await fetchAllFacilities({ concurrency });

  const rids = facilityIds ?? Object.keys(facilities);
  const targetDates = dates ?? listDatesAhead(daysAhead);

  const availability = {};

  for (const rid of rids) {
    const results = await pMap(targetDates, concurrency, async dateVal => {
      const slots = await fetchTimesForRidDate({ rid, dateVal });
      return { dateVal, slots };
    });

    for (const { dateVal, slots } of results) {
      if (!slots?.length) continue;
      availability[rid] ??= {};
      availability[rid][dateVal] ??= [];
      availability[rid][dateVal].push(...slots);
    }
  }

  return { facilities, availability };
}
