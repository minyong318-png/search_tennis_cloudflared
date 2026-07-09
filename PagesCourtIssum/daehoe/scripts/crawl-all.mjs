import fs from "node:fs/promises";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildDuplicateKey,
  calculateConfidenceScore,
  normalizeDateRange,
  normalizeDivision,
  normalizeRegion,
  normalizeStatus,
  normalizeTitle
} from "../src/tournament-utils.js";

const OUT_DIR = new URL("../data/", import.meta.url);
const GEMINI_QUEUE_FILE = new URL("../../.daehoe-gemini-extract-queue.jsonl", import.meta.url);
const TENNISTOWN_APP_CHECKPOINT_FILE = new URL("tennistown-app-checkpoint.json", OUT_DIR);
const USER_AGENT = "daehoe-isseum-crawler/0.2 (+https://daehoe-isseum.pages.dev/)";
const REQUEST_DELAY_MS = Number(process.env.DAEHOE_REQUEST_DELAY_MS || 900);
const KATO_DETAIL_LIMIT = Number(process.env.DAEHOE_KATO_DETAIL_LIMIT || 40);
const TENNISTOWN_LIMIT = Number(process.env.DAEHOE_TENNISTOWN_LIMIT || 5000);
const TENNISTOWN_DETAIL_LIMIT = Number(process.env.DAEHOE_TENNISTOWN_DETAIL_LIMIT || TENNISTOWN_LIMIT);
const TENNISTOWN_APP_MONTHS = (process.env.DAEHOE_TENNISTOWN_APP_MONTHS || "1,2,3,4,5,6,7,8,9,10,11,12")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => value >= 1 && value <= 12);
const TENNISTOWN_APP_TOKEN = process.env.TENNISTOWN_APP_TOKEN || "";
const TENNISTOWN_APP_USER = process.env.TENNISTOWN_APP_USER || "";
const TENNISTOWN_APP_PASSWORD = process.env.TENNISTOWN_APP_PASSWORD || "";
const TENNISTOWN_ADB_ENABLED = process.env.DAEHOE_TENNISTOWN_ADB === "1";
const TENNISTOWN_ADB_PATH = process.env.DAEHOE_TENNISTOWN_ADB_PATH || ".tools\\android-platform-tools\\platform-tools\\adb.exe";
const TENNISTOWN_ADB_SERIAL = process.env.DAEHOE_TENNISTOWN_ADB_SERIAL || "";
const TENNISTOWN_ADB_YEAR = Number(process.env.DAEHOE_TENNISTOWN_ADB_YEAR || 2026);
const TENNISTOWN_ADB_MAX_SWIPES = Number(process.env.DAEHOE_TENNISTOWN_ADB_MAX_SWIPES || 80);
const TENNISTOWN_ADB_RESUME = process.env.DAEHOE_TENNISTOWN_ADB_RESUME !== "0";
const TENNISTOWN_ADB_RESET_CHECKPOINT = process.env.DAEHOE_TENNISTOWN_ADB_RESET_CHECKPOINT === "1";
const SOURCE_TYPE_FILTER = new Set((process.env.DAEHOE_SOURCE_TYPES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));
const SOURCE_NAME_FILTER = new Set((process.env.DAEHOE_SOURCE_NAMES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));
const MERGE_EXISTING = process.env.DAEHOE_MERGE_EXISTING === "1";
const AI_ACTIVE_ONLY = process.env.DAEHOE_AI_ACTIVE_ONLY !== "0";
const AI_EXTRACT_PROVIDER = process.env.DAEHOE_AI_EXTRACT_PROVIDER || "antigravity-cli";
const AI_EXTRACT_ENABLED = process.env.DAEHOE_AI_EXTRACT === "1" && (AI_EXTRACT_PROVIDER === "gemini-cli" || AI_EXTRACT_PROVIDER === "antigravity-cli" || Boolean(process.env.OPENAI_API_KEY));
const AI_EXTRACT_MODEL = process.env.DAEHOE_AI_EXTRACT_MODEL || (AI_EXTRACT_PROVIDER === "antigravity-cli" ? "gemini-2.5-flash" : AI_EXTRACT_PROVIDER === "gemini-cli" ? "" : "gpt-4.1-mini");
const AI_IMAGE_LIMIT = Number(process.env.DAEHOE_AI_IMAGE_LIMIT || 4);
const AI_USE_IMAGES = process.env.DAEHOE_AI_USE_IMAGES === "1";
const GEMINI_CLI_COMMAND = process.env.GEMINI_CLI_COMMAND || "npx";
const ANTIGRAVITY_CLI_COMMAND = process.env.ANTIGRAVITY_CLI_COMMAND || (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\agy\\bin\\agy.exe` : "agy");
const execFileAsync = promisify(execFile);
let geminiQueueAppended = false;

const SOURCE_PRIORITY = {
  KTA: 10,
  KATO: 20,
  KATA: 30,
  LOCAL_ASSOC: 40,
  FACILITY_NOTICE: 50,
  TENNISTOWN_APP: 55,
  TENNISTOWN: 60
};

const sources = [
  { name: "KTA 국내대회", type: "KTA", url: "https://www.kortennis.or.kr/cmpt/92/cmptList.do", crawl: crawlKta },
  { name: "KATO", type: "KATO", url: "https://kato.kr/openList", crawl: crawlKato },
  { name: "KATA", type: "KATA", url: "https://kata-tennis.com/tournaments", crawl: crawlKata },
  { name: "성남시테니스협회", type: "LOCAL_ASSOC", url: "https://www.sntennis.com/schedules", crawl: crawlSeongnam },
  { name: "서울시테니스협회", type: "LOCAL_ASSOC", url: "https://seoultennis.com/", crawl: crawlSeoul },
  { name: "강남구테니스협회", type: "LOCAL_ASSOC", url: "https://bacving.com/org/gangnamgu-tennis/notice/NOTICE/list", crawl: (source) => crawlBacvingNotice(source, "강남구", "강남구테니스협회", "강남구 관련 테니스장") },
  { name: "도봉구테니스협회", type: "LOCAL_ASSOC", url: "http://dbgta.or.kr/main.html", crawl: crawlDobong },
  { name: "안양시테니스협회 공지", type: "LOCAL_ASSOC", url: "https://www.mdcare.co.kr/notice", crawl: crawlAnyang },
  { name: "수원시 2차 후보", type: "LOCAL_ASSOC", url: "https://kgtfs.com/bbs/board.php?bo_table=ktfs_schedule&sfl=wr_subject&stx=%EC%88%98%EC%9B%90", crawl: (source) => crawlKgtfsCity(source, "수원시") },
  { name: "화성시 2차 후보", type: "LOCAL_ASSOC", url: "https://kgtfs.com/bbs/board.php?bo_table=ktfs_schedule&sfl=wr_subject&stx=%ED%99%94%EC%84%B1", crawl: (source) => crawlKgtfsCity(source, "화성시") },
  { name: "의왕시 2차 후보", type: "LOCAL_ASSOC", url: "https://kgtfs.com/bbs/board.php?bo_table=ktfs_schedule&sfl=wr_subject&stx=%EC%9D%98%EC%99%95", crawl: (source) => crawlKgtfsCity(source, "의왕시") },
  { name: "광주시 2차 후보", type: "LOCAL_ASSOC", url: "https://kgtfs.com/bbs/board.php?bo_table=ktfs_schedule&sfl=wr_subject&stx=%EA%B4%91%EC%A3%BC", crawl: (source) => crawlKgtfsCity(source, "광주시") },
  ...[
    "고양시", "용인시", "성남시", "안양시", "군포시", "하남시", "부천시", "안산시", "시흥시", "김포시",
    "남양주시", "평택시", "안성시", "의정부시", "양평군", "이천시", "오산시", "과천시", "구리시", "광명시"
  ].map(kgtfsCitySource),
  { name: "군포시체육회 테니스협회", type: "LOCAL_ASSOC", url: "https://gunposports.or.kr/bbs/board.php?bo_table=classgroup&wr_id=50", crawl: crawlGunpo },
  { name: "하남시테니스협회", type: "LOCAL_ASSOC", url: "https://www.hanamtennis.com/club/competition.php?sect_id=10", crawl: crawlHanam },
  { name: "경기도테니스연합회 일정", type: "LOCAL_ASSOC", url: "https://kgtfs.com/bbs/board.php?bo_table=ktfs_schedule", crawl: crawlGyeonggiFederation },
  { name: "성남 시설공지", type: "FACILITY_NOTICE", url: "https://res.isdc.co.kr/notice.do?facType=tennis", crawl: crawlSeongnamFacilityNotices },
  { name: "TennisTown App", type: "TENNISTOWN_APP", url: "https://app.momjit.com/competition/list/v3", crawl: crawlTennisTownApp },
  { name: "테니스타운", type: "TENNISTOWN", url: "https://www.tennistown.team/", crawl: crawlTennisTown },
  { name: "tennisgame 지역대회", type: "TENNISGAME", url: "https://www.tennisgame.co.kr/board/lcompeboard", crawl: crawlTennisGame },
  { name: "용인시테니스협회", type: "LOCAL_ASSOC", url: "https://yitc.kr/sub2_1.asp?g_year=2026", crawl: crawlYongin }
];

function kgtfsCitySource(cityName) {
  const keyword = cityName.replace(/[시군구]$/, "");
  return {
    name: `${cityName} 2차 후보`,
    type: "LOCAL_ASSOC",
    url: `https://kgtfs.com/bbs/board.php?bo_table=ktfs_schedule&sfl=wr_subject&stx=${encodeURIComponent(keyword)}`,
    crawl: (source) => crawlKgtfsCity(source, cityName)
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  if (process.env.DAEHOE_PROCESS_QUEUE_ONLY === "1") {
    await processQueueOnly(startedAt);
    return;
  }
  const sourceResults = [];
  const collected = [];
  const successfulSourceTypes = new Set();
  const successfulSourceNames = new Set();

  const activeSources = sources.filter((source) => {
    if (SOURCE_TYPE_FILTER.size && !SOURCE_TYPE_FILTER.has(source.type)) return false;
    if (SOURCE_NAME_FILTER.size && !SOURCE_NAME_FILTER.has(source.name)) return false;
    return true;
  });

  for (const source of activeSources) {
    const sourceStartedAt = new Date().toISOString();
    try {
      await delay(REQUEST_DELAY_MS);
      const tournaments = await source.crawl(source);
      collected.push(...tournaments);
      sourceResults.push({
        sourceName: source.name,
        sourceType: source.type,
        sourceUrl: source.url,
        status: "success",
        startedAt: sourceStartedAt,
        finishedAt: new Date().toISOString(),
        detailCount: tournaments.length,
        errorMessage: null
      });
      successfulSourceTypes.add(source.type);
      successfulSourceNames.add(source.name);
      console.log(`[daehoe] ${source.name}: ${tournaments.length}`);
    } catch (error) {
      sourceResults.push({
        sourceName: source.name,
        sourceType: source.type,
        sourceUrl: source.url,
        status: "failed",
        startedAt: sourceStartedAt,
        finishedAt: new Date().toISOString(),
        detailCount: 0,
        errorMessage: error.message
      });
      console.warn(`[daehoe] ${source.name}: failed - ${error.message}`);
    }
  }

  const freshTournaments = dedupe(collected);
  const existing = MERGE_EXISTING ? await readExistingTournaments() : [];
  const tournaments = (MERGE_EXISTING
    ? mergeExistingTournaments(existing, freshTournaments, { successfulSourceNames, successfulSourceTypes })
    : freshTournaments).sort(sortForOutput);
  await fs.mkdir(OUT_DIR, { recursive: true });
  if (!geminiQueueAppended) {
    await applyQueuedGeminiExtractions(tournaments);
  }
  await fs.writeFile(new URL("tournaments.json", OUT_DIR), `${JSON.stringify(tournaments, null, 2)}\n`, "utf8");
  await fs.writeFile(new URL("crawl-meta.json", OUT_DIR), `${JSON.stringify({
    sourceName: summarizeSources(sourceResults),
    sourceUrl: "multiple",
    startedAt,
    finishedAt: new Date().toISOString(),
    listCount: collected.length,
    detailCount: tournaments.length,
    errorCount: sourceResults.filter((item) => item.status === "failed").length,
    sources: sourceResults
  }, null, 2)}\n`, "utf8");

  console.log(`[daehoe] total raw=${collected.length} deduped=${tournaments.length}`);
}

async function readExistingTournaments() {
  try {
    return JSON.parse(await fs.readFile(new URL("tournaments.json", OUT_DIR), "utf8"));
  } catch {
    return [];
  }
}

async function readTennisTownAppCheckpoint() {
  if (TENNISTOWN_ADB_RESET_CHECKPOINT) {
    return emptyTennisTownAppCheckpoint();
  }
  try {
    const checkpoint = JSON.parse(await fs.readFile(TENNISTOWN_APP_CHECKPOINT_FILE, "utf8"));
    if (checkpoint?.year !== TENNISTOWN_ADB_YEAR) return emptyTennisTownAppCheckpoint();
    if (!checkpoint.months || typeof checkpoint.months !== "object") checkpoint.months = {};
    return checkpoint;
  } catch {
    return emptyTennisTownAppCheckpoint();
  }
}

function emptyTennisTownAppCheckpoint() {
  return {
    year: TENNISTOWN_ADB_YEAR,
    createdAt: new Date().toISOString(),
    months: {}
  };
}

async function writeTennisTownAppCheckpoint(checkpoint) {
  checkpoint.year = TENNISTOWN_ADB_YEAR;
  checkpoint.updatedAt = new Date().toISOString();
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(TENNISTOWN_APP_CHECKPOINT_FILE, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

async function processQueueOnly(startedAt) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const tournaments = JSON.parse(await fs.readFile(new URL("tournaments.json", OUT_DIR), "utf8"));
  await applyQueuedGeminiExtractions(tournaments);
  await fs.writeFile(new URL("tournaments.json", OUT_DIR), `${JSON.stringify(tournaments, null, 2)}\n`, "utf8");
  console.log(`[daehoe][queue] processed queued Gemini extractions startedAt=${startedAt}`);
}

function mergeExistingTournaments(existing, fresh, { successfulSourceNames, successfulSourceTypes }) {
  const existingByKey = buildTournamentLookup(existing);
  const usedExistingIds = new Set();
  const merged = [];
  const now = new Date().toISOString();

  for (const freshItem of fresh) {
    const existingItem = findMatchingTournament(existingByKey, freshItem);
    if (!existingItem) {
      merged.push({ ...freshItem, syncStatus: "new", firstSeenAt: freshItem.firstSeenAt || now });
      continue;
    }
    usedExistingIds.add(existingIdentity(existingItem));
    merged.push(mergeTournamentRecord(existingItem, freshItem));
  }

  for (const existingItem of existing) {
    if (usedExistingIds.has(existingIdentity(existingItem))) continue;
    const sourceWasRefreshed = successfulSourceNames.has(existingItem.sourceName) ||
      (!existingItem.sourceName && successfulSourceTypes.has(existingItem.sourceType));
    if (!sourceWasRefreshed) {
      merged.push(existingItem);
      continue;
    }
    if (existingItem.syncStatus === "missing_from_latest_crawl") {
      merged.push(existingItem);
      continue;
    }
    merged.push({
      ...existingItem,
      syncStatus: "missing_from_latest_crawl",
      missingDetectedAt: now,
      updatedAt: now
    });
  }

  return merged;
}

function buildTournamentLookup(tournaments) {
  const lookup = new Map();
  for (const tournament of tournaments) {
    for (const key of tournamentMatchKeys(tournament)) {
      if (!lookup.has(key)) lookup.set(key, tournament);
    }
  }
  return lookup;
}

function findMatchingTournament(lookup, tournament) {
  for (const key of tournamentMatchKeys(tournament)) {
    const match = lookup.get(key);
    if (match) return match;
  }
  return null;
}

function tournamentMatchKeys(tournament) {
  const keys = [
    tournament.duplicateKey && `duplicate:${tournament.duplicateKey}`,
    tournament.sourceUrl && `url:${tournament.sourceUrl}`,
    tournament.sourceType && tournament.sourceId && `source:${tournament.sourceType}:${tournament.sourceId}`,
    tournament.sourceName && tournament.sourceId && `name-source:${tournament.sourceName}:${tournament.sourceId}`
  ];
  if (tournament.sourceType !== "TENNISTOWN_APP") {
    keys.push(tournament.titleNormalized && tournament.startDate && `title-date:${tournament.titleNormalized}:${tournament.startDate}`);
  }
  return uniqueTexts(keys);
}

function existingIdentity(tournament) {
  return tournament.id || tournament.sourceUrl || `${tournament.sourceType || ""}:${tournament.sourceId || ""}:${tournament.duplicateKey || ""}`;
}

function mergeTournamentRecord(existing, fresh) {
  const merged = {
    ...fresh,
    firstSeenAt: existing.firstSeenAt || existing.crawledAt || fresh.crawledAt,
    crawledAt: existing.crawledAt || fresh.crawledAt,
    updatedAt: fresh.contentHash === existing.contentHash && existing.syncStatus !== "missing_from_latest_crawl"
      ? existing.updatedAt
      : fresh.updatedAt,
    syncStatus: "seen"
  };

  preserveIfMissing(merged, existing, [
    "venueName",
    "feeText",
    "prizeText",
    "ballText",
    "eligibilityText",
    "inferredEligibilityText",
    "applicationStartDate",
    "applicationEndDate",
    "participantCurrent",
    "participantCapacity",
    "applicationMethodText",
    "detailText"
  ]);

  if (existing.extractionStatus === "ai" && fresh.extractionStatus !== "ai") {
    preserveIfMissing(merged, existing, [
      "extractionStatus",
      "extractionModel",
      "extractedDetails",
      "registrationStatus",
      "status"
    ]);
    if (existing.eligibilityText) merged.eligibilityText = existing.eligibilityText;
    if (existing.inferredEligibilityText) merged.inferredEligibilityText = existing.inferredEligibilityText;
    if (existing.feeText) merged.feeText = existing.feeText;
    if ((existing.divisions || []).length) merged.divisions = existing.divisions;
  } else if (!(fresh.divisions || []).length && (existing.divisions || []).length) {
    merged.divisions = existing.divisions;
  }

  merged.attachments = uniqueObjectsByUrl([...(existing.attachments || []), ...(fresh.attachments || [])]);
  merged.media = uniqueObjectsByUrl([...(existing.media || []), ...(fresh.media || [])]);
  merged.alternateSources = uniqueObjectsByUrl([...(existing.alternateSources || []), ...(fresh.alternateSources || [])]);
  merged.confidenceScore = calculateConfidenceScore(merged);
  return merged;
}

function preserveIfMissing(target, source, keys) {
  for (const key of keys) {
    if (isEmptyValue(target[key]) && !isEmptyValue(source[key])) target[key] = source[key];
  }
}

function isEmptyValue(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function uniqueObjectsByUrl(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = item?.url || item?.sourceUrl || item?.sourceId || JSON.stringify(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function crawlKta(source) {
  const html = await fetchText(source.url);
  const rows = [...html.matchAll(/<tr>\s*<td>(\d+)<\/td>\s*<td>(20\d{2}\.\d{2}\.\d{2}\s*~\s*20\d{2}\.\d{2}\.\d{2})<\/td>\s*<td>[^<]*<\/td>\s*<td(?:[^>]*)>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)];
  return rows.map((match) => {
    const sourceId = cleanText(match[1]);
    const dateText = cleanText(match[2]);
    const titleRaw = cleanText(match[3]);
    const venueName = cleanText(match[4]);
    return makeTournament({
      source,
      sourceId: `kta-${sourceId}-${hashShort(titleRaw)}`,
      sourceUrl: source.url,
      titleRaw,
      dateText,
      venueName,
      status: statusFromDateText(dateText),
      tournamentScope: "전국",
      tournamentType: inferTournamentType(titleRaw),
      organizer: "대한테니스협회",
      applicationMethodText: "대한테니스협회 국내대회 일정 페이지 확인"
    });
  });
}

async function crawlKato(source) {
  const listHtml = await fetchText(source.url);
  const listItems = parseKatoList(listHtml).slice(0, KATO_DETAIL_LIMIT);
  const tournaments = [];
  for (const item of listItems) {
    await delay(REQUEST_DELAY_MS);
    let detail = {};
    try {
      detail = parseKatoDetail(await fetchText(item.detailUrl));
    } catch {
      detail = {};
    }
    tournaments.push(makeTournament({
      source,
      sourceId: `kato-${item.sourceId}`,
      sourceUrl: item.detailUrl,
      titleRaw: item.titleRaw,
      dateText: item.dateText,
      venueName: detail.venueName,
      status: normalizeStatus(item.statusText),
      tournamentScope: "전국",
      tournamentType: "동호인대회",
      organizer: detail.organizer || "KATO",
      host: detail.host,
      feeText: detail.feeText,
      prizeText: detail.prizeText,
      ballText: detail.ballText,
      eligibilityText: detail.eligibilityText,
      applicationMethodText: "KATO 원문 신청 페이지 확인",
      detailText: detail.noticeText,
      divisions: detail.divisions.length ? detail.divisions : parseDivisions(item.divisionText, item.dateText, item.detailUrl, normalizeStatus(item.statusText))
    }));
  }
  return tournaments;
}

async function crawlKata(source) {
  const html = await fetchText(source.url);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const payload = scripts
    .map((match) => {
      try {
        return JSON.parse(decodeEntities(match[1]));
      } catch {
        return null;
      }
    })
    .find((item) => item?.["@type"] === "ItemList" && Array.isArray(item.itemListElement));
  if (!payload) return [];
  const items = (payload.itemListElement || []).map((entry) => entry.item).filter(Boolean);
  return items.map((item) => makeTournament({
    source,
    sourceId: item["@id"]?.split("#").pop() || hashShort(item.name),
    sourceUrl: item.url || source.url,
    titleRaw: item.name,
    dateText: item.startDate,
    status: item.offers?.availability?.includes("InStock") ? "접수중" : "접수예정",
    tournamentScope: "전국",
    tournamentType: "동호인대회",
    organizer: "KATA",
    applicationMethodText: "KATA 공식 일정 확인 후 베이스라인 앱에서 참가 신청",
    divisions: parseDivisions(item.name, item.startDate, item.offers?.url || item.url, item.offers?.availability?.includes("InStock") ? "접수중" : "접수예정")
  }));
}

async function crawlSeongnam(source) {
  const html = await fetchText(source.url);
  const cards = [...html.matchAll(/<div class="content-sector">([\s\S]*?)(?=<div class="content-sector">|<div class="month-sector">|<div class="tab-pane"|$)/g)];
  return cards.map((match) => {
    const card = match[1];
    const href = (card.match(/<a href="([^"]+)" class="content-title">/) || [])[1];
    const titleRaw = cleanText((card.match(/class="content-title">([\s\S]*?)<\/a>/) || [])[1]);
    const divisionText = cleanText((card.match(/<div class="area">([\s\S]*?)<\/div>/) || [])[1]);
    const dateText = cleanText((card.match(/<div class="dates">([\s\S]*?)<\/div>/) || [])[1]);
    const status = normalizeStatus(cleanText((card.match(/<span[^>]*>([\s\S]*?)<\/span>/) || [])[1]));
    return makeTournament({
      source,
      sourceId: href?.split("/").pop() || hashShort(titleRaw),
      sourceUrl: absoluteUrl(source.url, href),
      titleRaw,
      dateText,
      venueName: "성남시 관내 테니스장",
      status,
      tournamentScope: "시군구",
      tournamentType: "생활체육",
      organizer: "성남시테니스협회",
      divisions: parseDivisions(divisionText, dateText, absoluteUrl(source.url, href), status)
    });
  }).filter((item) => item.titleRaw);
}

async function crawlAnyang(source) {
  const html = await fetchText(source.url);
  return parseBoardLikeNotices(html, source, {
    sourceIdPrefix: "anyang",
    organizer: "안양시테니스협회",
    venueName: "안양시 관내 테니스장",
    tournamentScope: "시군구"
  });
}

async function crawlGyeonggiFederation(source) {
  const html = await fetchText(source.url);
  return parseBoardLikeNotices(html, source, {
    sourceIdPrefix: "kgtfs",
    organizer: "경기도테니스연합회",
    venueName: "경기도 관내 테니스장",
    tournamentScope: "시도"
  });
}

async function crawlKgtfsCity(source, cityName) {
  const html = await fetchText(source.url);
  return parseBoardLikeNotices(html, source, {
    sourceIdPrefix: `kgtfs-${cityName}`,
    organizer: `${cityName} 테니스대회 후보`,
    venueName: `${cityName} 관내 테니스장`,
    tournamentScope: "시군구"
  });
}

async function crawlGunpo(source) {
  const html = await fetchText(source.url);
  const texts = [...html.matchAll(/<span[^>]*>([\s\S]*?테니스대회[\s\S]*?)<\/span>/g)]
    .map((match) => cleanText(match[1]))
    .filter((text) => /(시장배|협회장배|협회장기|경기도협회장배|생활체육)/.test(text));
  return uniqueTexts(texts).map((titleRaw) => {
    const month = (titleRaw.match(/\((\d{1,2})월\)/) || [])[1];
    const dateText = month ? `2026.${String(month).padStart(2, "0")}.01` : titleRaw;
    return makeTournament({
      source,
      sourceId: `gunpo-${hashShort(titleRaw)}`,
      sourceUrl: source.url,
      titleRaw,
      dateText,
      venueName: "군포시 관내 테니스장",
      status: statusFromDateText(dateText),
      tournamentScope: "시군구",
      tournamentType: inferTournamentType(titleRaw),
      organizer: "군포시테니스협회",
      applicationMethodText: "군포시체육회 테니스협회 연간사업 원문 확인"
    });
  });
}

async function crawlHanam(source) {
  const html = await fetchText(source.url);
  const rows = [...html.matchAll(/<li[\s\S]*?<a href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?대회기간\s*:\s*([0-9.\-~\s]+)[\s\S]*?<\/li>/g)];
  return rows.map((match) => makeTournament({
    source,
    sourceId: `hanam-${hashShort(match[1])}`,
    sourceUrl: absoluteUrl(source.url, match[1]),
    titleRaw: cleanText(match[2]),
    dateText: cleanText(match[3]),
    venueName: "하남시 관내 테니스장",
    status: statusFromDateText(match[3]),
    tournamentScope: "시군구",
    tournamentType: inferTournamentType(match[2]),
    organizer: "하남시테니스협회",
    applicationMethodText: "하남시테니스협회 일반대회 원문 확인"
  })).filter((item) => item.titleRaw);
}

async function crawlSeoul(source) {
  const html = await fetchText(source.url);
  const cards = [...html.matchAll(/<a href="([^"]+)"[^>]*class="[^"]*comp-card[^"]*"[\s\S]*?<\/a>/g)];
  return cards.map((match) => {
    const block = match[0];
    const href = match[1];
    const titleRaw = cleanText((block.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1]);
    const spans = [...block.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((span) => cleanText(span[1])).filter(Boolean);
    const dateText = spans.find((value) => /20\d{2}\.\d{2}\.\d{2}/.test(value));
    const venueName = spans.find((value) => value !== dateText && /테니스|공원|운동장|코트|체육/.test(value));
    return makeTournament({
      source,
      sourceId: href.replace(/\W+/g, "-"),
      sourceUrl: absoluteUrl(source.url, href),
      titleRaw,
      dateText,
      venueName,
      status: statusFromDateText(dateText),
      tournamentScope: "시군구",
      tournamentType: "생활체육",
      organizer: "서울시테니스협회"
    });
  }).filter((item) => item.titleRaw);
}

async function crawlBacvingNotice(source, sigungu, organizer, venueName) {
  const html = await fetchText(source.url);
  const anchors = [...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const seen = new Set();
  return anchors.map((match) => {
    const titleRaw = cleanText(match[2]);
    if (!isTournamentNoticeTitle(titleRaw) || isNonTournamentNoticeTitle(titleRaw)) return null;
    const sourceUrl = absoluteUrl(source.url, match[1]);
    const key = `${titleRaw}|${sourceUrl}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return makeTournament({
      source,
      sourceId: `bacving-${sigungu}-${hashShort(sourceUrl)}`,
      sourceUrl,
      titleRaw,
      dateText: titleRaw,
      venueName,
      status: statusFromDateText(titleRaw),
      tournamentScope: "시군구",
      tournamentType: inferTournamentType(titleRaw),
      organizer,
      applicationMethodText: `${organizer} 공지 원문 확인`
    });
  }).filter(Boolean);
}

async function crawlDobong(source) {
  const html = await fetchTextDecoded(source.url, "euc-kr");
  const anchors = [...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const seen = new Set();
  return anchors.map((match) => {
    const titleRaw = cleanText(match[2]);
    if (!isTournamentNoticeTitle(titleRaw) || isNonTournamentNoticeTitle(titleRaw)) return null;
    const sourceUrl = absoluteUrl("http://dbgta.or.kr/", match[1]);
    const key = `${titleRaw}|${sourceUrl}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return makeTournament({
      source,
      sourceId: `dobong-${hashShort(sourceUrl)}`,
      sourceUrl,
      titleRaw,
      dateText: titleRaw,
      venueName: "도봉구 관련 테니스장",
      status: statusFromDateText(titleRaw),
      tournamentScope: "시군구",
      tournamentType: inferTournamentType(titleRaw),
      organizer: "도봉구테니스협회",
      applicationMethodText: "도봉구테니스협회 대회일정 원문 확인"
    });
  }).filter(Boolean);
}

async function crawlSeongnamFacilityNotices(source) {
  const html = await fetchText(source.url);
  const rows = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*<a href="([^"]+)">([\s\S]*?)<\/a><\/td>\s*<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>\s*(20\d{2}-\d{2}-\d{2}[^<]*)\s*<\/td>/g)];
  return rows
    .map((match) => {
      const titleRaw = cleanText(match[3]);
      if (!/테니스대회|테니스.*대회|대회.*테니스/.test(titleRaw)) return null;
      const dateInTitle = (titleRaw.match(/20\d{2}[.\-]\s*\d{1,2}[.\-]\s*\d{1,2}(?:\s*[.~\-]\s*\d{1,2}[.\-]\s*\d{1,2})?/) || [])[0];
      return makeTournament({
        source,
        sourceId: `isdc-${match[1]}`,
        sourceUrl: absoluteUrl(source.url, match[2]),
        titleRaw,
        dateText: dateInTitle || cleanText(match[5]),
        venueName: cleanText(match[4]),
        status: statusFromDateText(dateInTitle || cleanText(match[5])),
        tournamentScope: "시설",
        tournamentType: "생활체육",
        organizer: "성남도시개발공사",
        applicationMethodText: "시설 공지 원문 확인"
      });
    })
    .filter(Boolean);
}

async function crawlTennisTown(source) {
  const html = await fetchText(source.url);
  const blocks = [...html.matchAll(/<a href="([^"]+)"[^>]*>[\s\S]*?<div[^>]*style="[^"]*text-overflow:ellipsis[^"]*"[^>]*>([\s\S]*?)<\/div>/g)];
  const seen = new Set();
  const tournaments = [];
  for (const match of blocks) {
    const titleRaw = cleanText(match[2]);
    if (!/(대회|요강|OPEN|오픈|TTO|컵|배|리그|토너먼트)/i.test(titleRaw)) continue;
    if (/규정|이용|개인정보|Q&A|사용법|모집|정보|이벤트|가이드/.test(titleRaw)) continue;
    const href = absoluteUrl(source.url, match[1]);
    const key = `${titleRaw}|${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dateRange = normalizeDateRange(titleRaw, 2026);
    const inferredDateRange = dateRange.startDate ? dateRange : inferCompactMonthDayRange(titleRaw, 2026);
    const isPastTournament = dateRange.startDate && isPastDateValue(dateRange.endDate || dateRange.startDate);
    const isInferredPastTournament = inferredDateRange.startDate && isPastDateValue(inferredDateRange.endDate || inferredDateRange.startDate);
    const canAnalyzeByDate = !AI_ACTIVE_ONLY || (inferredDateRange.startDate && !isInferredPastTournament);
    let detail = { media: [], inferredEligibilityText: undefined, detailText: undefined };
    if (tournaments.length < TENNISTOWN_DETAIL_LIMIT && shouldFetchTournamentDetail(titleRaw) && canAnalyzeByDate) {
      try {
        await delay(REQUEST_DELAY_MS);
        detail = await parseTennisTownDetail(await fetchText(href), href, titleRaw, { allowAi: canAnalyzeByDate });
      } catch {
        detail = { media: [], inferredEligibilityText: inferEligibilityText(titleRaw), detailText: undefined };
      }
    }
    tournaments.push(makeTournament({
      source,
      sourceId: `tennistown-${hashShort(href)}`,
      sourceUrl: href,
      titleRaw,
      dateText: titleRaw,
      status: detail.registrationStatus || statusFromDateText(titleRaw),
      registrationStatus: detail.registrationStatus,
      tournamentScope: "사설",
      tournamentType: inferTournamentType(titleRaw),
      organizer: "테니스타운",
      applicationMethodText: "테니스타운 공개 요강 페이지 확인",
      detailText: detail.detailText,
      eligibilityText: detail.eligibilityText,
      inferredEligibilityText: detail.inferredEligibilityText,
      applicationStartDate: detail.applicationStartDate,
      applicationEndDate: detail.applicationEndDate,
      extractionStatus: detail.extractionStatus,
      extractionModel: detail.extractionModel,
      extractedDetails: detail.extractedDetails,
      divisions: detail.divisions || [],
      media: detail.media
    }));
    if (tournaments.length >= TENNISTOWN_LIMIT) break;
  }
  return tournaments;
}

async function crawlTennisTownApp(source) {
  const token = await getTennisTownAppToken();
  if (!token) {
    if (TENNISTOWN_ADB_ENABLED) return crawlTennisTownAppWithAdb(source);
    console.warn("[daehoe][tennistown-app] skipped: set TENNISTOWN_APP_TOKEN or TENNISTOWN_APP_USER/TENNISTOWN_APP_PASSWORD");
    return [];
  }

  const tournaments = [];
  const seen = new Set();
  for (const month of TENNISTOWN_APP_MONTHS) {
    await delay(REQUEST_DELAY_MS);
    const data = await fetchTennisTownAppJson("/competition/list/v3", {
      method: "POST",
      token,
      body: { select_month: month }
    });
    for (const item of flattenTennisTownAppSections(data.section_list || [])) {
      const titleRaw = cleanText(item.comp_name || item.part_name || item.title || "");
      if (!titleRaw) continue;
      const divisionName = tennisTownAppDivisionName(item);
      const dateText = item.start_date || item.comp_start_date || item.part_date || titleRaw;
      const venueName = item.ground_name || item.place_name || item.location || item.ground_region_name;
      const sourceId = `tennistown-app-${item.comp_part_date_id || item.id || item.comp_id || hashShort(JSON.stringify(item))}`;
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      tournaments.push(makeTournament({
        source,
        sourceId,
        sourceUrl: `https://app.momjit.com/competition/list/v3#${encodeURIComponent(sourceId)}`,
        titleRaw,
        dateText,
        status: tennisTownAppStatus(item.part_status),
        registrationStatus: tennisTownAppStatus(item.part_status),
        tournamentScope: "사설",
        tournamentType: inferTournamentType(titleRaw),
        organizer: "테니스타운",
        venueName,
        duplicateKey: tennisTownDuplicateKey({ titleRaw, dateText, venueName, divisionName }),
        applicationMethodText: "테니스타운 앱 확인",
        divisions: [{
          divisionName,
          playDate: item.start_date || item.part_date,
          applicationUrl: "https://play.google.com/store/apps/details?id=com.momzit.tennistown"
        }].filter((division) => division.divisionName || division.playDate)
      }));
      if (tournaments.length >= TENNISTOWN_LIMIT) break;
    }
    if (tournaments.length >= TENNISTOWN_LIMIT) break;
  }
  return tournaments;
}

async function crawlTennisTownAppWithAdb(source) {
  const checkpoint = await readTennisTownAppCheckpoint();
  await adb("devices");
  await wakeAndUnlockTennisTownDevice();
  await adb("shell", "am", "force-stop", "com.momzit.tennistown");
  await delay(1000);
  await adb("shell", "monkey", "-p", "com.momzit.tennistown", "-c", "android.intent.category.LAUNCHER", "1");
  await delay(3500);
  let values = await dumpTennisTownUiValues();
  if (!values.includes("대회 목록")) {
    await adb("shell", "input", "tap", "520", "1165");
    await delay(3500);
    values = await dumpTennisTownUiValues();
  }
  if (!values.includes("대회 목록")) {
    throw new Error("TennisTown ADB crawler could not open tournament list");
  }

  const tournaments = [];
  const seen = new Set();
  for (const month of TENNISTOWN_APP_MONTHS) {
    const monthKey = String(month);
    const cachedMonth = checkpoint.months?.[monthKey];
    const canReuseMonth = TENNISTOWN_ADB_RESUME &&
      cachedMonth?.status === "complete" &&
      cachedMonth.year === TENNISTOWN_ADB_YEAR &&
      Array.isArray(cachedMonth.tournaments);
    if (canReuseMonth) {
      for (const tournament of cachedMonth.tournaments) {
        if (seen.has(tournament.sourceId)) continue;
        seen.add(tournament.sourceId);
        tournaments.push(normalizeTennisTownCachedTournament(tournament));
        if (tournaments.length >= TENNISTOWN_LIMIT) return tournaments;
      }
      console.log(`[daehoe][tennistown-app] month ${month} reused ${cachedMonth.tournaments.length} checkpoint tournaments`);
      continue;
    }
    console.log(`[daehoe][tennistown-app] month ${month} crawl started`);
    checkpoint.months[monthKey] = {
      ...(checkpoint.months[monthKey] || {}),
      year: TENNISTOWN_ADB_YEAR,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      partialItems: checkpoint.months[monthKey]?.partialItems || [],
      tournaments: checkpoint.months[monthKey]?.tournaments || []
    };
    await writeTennisTownAppCheckpoint(checkpoint);
    const beforeMonthCount = tournaments.length;
    await moveTennisTownMonth(month);
    await resetTennisTownMonthScroll();
    const scrapeResult = await scrapeVisibleTennisTownMonth(month, async (partialItems, progress) => {
      checkpoint.months[monthKey] = {
        ...checkpoint.months[monthKey],
        year: TENNISTOWN_ADB_YEAR,
        status: "in_progress",
        updatedAt: new Date().toISOString(),
        swipe: progress.swipe,
        partialItemCount: partialItems.length,
        partialItems
      };
      await writeTennisTownAppCheckpoint(checkpoint);
    });
    const items = scrapeResult.items;
    for (const item of items) {
      const dateText = `${TENNISTOWN_ADB_YEAR}-${String(month).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`;
      const sourceId = `tennistown-adb-${TENNISTOWN_ADB_YEAR}-${month}-${item.day}-${hashShort(`${item.titleRaw}|${item.divisionName}|${item.venueName}`)}`;
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      const participant = item.participant || parseParticipantCount(item.status);
      const registrationStatus = tennisTownAdbStatus(item.status, participant);
      tournaments.push(makeTournament({
        source,
        sourceId,
        sourceUrl: `tennistown-app://competition/${sourceId}`,
        titleRaw: item.titleRaw,
        dateText,
        status: registrationStatus,
        registrationStatus,
        participantCurrent: participant?.current,
        participantCapacity: participant?.capacity,
        tournamentScope: "사설",
        tournamentType: inferTournamentType(item.titleRaw),
        organizer: "테니스타운",
        venueName: item.venueName,
        applicationMethodText: "테니스타운 앱에서 확인",
        duplicateKey: tennisTownDuplicateKey({
          titleRaw: item.titleRaw,
          dateText,
          venueName: item.venueName,
          divisionName: item.divisionName
        }),
        divisions: [{
          divisionName: item.divisionName,
          playDate: dateText,
          status: registrationStatus,
          participantCurrent: participant?.current,
          participantCapacity: participant?.capacity,
          applicationUrl: "https://play.google.com/store/apps/details?id=com.momzit.tennistown"
        }]
      }));
      if (tournaments.length >= TENNISTOWN_LIMIT) break;
    }
    const monthTournaments = tournaments.slice(beforeMonthCount);
    checkpoint.months[monthKey] = {
      ...checkpoint.months[monthKey],
      year: TENNISTOWN_ADB_YEAR,
      status: scrapeResult.reachedMaxSwipes ? "incomplete_max_swipes" : "complete",
      completedAt: new Date().toISOString(),
      reachedMaxSwipes: scrapeResult.reachedMaxSwipes,
      itemCount: items.length,
      tournamentCount: monthTournaments.length,
      partialItems: items,
      tournaments: monthTournaments
    };
    await writeTennisTownAppCheckpoint(checkpoint);
    console.log(`[daehoe][tennistown-app] month ${month} saved ${monthTournaments.length} tournaments${scrapeResult.reachedMaxSwipes ? " (incomplete: max swipes reached)" : ""}`);
    if (tournaments.length >= TENNISTOWN_LIMIT) return tournaments;
  }
  return tournaments;
}

async function wakeAndUnlockTennisTownDevice() {
  await adb("shell", "input", "keyevent", "224");
  await delay(800);
  await adb("shell", "input", "swipe", "540", "1850", "540", "300", "500");
  await delay(1200);
}

async function moveTennisTownMonth(targetMonth) {
  for (let step = 0; step < 14; step += 1) {
    const currentMonth = readVisibleMonth(await dumpTennisTownUiValues());
    if (currentMonth === targetMonth) return;
    const tapX = currentMonth && currentMonth > targetMonth ? 410 : 670;
    await adb("shell", "input", "tap", String(tapX), "250");
    await delay(1800);
  }
  throw new Error(`TennisTown ADB crawler could not move to month ${targetMonth}`);
}

async function resetTennisTownMonthScroll() {
  for (let i = 0; i < 18; i += 1) {
    await adb("shell", "input", "swipe", "540", "650", "540", "1750", "350");
    await delay(350);
  }
  await delay(1000);
}

async function scrapeVisibleTennisTownMonth(month, onProgress = null) {
  const items = [];
  const seen = new Set();
  const dumpKeys = new Set();
  let reachedMaxSwipes = false;
  let repeatedDumps = 0;
  for (let swipe = 0; swipe <= TENNISTOWN_ADB_MAX_SWIPES; swipe += 1) {
    if (swipe === TENNISTOWN_ADB_MAX_SWIPES) reachedMaxSwipes = true;
    let values = [];
    try {
      values = await dumpTennisTownUiValues();
    } catch (error) {
      if (items.length) break;
      throw error;
    }
    const dumpKey = values.join("|");
    if (dumpKeys.has(dumpKey) && swipe > 0) {
      repeatedDumps += 1;
      if (repeatedDumps >= 3) break;
      await adb("shell", "input", "swipe", "540", "1850", "540", "430", "750");
      await delay(1600);
      continue;
    }
    repeatedDumps = 0;
    dumpKeys.add(dumpKey);
    for (const item of parseTennisTownUiItems(values)) {
      const key = `${month}-${item.day}-${item.titleRaw}-${item.divisionName}-${item.venueName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    if (onProgress) await onProgress([...items], { swipe });
    await adb("shell", "input", "swipe", "540", "1850", "540", "430", "750");
    await delay(1600);
  }
  return { items, reachedMaxSwipes };
}

function parseTennisTownUiItems(values) {
  return values
    .filter((value) => /^\d{2},\s*[A-Z]{3},\s*/.test(value))
    .map((value) => value.replace(/\u200b/g, ""))
    .map((value) => {
      const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
      if (parts.length < 6) return null;
      const [day, weekday] = parts;
      const parsed = parseTennisTownCardParts(parts.slice(2));
      if (!parsed) return null;
      return { day: Number(day), weekday, ...parsed };
    })
    .filter((item) => item?.titleRaw && item.day >= 1 && item.day <= 31);
}

function parseTennisTownCardParts(parts) {
  const tail = [...parts];
  const statusParts = [];
  while (tail.length && isTennisTownStatusToken(tail.at(-1))) {
    statusParts.unshift(tail.pop());
  }
  const participantToken = statusParts.find((part) => parseParticipantCount(part));
  const participant = parseParticipantCount(participantToken || "");
  if (tail.length < 3) return null;
  const venueName = tail.pop();
  const divisionName = tail.pop();
  const titleRaw = tail.join(", ");
  return {
    titleRaw,
    divisionName,
    venueName,
    status: statusParts.join(" · ") || "미상",
    participant
  };
}

function isTennisTownStatusToken(value = "") {
  const text = String(value).trim();
  return /^(\d+)\s*\/\s*(\d+)$/.test(text) || /^(신청|LIVE|임박|대기|마감|모집중|모집예정|접수중|접수예정|접수마감|종료)$/.test(text);
}

function tennisTownAdbStatus(status = "", participant = null) {
  const text = String(status || "");
  if (/마감|종료/.test(text)) return "접수마감";
  if (/모집예정|접수예정|대기/.test(text)) return "접수예정";
  if (participant || /신청|LIVE|임박|모집중|접수중/.test(text)) return "접수중";
  return text || "미상";
}

function parseParticipantCount(value = "") {
  const match = String(value).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  return {
    current: Number(match[1]),
    capacity: Number(match[2])
  };
}
function readVisibleMonth(values) {
  for (let index = 0; index < values.length - 1; index += 1) {
    const month = Number(values[index]);
    if (month >= 1 && month <= 12 && values[index + 1] === "월") return month;
  }
  return null;
}

async function dumpTennisTownUiValues() {
  let dumpError = null;
  try {
    await adb("shell", "timeout", "12", "uiautomator", "dump", "/sdcard/tt-window.xml");
  } catch (error) {
    dumpError = error;
  }

  try {
    const { stdout } = await adb("exec-out", "cat", "/sdcard/tt-window.xml");
    const values = decodeUiXmlValues(stdout);
    if (values.length || !dumpError) return values;
  } catch (readError) {
    if (dumpError) {
      throw dumpError;
    }
    throw readError;
  }

  throw dumpError;
}

function decodeUiXmlValues(xml) {
  return [...xml.matchAll(/(?:text|content-desc)="([^"]+)"/g)]
    .map((match) => decodeXml(match[1]).replace(/\u200b/g, "").trim())
    .filter(Boolean);
}

function decodeXml(value) {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function adb(...args) {
  const serialArgs = TENNISTOWN_ADB_SERIAL ? ["-s", TENNISTOWN_ADB_SERIAL] : [];
  return execFileAsync(TENNISTOWN_ADB_PATH, [...serialArgs, ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30000
  });
}

async function getTennisTownAppToken() {
  if (TENNISTOWN_APP_TOKEN) return TENNISTOWN_APP_TOKEN;
  if (!TENNISTOWN_APP_USER || !TENNISTOWN_APP_PASSWORD) return "";
  const data = await fetchTennisTownAppJson("/user/auth/sso/normal/verify", {
    method: "POST",
    body: {
      user_id: TENNISTOWN_APP_USER,
      user_passwd: TENNISTOWN_APP_PASSWORD
    }
  });
  return data?.response?.access_token || "";
}

async function fetchTennisTownAppJson(path, { method = "GET", token = "", body } = {}) {
  const headers = {
    "user-agent": "TennisTown/2.1.65 Android",
    "accept": "application/json",
    "content-type": "application/json"
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`https://app.momjit.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`TennisTown App HTTP ${response.status} ${response.statusText}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("TennisTown App returned non-JSON response");
  }
}

function flattenTennisTownAppSections(sections) {
  return sections.flatMap((section) => Array.isArray(section?.data) ? section.data : []);
}

function tennisTownAppDivisionName(item) {
  const gender = {
    M: "남복",
    F: "여복",
    MF: "혼복",
    MS: "남단",
    FS: "여단",
    G: "단체전"
  }[item.gender_type] || item.gender_type || "";
  return cleanText([gender, item.part_name].filter(Boolean).join(" "));
}

function tennisTownAppStatus(statusCode) {
  const status = Number(statusCode);
  if (status === 1002 || status === 1006) return "접수중";
  if (status === 1005) return "접수예정";
  if (status === 1007) return "연기";
  if (status === 1008) return "취소";
  if (status === 1004) return "접수마감";
  return "미상";
}

async function crawlTennisGame(source) {
  // The site is in the requested first-wave list, but currently presents an expired TLS certificate.
  // Keep this as an explicit probe so the crawl log shows the current collection status.
  await fetchText(source.url);
  return [];
}

async function crawlYongin(source) {
  let html = "";
  try {
    html = await fetchTextDecoded(source.url, "euc-kr");
  } catch {
    html = await fetchText(`https://r.jina.ai/http://r.jina.ai/http://http://yitc.kr/sub2_1.asp?g_year=2026`);
  }
  return parseYonginSchedule(html, source);
}

function parseYonginSchedule(html, source) {
  const normalized = html
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/\s+/g, " ");
  const rows = [];
  const linkRows = [...normalized.matchAll(/(\d+)\s+(\d{1,2})월\s+(?:<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|\[([^\]]+)]\(([^)]+)\))\s+(.+?)\s+(\d{1,2})일\s+(종료|준비중|접수중|접수마감|신청중)/g)];
  for (const match of linkRows) {
    const rowNo = match[1];
    const month = Number(match[2]);
    const href = match[3] || match[6];
    const titleRaw = cleanText(match[4] || match[5]);
    const organizer = cleanText(match[7]);
    const day = Number(match[8]);
    const status = normalizeStatus(match[9]);
    if (!titleRaw || !month || !day) continue;
    rows.push(makeTournament({
      source,
      sourceId: `yitc-${rowNo}-${hashShort(href || titleRaw)}`,
      sourceUrl: absoluteUrl(source.url, href),
      titleRaw,
      dateText: `2026.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
      venueName: "용인시 관련 테니스장",
      status,
      tournamentScope: titleRaw.includes("전국") ? "전국" : "시군구",
      tournamentType: inferTournamentType(titleRaw),
      organizer: organizer || "용인시테니스협회",
      host: organizer,
      applicationMethodText: "용인시테니스협회 대회일정 원문 확인"
    }));
  }
  return rows;
}

function parseBoardLikeNotices(html, source, options) {
  const anchors = [...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const seen = new Set();
  return anchors
    .map((match) => {
      const titleRaw = cleanText(match[2]);
      if (!isTournamentNoticeTitle(titleRaw)) return null;
      if (isNonTournamentNoticeTitle(titleRaw)) return null;
      const sourceUrl = absoluteUrl(source.url, match[1]);
      const key = `${titleRaw}|${sourceUrl}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return makeTournament({
        source,
        sourceId: `${options.sourceIdPrefix}-${hashShort(sourceUrl)}`,
        sourceUrl,
        titleRaw,
        dateText: titleRaw,
        venueName: options.venueName,
        status: statusFromDateText(titleRaw),
        tournamentScope: options.tournamentScope,
        tournamentType: inferTournamentType(titleRaw),
        organizer: options.organizer,
        applicationMethodText: `${options.organizer} 공지 원문 확인`
      });
    })
    .filter(Boolean);
}

function isTournamentNoticeTitle(title = "") {
  return /(테니스|tennis|대회|요강|오픈|OPEN|컵|배|리그|토너먼트|협회장|시장|구청장|생활체육|동호인)/i.test(title);
}

function isNonTournamentNoticeTitle(title = "") {
  if (/^(대회|대회일정|대회결과|대회\/클럽|대회검색|토너먼트대회|리그대회)$/.test(title.trim())) return true;
  return /(결과|영상|사진|공지사항|서버|시간|환불|취소|정정|변경|입상자|랭킹|순위|코트장\s*이용|강습|레슨)/i.test(title);
}

async function parseTennisTownDetail(html, sourceUrl, titleRaw, { allowAi = true } = {}) {
  const media = [];
  const ogImage = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  if (ogImage) media.push({ url: absoluteUrl(sourceUrl, decodeEntities(ogImage)), alt: titleRaw, type: "image" });

  for (const match of html.matchAll(/<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>/g)) {
    const tag = match[0];
    const rawUrl = decodeEntities(match[1]);
    if (!rawUrl || rawUrl.startsWith("data:image")) continue;
    const alt = cleanText((tag.match(/alt="([^"]*)"/) || [])[1] || titleRaw);
    media.push({ url: absoluteUrl(sourceUrl, rawUrl), alt, type: "image" });
  }

  const uniqueMedia = uniqueMediaItems(media)
    .filter((item) => /notion\/image|oopy|attachment|amazonaws|cloudfront|lazyrockets|imgix|tennistown/i.test(item.url))
    .slice(0, 12);
  const text = cleanText(html);
  const aiText = compactForAi(text, 1800);
  const base = {
    media: uniqueMedia,
    detailText: compact(text, 300),
    inferredEligibilityText: inferEligibilityText(`${titleRaw} ${text} ${uniqueMedia.map((item) => `${item.url} ${item.alt}`).join(" ")}`)
  };
  const shouldAnalyze = allowAi && shouldAnalyzeTournamentWithAi(`${titleRaw} ${aiText || text}`);
  const aiDetails = shouldAnalyze ? await extractTournamentDetailsWithAi({
    titleRaw,
    sourceUrl,
    detailText: aiText,
    media: uniqueMedia
  }) : null;
  if (!aiDetails) return { ...base, extractionStatus: AI_EXTRACT_ENABLED ? "skipped" : "disabled" };
  const divisions = (aiDetails.divisions || []).map((item) => {
    const division = normalizeDivision(item.divisionName || "");
    return {
      divisionName: division.normalized,
      gender: item.gender || division.gender,
      level: item.level || division.level,
      format: item.format || division.format,
      playDate: item.playDate,
      eligibilityText: item.eligibilityText,
      feeText: item.feeText || aiDetails.feeText,
      status: aiDetails.applicationStatus || "미상"
    };
  }).filter((item) => item.divisionName && item.divisionName !== "미상");
  return {
    ...base,
    venueName: aiDetails.venueName,
    eligibilityText: aiDetails.eligibilityText,
    inferredEligibilityText: aiDetails.eligibilityText || base.inferredEligibilityText,
    registrationStatus: aiDetails.applicationStatus,
    applicationStartDate: aiDetails.applicationStartDate,
    applicationEndDate: aiDetails.applicationEndDate,
    divisions,
    extractionStatus: "ai",
    extractionModel: AI_EXTRACT_MODEL,
    extractedDetails: aiDetails
  };
}

function parseKatoList(html) {
  const tableMatches = html.match(/<table>[\s\S]*?<\/table>/g) || [];
  const seen = new Set();
  const items = [];
  for (const table of tableMatches) {
    const titleLink = table.match(/<a href="(\/openGame\/(\d+))" class="content-title">\s*([\s\S]*?)\s*<\/a>/);
    if (!titleLink || seen.has(titleLink[2])) continue;
    seen.add(titleLink[2]);
    const statusCandidates = [...table.matchAll(/<span class="[^"]*">([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1]));
    items.push({
      sourceId: titleLink[2],
      titleRaw: cleanText(titleLink[3]),
      divisionText: cleanText((table.match(/<span class="parts">([\s\S]*?)<\/span>/) || [])[1]),
      dateText: cleanText((table.match(/<div class="date">([\s\S]*?)<\/div>/) || [])[1]),
      statusText: statusCandidates.find((value) => /접수|종료|마감|예정|진행/.test(value)) || "미상",
      detailUrl: `https://kato.kr${titleLink[1]}`
    });
  }
  return items.filter((item) => item.titleRaw && item.dateText);
}

function parseKatoDetail(html) {
  const rowValue = (labelPattern) => {
    const regex = new RegExp(`<td[^>]*>${labelPattern}<\\/td>\\s*<td[^>]*colspan="2"[^>]*>([\\s\\S]*?)<\\/td>`, "i");
    return cleanText((html.match(regex) || [])[1] || "");
  };
  const feeText = rowValue("참가비");
  return {
    venueName: rowValue("장\\s*소"),
    organizer: rowValue("주\\s*최"),
    host: rowValue("주\\s*관"),
    feeText,
    ballText: rowValue("사용구"),
    prizeText: compact(rowValue("시\\s*상"), 180),
    noticeText: compact(rowValue("대회안내"), 220),
    eligibilityText: compact(rowValue("참가자격"), 220),
    divisions: parseKatoDivisions(html, feeText)
  };
}

function parseKatoDivisions(html, feeText) {
  const rows = [];
  const seen = new Set();
  const regex = /<td[^>]*class="(?:first-comp|rowcell)"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  for (const match of html.matchAll(regex)) {
    const divisionNameRaw = cleanText(match[1]);
    const dateText = cleanText(match[2]);
    if (!divisionNameRaw || !/\d{4}/.test(dateText)) continue;
    const key = `${divisionNameRaw}|${dateText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const division = normalizeDivision(divisionNameRaw);
    const parsedDate = normalizeDateRange(dateText, 2026);
    rows.push({
      divisionName: division.normalized,
      gender: division.gender,
      level: division.level,
      format: division.format,
      playDate: parsedDate.startDate,
      startTime: parsedDate.startTime,
      feeText,
      status: "미상"
    });
  }
  return rows;
}

function parseDivisions(text = "", dateText = "", applicationUrl, status = "미상") {
  const dateRange = normalizeDateRange(dateText, 2026);
  return text
    .split(/[,/·|]/)
    .map((value) => value.trim())
    .filter((value) => value && value.length < 30)
    .map((divisionNameRaw) => {
      const division = normalizeDivision(divisionNameRaw);
      return {
        divisionName: division.normalized,
        gender: division.gender,
        level: division.level,
        format: division.format,
        playDate: dateRange.startDate,
        applicationUrl,
        status
      };
    });
}

function shouldFetchTournamentDetail(text = "") {
  if (!AI_ACTIVE_ONLY) return true;
  const range = normalizeDateRange(text, 2026);
  if (!range.startDate) return true;
  return !isPastDateValue(range.endDate || range.startDate);
}

function shouldAnalyzeTournamentWithAi(text = "") {
  if (!AI_ACTIVE_ONLY) return true;
  const parsedRange = normalizeDateRange(text, 2026);
  const range = parsedRange.startDate ? parsedRange : inferCompactMonthDayRange(text, 2026);
  if (!range.startDate) return true;
  return !isPastDateValue(range.endDate || range.startDate);
}

function inferCompactMonthDayRange(text = "", baseYear = 2026) {
  const value = String(text || "");
  const compactRange = value.match(/(?:^|\D+)(\d{2})(\d{2})\s*[/~-]\s*(\d{2})(\d{2})(?:$|\D+)/);
  if (compactRange) {
    return {
      startDate: `${baseYear}-${compactRange[1]}-${compactRange[2]}`,
      endDate: `${baseYear}-${compactRange[3]}-${compactRange[4]}`
    };
  }
  const range = value.match(/(?:^|\D+)(\d{1,2})\s*[.\/-]\s*(\d{1,2})(?:\s*[/~-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2}))?(?:$|\D+)/);
  if (!range) return {};
  return {
    startDate: `${baseYear}-${String(range[1]).padStart(2, "0")}-${String(range[2]).padStart(2, "0")}`,
    endDate: range[3]
      ? `${baseYear}-${String(range[3]).padStart(2, "0")}-${String(range[4]).padStart(2, "0")}`
      : `${baseYear}-${String(range[1]).padStart(2, "0")}-${String(range[2]).padStart(2, "0")}`
  };
}

function isPastDateValue(dateValue) {
  const date = new Date(`${dateValue}T23:59:59`);
  if (Number.isNaN(date.getTime())) return false;
  return date < todayStart();
}

function todayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function normalizeTennisTownCachedTournament(tournament) {
  const divisionName = tournament.divisions?.[0]?.divisionName || "";
  return {
    ...tournament,
    duplicateKey: tennisTownDuplicateKey({
      titleRaw: tournament.titleRaw,
      dateText: tournament.startDate || tournament.dateText,
      venueName: tournament.venueName,
      divisionName
    })
  };
}

function tennisTownDuplicateKey({ titleRaw, dateText, venueName, divisionName }) {
  const dateRange = normalizeDateRange(dateText || "", 2026);
  return [
    "TENNISTOWN_APP",
    normalizeTitle(titleRaw || ""),
    dateRange.startDate || isoDateOrUndefined(dateText) || cleanText(dateText || ""),
    compactKeyPart(venueName),
    compactKeyPart(divisionName)
  ].join("|");
}

function compactKeyPart(value = "") {
  return cleanText(value).replace(/\s+/g, "").toLowerCase();
}

function makeTournament(input) {
  const dateRange = normalizeDateRange(input.dateText || "", 2026);
  const region = normalizeRegion(`${input.titleRaw || ""} ${input.venueName || ""}`);
  const tournament = {
    id: `${input.source.type.toLowerCase()}-${input.sourceId || hashShort(`${input.titleRaw}|${input.dateText}`)}`,
    sourceType: input.source.type,
    sourceName: input.source.name,
    sourceUrl: input.sourceUrl || input.source.url,
    sourceId: input.sourceId,
    titleRaw: input.titleRaw,
    titleNormalized: normalizeTitle(input.titleRaw),
    regionSido: region.regionSido,
    regionSigungu: region.regionSigungu,
    tournamentScope: input.tournamentScope || "미상",
    tournamentType: input.tournamentType || "기타",
    organizer: input.organizer,
    host: input.host,
    startDate: dateRange.startDate || isoDateOrUndefined(input.dateText),
    endDate: dateRange.endDate || isoDateOrUndefined(input.dateText),
    status: input.status || statusFromDateText(input.dateText),
    registrationStatus: input.registrationStatus,
    venueName: input.venueName,
    feeText: input.feeText,
    prizeText: input.prizeText,
    ballText: input.ballText,
    eligibilityText: input.eligibilityText,
    inferredEligibilityText: input.inferredEligibilityText,
    applicationStartDate: input.applicationStartDate,
    applicationEndDate: input.applicationEndDate,
    participantCurrent: input.participantCurrent,
    participantCapacity: input.participantCapacity,
    extractionStatus: input.extractionStatus,
    extractionModel: input.extractionModel,
    extractedDetails: input.extractedDetails,
    applicationMethodText: input.applicationMethodText || "원문 확인",
    detailText: input.detailText,
    attachments: input.attachments || [],
    media: input.media || [],
    divisions: input.divisions || [],
    crawledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  tournament.contentHash = hashStable({
    titleRaw: tournament.titleRaw,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    venueName: tournament.venueName,
    sourceUrl: tournament.sourceUrl,
    media: tournament.media
  });
  tournament.duplicateKey = input.duplicateKey || buildDuplicateKey(tournament);
  tournament.confidenceScore = calculateConfidenceScore(tournament);
  return tournament;
}

async function extractTournamentDetailsWithAi({ titleRaw, sourceUrl, detailText, media }) {
  if (!AI_EXTRACT_ENABLED) return null;
  if (AI_EXTRACT_PROVIDER === "gemini-cli") {
    return extractTournamentDetailsWithGeminiCli({ titleRaw, sourceUrl, detailText, media });
  }
  if (AI_EXTRACT_PROVIDER === "antigravity-cli") {
    return extractTournamentDetailsWithAntigravityCli({ titleRaw, sourceUrl, detailText, media });
  }
  const imageItems = (media || []).slice(0, AI_IMAGE_LIMIT).map((item) => ({
    type: "input_image",
    image_url: item.url
  }));
  const prompt = [
    "테니스 대회 상세 페이지와 포스터 이미지에서 장소, 참가 신청 상태, 접수 기간, 참가 자격, 부서 정보를 추출하세요.",
    "확실하지 않은 값은 빈 문자열 또는 미상으로 두고, 추정한 값은 confidence를 낮게 주세요.",
    "참가 신청 상태는 접수중, 접수예정, 준비중, 접수마감, 대회진행중, 대회종료, 취소, 연기, 미상 중 하나만 사용하세요.",
    `대회명: ${titleRaw}`,
    `원문 URL: ${sourceUrl}`,
    `상세 텍스트: ${detailText || ""}`
  ].join("\n\n");
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: AI_EXTRACT_MODEL,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...imageItems
          ]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "tennis_tournament_extract",
            strict: true,
            schema: tournamentExtractSchema()
          }
        }
      })
    });
    if (!response.ok) {
      console.warn(`[daehoe][ai] extract failed ${response.status} ${response.statusText}: ${titleRaw}`);
      return null;
    }
    const payload = await response.json();
    const outputText = responseOutputText(payload);
    if (!outputText) return null;
    return normalizeAiExtract(JSON.parse(outputText));
  } catch (error) {
    console.warn(`[daehoe][ai] extract skipped: ${titleRaw} - ${error.message}`);
    return null;
  }
}

async function extractTournamentDetailsWithGeminiCli({ titleRaw, sourceUrl, detailText, media }) {
  const imageUrls = (media || []).slice(0, AI_IMAGE_LIMIT).map((item) => item.url);
  const prompt = [
    "You are extracting structured information from a Korean tennis tournament detail page.",
    "Read the provided detail text and public poster/image URLs. If you can inspect images, use them as the primary source for venue and eligibility.",
    "Return only valid JSON. Do not include markdown fences or explanation.",
    "Schema:",
    JSON.stringify(tournamentExtractSchemaForPrompt()),
    "",
    `titleRaw: ${titleRaw}`,
    `sourceUrl: ${sourceUrl}`,
    `imageUrls: ${JSON.stringify(imageUrls)}`,
    `detailText: ${detailText || ""}`
  ].join("\n");
  try {
    const { stdout, stderr } = await execGeminiCli(prompt);
    const output = parseGeminiCliOutput(stdout);
    if (!output) {
      if (stderr) console.warn(`[daehoe][gemini] ${compact(stderr, 240)}`);
      return null;
    }
    return normalizeAiExtract(output);
  } catch (error) {
    if (isCliLimitError(error)) {
      await enqueueGeminiExtraction({ titleRaw, sourceUrl, detailText, media });
      console.warn(`[daehoe][gemini] queued after limit: ${titleRaw}`);
      return null;
    }
    console.warn(`[daehoe][gemini] extract skipped: ${titleRaw} - ${error.message}`);
    return null;
  }
}

async function extractTournamentDetailsWithAntigravityCli({ titleRaw, sourceUrl, detailText, media }) {
  try {
    const output = await runCliJsonExtraction({ titleRaw, sourceUrl, detailText, media }, execAntigravityCli);
    return output ? normalizeAiExtract(output) : null;
  } catch (error) {
    if (isCliLimitError(error)) {
      await enqueueGeminiExtraction({ titleRaw, sourceUrl, detailText, media });
      console.warn(`[daehoe][agy] queued after limit: ${titleRaw}`);
      return null;
    }
    console.warn(`[daehoe][agy] extract skipped: ${titleRaw} - ${error.message}`);
    return null;
  }
}

async function execGeminiCli(prompt) {
  const args = GEMINI_CLI_COMMAND === "npx"
    ? ["--yes", "@google/gemini-cli", "--prompt", prompt, "--output-format", "json", "--skip-trust", "--model", AI_EXTRACT_MODEL]
    : ["--prompt", prompt, "--output-format", "json", "--skip-trust", "--model", AI_EXTRACT_MODEL];
  if (!AI_EXTRACT_MODEL) args.splice(args.lastIndexOf("--model"), 2);
  return execFileAsync(GEMINI_CLI_COMMAND, args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
    timeout: Number(process.env.DAEHOE_AI_TIMEOUT_MS || 120000)
  });
}

async function execAntigravityCli(prompt) {
  const prompt64 = Buffer.from(prompt, "utf8").toString("base64");
  const timeoutValue = process.env.DAEHOE_AI_TIMEOUT || "5m";
  const modelArg = AI_EXTRACT_MODEL ? `--model "${AI_EXTRACT_MODEL}"` : "";
  const script = [
    `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${prompt64}'))`,
    `& "${ANTIGRAVITY_CLI_COMMAND}" ${modelArg} --print $p --print-timeout "${timeoutValue}"`
  ].join("; ");
  return execFileAsync("powershell", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
    timeout: Number(process.env.DAEHOE_AI_TIMEOUT_MS || 360000)
  });
}

async function runCliJsonExtraction(job, execCli) {
  const imageItems = AI_USE_IMAGES ? (job.media || []).slice(0, AI_IMAGE_LIMIT).map((item) => ({
    url: item.url,
    localPath: mediaLocalPath(item.url)
  })) : [];
  const prompt = [
    "You are extracting structured data from Korean tennis tournament detail text and screenshots.",
    "Inspect public image URLs and local image paths when provided; use poster images as the primary source for venue, fee, eligibility, and registration dates.",
    "Return only JSON. No markdown.",
    "Keys: venueName, venueAddress, regionSido, regionSigungu, applicationStatus, applicationStartDate, applicationEndDate, eligibilityText, feeText, divisions, confidence, evidence.",
    "applicationStatus must be one of: 접수중, 접수예정, 준비중, 접수마감, 대진오픈, 대회종료, 취소, 연기, 미상.",
    `title=${job.titleRaw}`,
    `sourceUrl=${job.sourceUrl || ""}`,
    `images=${JSON.stringify(imageItems)}`,
    `detailText=${job.detailText || ""}`
  ].filter(Boolean).join("\n");
  const { stdout, stderr } = await execCli(prompt);
  const output = parseGeminiCliOutput(stdout);
  if (!output && stderr) console.warn(`[daehoe][cli] ${compact(stderr, 240)}`);
  return output;
}

function mediaLocalPath(url = "") {
  const value = String(url || "");
  if (!value || /^[a-z]+:\/\//i.test(value)) return "";
  try {
    return new URL(`../${value.replace(/^\.\//, "")}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  } catch {
    return "";
  }
}

function parseGeminiCliOutput(stdout) {
  const raw = String(stdout || "").trim();
  if (!raw) return null;
  const parsed = tryJson(raw);
  if (parsed) {
    if (parsed.venueName || parsed.divisions) return parsed;
    const text = parsed.response || parsed.text || parsed.output || parsed.content;
    const nested = extractJsonObject(String(text || ""));
    if (nested) return nested;
  }
  return extractJsonObject(raw);
}

async function enqueueGeminiExtraction(job) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const record = {
    queuedAt: new Date().toISOString(),
    titleRaw: job.titleRaw,
    sourceUrl: job.sourceUrl,
    detailText: job.detailText,
    media: job.media || []
  };
  await fs.appendFile(GEMINI_QUEUE_FILE, `${JSON.stringify(record)}\n`, "utf8");
  geminiQueueAppended = true;
}

async function applyQueuedGeminiExtractions(tournaments) {
  if (!AI_EXTRACT_ENABLED) return;
  const queue = await readGeminiQueue();
  if (!queue.length) return;
  const remaining = [];
  let applied = 0;
  const byUrl = new Map(tournaments.map((item) => [item.sourceUrl, item]));
  for (const job of dedupeGeminiQueue(queue)) {
    const tournament = byUrl.get(job.sourceUrl);
    if (!tournament || !shouldAnalyzeTournamentWithAi(`${job.titleRaw} ${job.detailText || ""}`)) continue;
    const details = await extractTournamentDetailsWithGeminiCliNoQueue(job);
    if (!details) {
      remaining.push(job);
      continue;
    }
    applyAiDetailsToTournament(tournament, details);
    applied += 1;
  }
  await writeGeminiQueue(remaining);
  if (applied || remaining.length) {
    console.log(`[daehoe][gemini] queue applied=${applied} remaining=${remaining.length}`);
  }
}

async function extractTournamentDetailsWithGeminiCliNoQueue(job) {
  try {
    const output = await runCliJsonExtraction(job, AI_EXTRACT_PROVIDER === "antigravity-cli" ? execAntigravityCli : execGeminiCli);
    return output ? normalizeAiExtract(output) : null;
  } catch (error) {
    if (isCliLimitError(error)) return null;
    console.warn(`[daehoe][gemini] queued extract skipped: ${job.titleRaw} - ${error.message}`);
    return null;
  }
}

async function readGeminiQueue() {
  try {
    const text = await fs.readFile(GEMINI_QUEUE_FILE, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeGeminiQueue(queue) {
  if (!queue.length) {
    await fs.rm(GEMINI_QUEUE_FILE, { force: true });
    return;
  }
  await fs.writeFile(GEMINI_QUEUE_FILE, `${queue.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
}

function dedupeGeminiQueue(queue) {
  const byUrl = new Map();
  for (const item of queue) byUrl.set(item.sourceUrl, item);
  return [...byUrl.values()];
}

function isCliLimitError(error) {
  const text = `${error?.message || ""}\n${error?.stdout || ""}\n${error?.stderr || ""}`.toLowerCase();
  return /quota|rate limit|rate-limit|limit exceeded|resource_exhausted|too many requests|429|1,000|1000/.test(text);
}

function applyAiDetailsToTournament(tournament, details) {
  tournament.venueName = details.venueName || tournament.venueName;
  tournament.feeText = details.feeText || tournament.feeText;
  tournament.eligibilityText = details.eligibilityText || tournament.eligibilityText;
  tournament.inferredEligibilityText = details.eligibilityText || tournament.inferredEligibilityText;
  tournament.registrationStatus = details.applicationStatus || tournament.registrationStatus;
  tournament.status = details.applicationStatus || tournament.status;
  tournament.applicationStartDate = details.applicationStartDate || tournament.applicationStartDate;
  tournament.applicationEndDate = details.applicationEndDate || tournament.applicationEndDate;
  tournament.divisions = divisionsFromAiDetails(details).length ? divisionsFromAiDetails(details) : tournament.divisions;
  tournament.extractionStatus = "ai";
  tournament.extractionModel = AI_EXTRACT_MODEL;
  tournament.extractedDetails = details;
  tournament.updatedAt = new Date().toISOString();
}

function divisionsFromAiDetails(details) {
  return (details.divisions || []).map((item) => {
    const division = normalizeDivision(item.divisionName || "");
    return {
      divisionName: division.normalized,
      gender: item.gender || division.gender,
      level: item.level || division.level,
      format: item.format || division.format,
      playDate: item.playDate,
      eligibilityText: item.eligibilityText,
      status: details.applicationStatus || "미상"
    };
  }).filter((item) => item.divisionName && item.divisionName !== "미상");
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return tryJson(text.slice(start, end + 1));
}

function tournamentExtractSchemaForPrompt() {
  return {
    venueName: "string",
    venueAddress: "string",
    regionSido: "string",
    regionSigungu: "string",
    applicationStatus: "접수중|접수예정|준비중|접수마감|대회진행중|대회종료|취소|연기|미상",
    applicationStartDate: "YYYY-MM-DD or empty string",
    applicationEndDate: "YYYY-MM-DD or empty string",
    eligibilityText: "string",
    feeText: "string",
    divisions: [{
      divisionName: "string",
      eligibilityText: "string",
      playDate: "YYYY-MM-DD or empty string",
      gender: "string",
      level: "string",
      format: "string"
    }],
    confidence: "number from 0 to 1",
    evidence: "short Korean source evidence"
  };
}

function tournamentExtractSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "venueName",
      "venueAddress",
      "regionSido",
      "regionSigungu",
      "applicationStatus",
      "applicationStartDate",
      "applicationEndDate",
      "eligibilityText",
      "feeText",
      "divisions",
      "confidence",
      "evidence"
    ],
    properties: {
      venueName: { type: "string" },
      venueAddress: { type: "string" },
      regionSido: { type: "string" },
      regionSigungu: { type: "string" },
      applicationStatus: { type: "string", enum: ["접수중", "접수예정", "준비중", "접수마감", "대회진행중", "대회종료", "취소", "연기", "미상"] },
      applicationStartDate: { type: "string" },
      applicationEndDate: { type: "string" },
      eligibilityText: { type: "string" },
      feeText: { type: "string" },
      divisions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["divisionName", "eligibilityText", "playDate", "gender", "level", "format"],
          properties: {
            divisionName: { type: "string" },
            eligibilityText: { type: "string" },
            playDate: { type: "string" },
            gender: { type: "string" },
            level: { type: "string" },
            format: { type: "string" }
          }
        }
      },
      confidence: { type: "number" },
      evidence: { type: "string" }
    }
  };
}

function responseOutputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function normalizeAiExtract(value) {
  if (!value || typeof value !== "object") return null;
  const cleanDate = (date) => (/^20\d{2}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : "");
  const cleanStatus = (status) => {
    const text = cleanText(status || "");
    if (!text || /unknown|null|undefined/i.test(text)) return "미상";
    return text;
  };
  return {
    venueName: cleanText(value.venueName || ""),
    venueAddress: cleanText(value.venueAddress || ""),
    regionSido: cleanText(value.regionSido || ""),
    regionSigungu: cleanText(value.regionSigungu || ""),
    applicationStatus: cleanStatus(value.applicationStatus || "미상"),
    applicationStartDate: cleanDate(value.applicationStartDate),
    applicationEndDate: cleanDate(value.applicationEndDate),
    eligibilityText: compact(cleanText(value.eligibilityText || ""), 600),
    feeText: compact(cleanText(value.feeText || ""), 160),
    divisions: Array.isArray(value.divisions) ? value.divisions.map((item) => ({
      divisionName: cleanText(item.divisionName || ""),
      eligibilityText: compact(cleanText(item.eligibilityText || ""), 240),
      playDate: cleanDate(item.playDate),
      gender: cleanText(item.gender || ""),
      level: cleanText(item.level || ""),
      format: cleanText(item.format || "")
    })) : [],
    confidence: Number(value.confidence || 0),
    evidence: compact(cleanText(value.evidence || ""), 500)
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchTextDecoded(url, encoding = "utf-8") {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding).decode(buffer);
}

function dedupe(tournaments) {
  const byKey = new Map();
  for (const tournament of tournaments) {
    const key = tournament.duplicateKey || `${tournament.titleNormalized}|${tournament.startDate}`;
    const existing = byKey.get(key);
    if (!existing || compareSourceQuality(tournament, existing) < 0) {
      byKey.set(key, {
        ...tournament,
        alternateSources: existing
          ? [...(existing.alternateSources || []), sourceRef(existing)]
          : tournament.alternateSources || []
      });
    } else {
      existing.alternateSources = [...(existing.alternateSources || []), sourceRef(tournament)];
    }
  }
  return [...byKey.values()];
}

function compareSourceQuality(a, b) {
  const priorityDelta = (SOURCE_PRIORITY[a.sourceType] || 99) - (SOURCE_PRIORITY[b.sourceType] || 99);
  if (priorityDelta) return priorityDelta;
  return (b.confidenceScore || 0) - (a.confidenceScore || 0);
}

function sourceRef(tournament) {
  return {
    sourceName: tournament.sourceName,
    sourceType: tournament.sourceType,
    sourceUrl: tournament.sourceUrl,
    sourceId: tournament.sourceId
  };
}

function sortForOutput(a, b) {
  return (a.startDate || "9999").localeCompare(b.startDate || "9999") ||
    (SOURCE_PRIORITY[a.sourceType] || 99) - (SOURCE_PRIORITY[b.sourceType] || 99) ||
    a.titleRaw.localeCompare(b.titleRaw, "ko");
}

function statusFromDateText(text = "") {
  const range = normalizeDateRange(text, 2026);
  if (!range.startDate) return "미상";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(range.startDate);
  const end = new Date(range.endDate || range.startDate);
  if (end < today) return "대회종료";
  if (start <= today && end >= today) return "대회진행중";
  return "접수예정";
}

function inferTournamentType(title = "") {
  if (/주니어|U10|U12|U14|U16|U18|학생|초등|중고/.test(title)) return "주니어";
  if (/대학/.test(title)) return "대학";
  if (/실업|오픈/.test(title)) return "엘리트";
  if (/테린이|동호인|생활체육|신인|개나리|국화|오픈부|베테랑/.test(title)) return "동호인대회";
  return "기타";
}

function inferEligibilityText(text = "") {
  const rules = [
    [/테린이|입문|초급|루키/i, "입문/초급"],
    [/신인|브론즈|B조|비랭킹/i, "신인/브론즈"],
    [/동배|은배|금배|국화|개나리|오픈부|마스터스|챌린저/i, "생활체육 등급"],
    [/실버|골드|플래티넘/i, "실버/골드 이상"],
    [/베테랑|시니어|장년/i, "베테랑/시니어"],
    [/여자|여성|여복/i, "여성부"],
    [/남자|남성|남복/i, "남성부"],
    [/혼복|혼합/i, "혼합복식"],
    [/\d+\s*년차|[1-9]년\s*이하|[1-9]년\s*미만/i, "연차 제한"]
  ];
  const found = rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return found.length ? `제목/요강 텍스트 기준 추정: ${uniqueTexts(found).join(", ")}. 정확한 참가 자격은 원문 요강을 확인하세요.` : undefined;
}

function isoDateOrUndefined(text = "") {
  const match = String(text).match(/20\d{2}-\d{2}-\d{2}/);
  return match?.[0];
}

function uniqueTexts(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueMediaItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url.replace(/&width=\d+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeSources(results) {
  const ok = results.filter((item) => item.status === "success" && item.detailCount > 0);
  if (!ok.length) return "수집 가능한 출처 없음";
  return `${ok.map((item) => item.sourceName).join(", ")} 수집`;
}

function absoluteUrl(base, href = "") {
  if (!href) return base;
  return new URL(href, base).toString();
}

function cleanText(html = "") {
  return decodeEntities(String(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function decodeEntities(text = "") {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function compact(text, limit) {
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}

function compactForAi(text, limit) {
  const cleaned = String(text || "")
    .replace(/window\.__OOPY__[\s\S]*?(?=(?:TTO|대회|요강|접수|참가|장소|일시|$))/i, " ")
    .replace(/\{[^{}]{0,1200}\}/g, " ")
    .replace(/(?:display|position|padding|margin|background|border|font|width|height|max-width|min-width|line-height|z-index|opacity|color|overflow|align-items|justify-content|flex|grid|box-shadow|transform|transition)\s*:[^;]+;?/gi, " ")
    .replace(/(?:^|\s)[.#][a-z0-9_-]+[a-z0-9_ .:#>\-[\]()="'%,]*\s/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(?:css|root|media|webkit|notion|oopy|lazyrockets|window|props|pageProps|recordMap)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact(cleaned, limit) || "";
}

function hashStable(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashShort(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
