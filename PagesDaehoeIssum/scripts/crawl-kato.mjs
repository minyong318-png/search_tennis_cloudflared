import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  calculateConfidenceScore,
  normalizeDateRange,
  normalizeDivision,
  normalizeKoreanDateTime,
  normalizeRegion,
  normalizeStatus,
  normalizeTitle,
  buildDuplicateKey
} from "../src/tournament-utils.js";

const SOURCE_NAME = "KATO";
const SOURCE_TYPE = "KATO";
const BASE_URL = "https://kato.kr";
const LIST_URL = `${BASE_URL}/openList`;
const OUT_DIR = new URL("../data/", import.meta.url);
const USER_AGENT = "daehoe-isseum-crawler/0.1 (+https://daehoe-isseum.pages.dev/)";
const REQUEST_DELAY_MS = 1200;
const DETAIL_LIMIT = Number(process.env.DAEHOE_DETAIL_LIMIT || 40);

async function main() {
  const startedAt = new Date().toISOString();
  const listHtml = await fetchText(LIST_URL);
  const listItems = parseKatoList(listHtml);
  const candidates = listItems.slice(0, DETAIL_LIMIT);

  const tournaments = [];
  const errors = [];

  for (const item of candidates) {
    try {
      await delay(REQUEST_DELAY_MS);
      const detailHtml = await fetchText(item.detailUrl);
      tournaments.push(normalizeKatoTournament(item, detailHtml));
    } catch (error) {
      errors.push({ sourceUrl: item.detailUrl, message: error.message });
      tournaments.push(normalizeKatoTournament(item, ""));
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(new URL("tournaments.json", OUT_DIR), `${JSON.stringify(tournaments, null, 2)}\n`, "utf8");
  await fs.writeFile(new URL("crawl-meta.json", OUT_DIR), `${JSON.stringify({
    sourceName: SOURCE_NAME,
    sourceUrl: LIST_URL,
    startedAt,
    finishedAt: new Date().toISOString(),
    listCount: listItems.length,
    detailCount: tournaments.length,
    errorCount: errors.length,
    errors
  }, null, 2)}\n`, "utf8");

  console.log(`[daehoe] KATO list=${listItems.length} detail=${tournaments.length} errors=${errors.length}`);
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

function parseKatoList(html) {
  const tableMatches = html.match(/<table>[\s\S]*?<\/table>/g) || [];
  const seen = new Set();
  const items = [];
  for (const table of tableMatches) {
    const titleLink = table.match(/<a href="(\/openGame\/(\d+))" class="content-title">\s*([\s\S]*?)\s*<\/a>/);
    if (!titleLink) continue;
    const sourceId = titleLink[2];
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const parts = textFromMatch(table.match(/<span class="parts">([\s\S]*?)<\/span>/));
    const dateText = textFromMatch(table.match(/<div class="date">([\s\S]*?)<\/div>/));
    const statusCandidates = [...table.matchAll(/<span class="[^"]*">([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1]));
    const statusText = statusCandidates.find((value) => /접수|종료|마감|예정|진행/.test(value)) || "미상";
    const titleRaw = cleanText(titleLink[3]);
    const detailUrl = `${BASE_URL}${titleLink[1]}`;

    if (!titleRaw || !dateText) continue;
    items.push({
      sourceName: SOURCE_NAME,
      sourceType: SOURCE_TYPE,
      sourceUrl: LIST_URL,
      sourceId,
      titleRaw,
      dateText,
      divisionText: parts,
      statusText,
      detailUrl
    });
  }
  return items;
}

function normalizeKatoTournament(item, detailHtml) {
  const detail = detailHtml ? parseKatoDetail(detailHtml) : {};
  const dateRange = normalizeDateRange(item.dateText, 2026);
  const venueName = detail.venueName || "";
  const region = normalizeRegion(`${item.titleRaw} ${venueName}`);
  const status = normalizeStatus(item.statusText);
  const divisions = detail.divisions.length ? detail.divisions : parseListDivisions(item.divisionText, dateRange, item.detailUrl, status);

  const tournament = {
    id: `kato-${item.sourceId}`,
    sourceType: SOURCE_TYPE,
    sourceName: SOURCE_NAME,
    sourceUrl: item.detailUrl,
    sourceId: item.sourceId,
    titleRaw: item.titleRaw,
    titleNormalized: normalizeTitle(item.titleRaw),
    regionSido: region.regionSido,
    regionSigungu: region.regionSigungu,
    tournamentScope: "전국",
    tournamentType: "랭킹대회",
    organizer: detail.organizer || "KATO",
    host: detail.host,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    registrationStartAt: detail.registrationStartAt,
    registrationEndAt: detail.registrationEndAt,
    refundDeadlineAt: detail.refundDeadlineAt,
    status,
    venueName,
    feeText: detail.feeText,
    prizeText: detail.prizeText,
    ballText: detail.ballText,
    eligibilityText: detail.eligibilityText,
    applicationMethodText: "KATO 원문 신청 페이지 확인",
    detailText: detail.noticeText,
    attachments: [],
    divisions,
    crawledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  tournament.contentHash = hashStable({
    titleRaw: tournament.titleRaw,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    venueName: tournament.venueName,
    divisions: tournament.divisions
  });
  tournament.duplicateKey = buildDuplicateKey(tournament);
  tournament.confidenceScore = calculateConfidenceScore(tournament);
  return tournament;
}

function parseKatoDetail(html) {
  const rowValue = (labelPattern) => {
    const regex = new RegExp(`<td[^>]*>${labelPattern}<\\/td>\\s*<td[^>]*colspan="2"[^>]*>([\\s\\S]*?)<\\/td>`, "i");
    return cleanText((html.match(regex) || [])[1] || "");
  };

  const venueName = rowValue("장\\s*소");
  const organizer = rowValue("주\\s*최");
  const host = rowValue("주\\s*관");
  const feeText = rowValue("참가비");
  const ballText = rowValue("사용구");
  const refundText = rowValue("환불마감");
  const prizeText = safeCompact(rowValue("시\\s*상"), 180);
  const noticeText = safeCompact(rowValue("대회안내"), 220);
  const eligibilityText = safeCompact(rowValue("참가자격"), 220);
  const registrationStartAt = parseFirstDateTime(refundText, /신청개시일[^0-9]*(20\d{2}년\s*\d{1,2}월\s*\d{1,2}일[^.]*)/);
  const refundDeadlineAt = parseFirstDateTime(refundText, /환불마감일[^0-9]*(?:전부서[^0-9]*)?(20\d{2}년\s*\d{1,2}월\s*\d{1,2}일[^.]*)/);

  return {
    venueName,
    organizer,
    host,
    feeText,
    ballText,
    prizeText,
    noticeText,
    eligibilityText,
    registrationStartAt,
    registrationEndAt: refundDeadlineAt,
    refundDeadlineAt,
    divisions: parseDetailDivisions(html, feeText)
  };
}

function parseDetailDivisions(html, feeText) {
  const rows = [];
  const seen = new Set();
  const regex = /<td[^>]*class="(?:first-comp|rowcell)"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  for (const match of html.matchAll(regex)) {
    const divisionNameRaw = cleanText(match[1]);
    const dateText = cleanText(match[2]);
    if (!divisionNameRaw || !/\d{4}년/.test(dateText)) continue;
    const key = `${divisionNameRaw}|${dateText}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const division = normalizeDivision(divisionNameRaw);
    const parsedDate = normalizeKoreanDateTime(dateText, 2026);
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

function parseListDivisions(divisionText, dateRange, applicationUrl, status) {
  return divisionText
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((divisionNameRaw) => {
      const division = normalizeDivision(divisionNameRaw);
      return {
        divisionName: division.normalized,
        gender: division.gender,
        level: division.level,
        format: division.format,
        playDate: dateRange.startDate,
        applicationUrl,
        status: status === "접수중" ? "접수중" : "미상"
      };
    });
}

function parseFirstDateTime(text, pattern) {
  const matched = text.match(pattern);
  if (!matched) return undefined;
  const parsed = normalizeKoreanDateTime(matched[1], 2026);
  if (!parsed.startDate) return undefined;
  return `${parsed.startDate}T${parsed.startTime || "00:00"}:00+09:00`;
}

function textFromMatch(match) {
  return cleanText((match || [])[1] || "");
}

function cleanText(html = "") {
  return decodeEntities(String(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function safeCompact(text, limit) {
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function hashStable(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
