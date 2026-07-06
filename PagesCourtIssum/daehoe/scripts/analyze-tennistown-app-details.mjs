import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT_DIR = new URL("../", import.meta.url);
const DATA_FILE = new URL("../data/tournaments.json", import.meta.url);
const MEDIA_DIR = new URL("../data/media/tennistown-app/", import.meta.url);
const QUEUE_FILE = new URL("../../.daehoe-gemini-extract-queue.jsonl", import.meta.url);

const ADB = process.env.DAEHOE_TENNISTOWN_ADB_PATH || ".tools\\android-platform-tools\\platform-tools\\adb.exe";
const ADB_SERIAL = process.env.DAEHOE_TENNISTOWN_ADB_SERIAL || "";
const AGY = process.env.ANTIGRAVITY_CLI_COMMAND || (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\agy\\bin\\agy.exe` : "agy");
const MODEL = process.env.DAEHOE_AI_EXTRACT_MODEL || "gemini-2.5-flash";
const YEAR = Number(process.env.DAEHOE_TENNISTOWN_ADB_YEAR || 2026);
const MONTHS = (process.env.DAEHOE_TENNISTOWN_APP_MONTHS || "7,8,9,10,11,12")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => value >= 1 && value <= 12);
const LIMIT = Number(process.env.DAEHOE_TENNISTOWN_DETAIL_CAPTURE_LIMIT || 999);
const MAX_SWIPES = Number(process.env.DAEHOE_TENNISTOWN_DETAIL_MAX_SWIPES || 24);
const BATCH_SIZE = Number(process.env.DAEHOE_TENNISTOWN_DETAIL_AI_BATCH || 8);
const SKIP_AI = process.env.DAEHOE_TENNISTOWN_DETAIL_SKIP_AI === "1";

const STATUS_MAP = new Map([
  ["recruiting", "\uc811\uc218\uc911"],
  ["closed", "\uc811\uc218\ub9c8\uac10"],
  ["ready", "\uc900\ube44\uc911"],
  ["unknown", "\ubbf8\uc0c1"]
]);

async function main() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const tournaments = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  const activeAppTournaments = tournaments.filter((item) =>
    item.sourceType === "TENNISTOWN_APP" &&
    item.startDate >= "2026-07-03" &&
    item.startDate <= "2026-12-31"
  );
  const captured = [];

  await ensureListOpen();
  for (const month of MONTHS) {
    await moveMonth(month);
    const seenDumps = new Set();
    for (let swipe = 0; swipe <= MAX_SWIPES && captured.length < LIMIT; swipe += 1) {
      const xml = await dumpXml();
      const dumpKey = hashShort(xml);
      if (seenDumps.has(dumpKey) && swipe > 0) break;
      seenDumps.add(dumpKey);

      const cards = parseCards(xml, month).filter((card) => findTournamentForCard(activeAppTournaments, card));

      for (const card of cards) {
        if (captured.length >= LIMIT) break;
        const tournament = findTournamentForCard(activeAppTournaments, card);
        if (!tournament) continue;
        const details = await captureDetail(card, tournament);
        if (!details) continue;
        applyDetails(tournament, details);
        captured.push({ tournament, details });
        await backToList();
      }

      await adb("shell", "input", "swipe", "540", "1700", "540", "650", "500");
      await delay(1100);
    }
  }

  if (!SKIP_AI && captured.length) {
    await analyzeBatches(captured);
  }

  await fs.writeFile(DATA_FILE, `${JSON.stringify(tournaments, null, 2)}\n`, "utf8");
  console.log(`[tennistown-detail] captured=${captured.length} ai=${SKIP_AI ? "skipped" : "attempted"}`);
}

async function ensureListOpen() {
  await adb("devices");
  await adb("shell", "am", "force-stop", "com.momzit.tennistown");
  await delay(1000);
  await adb("shell", "monkey", "-p", "com.momzit.tennistown", "-c", "android.intent.category.LAUNCHER", "1");
  await delay(3500);
  let values = decodeValues(await dumpXml());
  if (!values.includes("\ub300\ud68c \ubaa9\ub85d")) {
    await adb("shell", "input", "tap", "520", "1165");
    await delay(3000);
    values = decodeValues(await dumpXml());
  }
  if (!values.includes("\ub300\ud68c \ubaa9\ub85d")) {
    throw new Error("TennisTown tournament list was not visible");
  }
}

async function moveMonth(targetMonth) {
  for (let step = 0; step < 14; step += 1) {
    const current = readVisibleMonth(decodeValues(await dumpXml()));
    if (current === targetMonth) return;
    const tapX = current && current > targetMonth ? 410 : 670;
    await adb("shell", "input", "tap", String(tapX), "250");
    await delay(1600);
  }
  throw new Error(`Could not move to ${targetMonth}`);
}

async function captureDetail(card, tournament) {
  const [x1, y1, x2, y2] = card.bounds;
  await adb("shell", "input", "tap", String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
  await delay(2500);
  const detailXml = await dumpXml();
  const values = decodeValues(detailXml);
  if (!values.includes("\ub300\ud68c \uc0c1\uc138")) return null;

  const slug = `${tournament.startDate}-${safeSlug(tournament.titleRaw)}-${hashShort(tournament.sourceId)}`;
  const remote = `/sdcard/${slug}.png`;
  const localPath = path.join(filePath(MEDIA_DIR), `${slug}.png`);
  await adb("shell", "screencap", "-p", remote);
  await adb("pull", remote, localPath);
  await adb("shell", "rm", "-f", remote);
  await cropLocalPng(localPath);

  return {
    ...parseDetailValues(values),
    mediaUrl: `data/media/tennistown-app/${path.basename(localPath)}`,
    localPath,
    text: sanitizeDetailText(values).join("\n")
  };
}

async function analyzeBatches(captured) {
  for (let index = 0; index < captured.length; index += BATCH_SIZE) {
    const batch = captured.slice(index, index + BATCH_SIZE);
    try {
      const prompt = buildAiPrompt(batch);
      const { stdout } = await execFileAsync(AGY, ["--model", MODEL, "--print", prompt, "--print-timeout", "8m"], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10,
        timeout: 540000,
        windowsHide: true
      });
      const parsed = extractJson(stdout);
      if (!Array.isArray(parsed)) throw new Error("AI output was not an array");
      for (const item of parsed) {
        const row = batch.find((entry) => entry.tournament.sourceId === item.sourceId);
        if (row) applyAi(row.tournament, item);
      }
      console.log(`[tennistown-detail] ai batch ${index / BATCH_SIZE + 1}: ${batch.length}`);
    } catch (error) {
      await enqueue(batch);
      console.warn(`[tennistown-detail] ai queued after failure: ${error.message}`);
    }
  }
}

function buildAiPrompt(batch) {
  return [
    "Analyze these Korean TennisTown tournament detail screenshots.",
    "Return only a JSON array. No markdown.",
    "For each item, return: sourceId, venueName, feeText, applicationStatus, applicationStartDate, applicationEndDate, eligibilityText, participantCurrent, participantCapacity, confidence, evidence.",
    "Use empty strings for unknown dates. applicationStatus should be one of: \uc811\uc218\uc911, \uc811\uc218\uc608\uc815, \uc900\ube44\uc911, \uc811\uc218\ub9c8\uac10, \ub300\uc9c4\uc624\ud508, \ub300\ud68c\uc885\ub8cc, \ucde8\uc18c, \uc5f0\uae30, \ubbf8\uc0c1.",
    "Input:",
    JSON.stringify(batch.map(({ tournament, details }) => ({
      sourceId: tournament.sourceId,
      titleRaw: tournament.titleRaw,
      startDate: tournament.startDate,
      imageFile: details.localPath,
      detailText: details.text
    })), null, 2)
  ].join("\n");
}

function applyDetails(tournament, details) {
  tournament.media = uniqueMedia([
    ...(tournament.media || []),
    { url: details.mediaUrl, alt: tournament.titleRaw, type: "image" }
  ]);
  tournament.detailText = details.text || tournament.detailText;
  tournament.venueName = details.venueName || tournament.venueName;
  tournament.feeText = details.feeText || tournament.feeText;
  tournament.eligibilityText = details.eligibilityText || tournament.eligibilityText;
  tournament.inferredEligibilityText = details.eligibilityText || tournament.inferredEligibilityText;
  tournament.registrationStatus = details.applicationStatus || tournament.registrationStatus;
  tournament.status = details.applicationStatus || tournament.status;
  tournament.participantCurrent = Number.isFinite(details.participantCurrent) ? details.participantCurrent : tournament.participantCurrent;
  tournament.participantCapacity = Number.isFinite(details.participantCapacity) ? details.participantCapacity : tournament.participantCapacity;
  for (const division of tournament.divisions || []) {
    division.feeText = details.feeText || division.feeText;
    division.eligibilityText = details.eligibilityText || division.eligibilityText;
    division.status = details.applicationStatus || division.status;
    division.participantCurrent = Number.isFinite(details.participantCurrent) ? details.participantCurrent : division.participantCurrent;
    division.participantCapacity = Number.isFinite(details.participantCapacity) ? details.participantCapacity : division.participantCapacity;
  }
  tournament.updatedAt = new Date().toISOString();
}

function applyAi(tournament, item) {
  const details = {
    venueName: text(item.venueName),
    feeText: text(item.feeText),
    applicationStatus: normalizeStatusText(text(item.applicationStatus)),
    applicationStartDate: dateText(item.applicationStartDate),
    applicationEndDate: dateText(item.applicationEndDate),
    eligibilityText: text(item.eligibilityText),
    participantCurrent: Number(item.participantCurrent),
    participantCapacity: Number(item.participantCapacity),
    confidence: Number(item.confidence || 0),
    evidence: typeof item.evidence === "string" ? item.evidence : JSON.stringify(item.evidence || "")
  };
  if (details.venueName) tournament.venueName = details.venueName;
  if (details.feeText) tournament.feeText = details.feeText;
  if (details.eligibilityText) {
    tournament.eligibilityText = details.eligibilityText;
    tournament.inferredEligibilityText = details.eligibilityText;
  }
  if (details.applicationStatus && details.applicationStatus !== STATUS_MAP.get("unknown")) {
    tournament.registrationStatus = details.applicationStatus;
    tournament.status = details.applicationStatus;
  }
  if (details.applicationStartDate) tournament.applicationStartDate = details.applicationStartDate;
  if (details.applicationEndDate) tournament.applicationEndDate = details.applicationEndDate;
  if (Number.isFinite(details.participantCurrent)) tournament.participantCurrent = details.participantCurrent;
  if (Number.isFinite(details.participantCapacity)) tournament.participantCapacity = details.participantCapacity;
  tournament.extractionStatus = "ai";
  tournament.extractionModel = MODEL;
  tournament.extractedDetails = details;
  tournament.updatedAt = new Date().toISOString();
}

function parseDetailValues(values) {
  const result = {};
  const joined = values.join("\n");
  const participant = joined.match(/(\d+)\s*\/\s*(\d+)/);
  if (participant) {
    result.participantCurrent = Number(participant[1]);
    result.participantCapacity = Number(participant[2]);
  }
  result.applicationStatus = normalizeStatusText(values.find((value) => /접수|모집|대진|종료|취소|연기/.test(value)) || "");
  result.eligibilityText = values.find((value) => /남복|여복|혼복|남단|여단|브론즈|실버|골드|아이언|개나리|국화|신인|오픈/.test(value) && value.length < 80) || "";
  const venueIndex = values.findIndex((value) => value === "\uc704\uce58\ubcf4\uae30");
  if (venueIndex > 0) result.venueName = values[venueIndex - 1];
  const fee = values.find((value) => /참가비|팀당|\d[\d,]*\s*원/.test(value));
  if (fee) result.feeText = fee.replace(/^참가비:\s*/, "");
  return result;
}

async function cropLocalPng(localPath) {
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$path=${JSON.stringify(localPath)}`,
    "$img=[System.Drawing.Image]::FromFile($path)",
    "try {",
    "  $h=[Math]::Min(1835,$img.Height)",
    "  if ($img.Height -gt $h) {",
    "    $bmp=New-Object System.Drawing.Bitmap($img.Width,$h)",
    "    $g=[System.Drawing.Graphics]::FromImage($bmp)",
    "    $g.DrawImage($img,0,0,[System.Drawing.Rectangle]::new(0,0,$img.Width,$h),[System.Drawing.GraphicsUnit]::Pixel)",
    "    $g.Dispose(); $img.Dispose(); $bmp.Save($path,[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()",
    "  }",
    "} finally { try { $img.Dispose() } catch {} }"
  ].join("; ");
  await execFileAsync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30000,
    windowsHide: true
  });
}

function sanitizeDetailText(values) {
  return values.filter((value, index, list) => {
    if (/님$|신청불가|현재$|은$|상태입니다/.test(value)) return false;
    if (value === "현재" && /님$/.test(list[index + 1] || "")) return false;
    return true;
  });
}

function parseCards(xml, month) {
  return [...xml.matchAll(/<node\b[^>]*content-desc="([^"]+)"[^>]*clickable="true"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)]
    .map((match) => {
      const value = decodeXml(match[1]).replace(/\u200b/g, "").trim();
      if (!/^\d{2},\s*[A-Z]{3},\s*/.test(value)) return null;
      const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
      if (parts.length < 6) return null;
      const [day] = parts;
      const parsed = parseCardParts(parts.slice(2));
      if (!parsed) return null;
      return {
        startDate: `${YEAR}-${String(month).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`,
        ...parsed,
        bounds: match.slice(2).map(Number)
      };
    })
    .filter(Boolean);
}

function parseCardParts(parts) {
  const tail = [...parts];
  const statusParts = [];
  while (tail.length && isStatusToken(tail.at(-1))) {
    statusParts.unshift(tail.pop());
  }
  if (tail.length < 3) return null;
  const venueName = tail.pop();
  const divisionName = tail.pop();
  const titleRaw = tail.join(", ");
  return {
    titleRaw,
    divisionName,
    venueName,
    status: statusParts.join(" · ") || "미상"
  };
}

function isStatusToken(value = "") {
  const text = String(value).trim();
  return /^(\d+)\s*\/\s*(\d+)$/.test(text) || /^(신청|LIVE|임박|대기|마감|모집중|모집예정|접수중|접수예정|접수마감|종료)$/.test(text);
}

function matchKey(item) {
  return [
    item.startDate,
    normalize(item.titleRaw),
    normalize((item.divisions?.[0]?.divisionName || item.divisionName || "")),
    normalize(item.venueName || "")
  ].join("|");
}

function findTournamentForCard(tournaments, card) {
  const cardTitle = normalize(card.titleRaw);
  const cardDivision = normalize(card.divisionName);
  const cardVenue = normalize(card.venueName);
  const candidates = tournaments
    .filter((item) => item.startDate === card.startDate && !hasDetailMedia(item))
    .map((item) => {
      const title = normalize(item.titleRaw);
      const division = normalize(item.divisions?.[0]?.divisionName || item.divisionName || "");
      const venue = normalize(item.venueName || "");
      let score = 0;
      if (title === cardTitle) score += 80;
      else if (title.includes(cardTitle) || cardTitle.includes(title)) score += 55;
      else if (sharedPrefixLength(title, cardTitle) >= 10) score += 30;
      if (division && cardDivision && (division === cardDivision || division.includes(cardDivision) || cardDivision.includes(division))) score += 25;
      if (venue && cardVenue && (venue === cardVenue || venue.includes(cardVenue) || cardVenue.includes(venue))) score += 15;
      return { item, score };
    })
    .filter((entry) => entry.score >= 55)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.item || null;
}

function sharedPrefixLength(left, right) {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) index += 1;
  return index;
}

function hasDetailMedia(tournament) {
  return (tournament.media || []).some((item) => /data\/media\/tennistown-app\//.test(item.url || ""));
}

async function backToList() {
  await adb("shell", "input", "keyevent", "4");
  await delay(1400);
}

async function dumpXml() {
  await adb("shell", "timeout", "12", "uiautomator", "dump", "/sdcard/tt-window.xml");
  const { stdout } = await adb("exec-out", "cat", "/sdcard/tt-window.xml");
  return stdout;
}

function decodeValues(xml) {
  return [...xml.matchAll(/(?:text|content-desc)="([^"]+)"/g)]
    .map((match) => decodeXml(match[1]).replace(/\u200b/g, "").trim())
    .filter(Boolean);
}

function readVisibleMonth(values) {
  for (let index = 0; index < values.length - 1; index += 1) {
    const month = Number(values[index]);
    if (month >= 1 && month <= 12 && values[index + 1] === "\uc6d4") return month;
  }
  return null;
}

function decodeXml(value) {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalize(value = "") {
  return String(value).replace(/\u200b/g, "").replace(/\s+/g, "").toLowerCase();
}

function normalizeStatusText(value = "") {
  const status = String(value || "");
  if (/취소/.test(status)) return "\ucde8\uc18c";
  if (/연기/.test(status)) return "\uc5f0\uae30";
  if (/대진/.test(status)) return "\ub300\uc9c4\uc624\ud508";
  if (/접수\s*중|모집\s*중|신청\s*가능/.test(status)) return "\uc811\uc218\uc911";
  if (/접수\s*예정|모집\s*예정|준비/.test(status)) return "\uc811\uc218\uc608\uc815";
  if (/마감|모집\s*완료/.test(status)) return "\uc811\uc218\ub9c8\uac10";
  if (/종료/.test(status)) return "\ub300\ud68c\uc885\ub8cc";
  return status || STATUS_MAP.get("unknown");
}

function extractJson(output) {
  const textValue = String(output || "").trim();
  try {
    const parsed = JSON.parse(textValue);
    if (Array.isArray(parsed)) return parsed;
    const nested = parsed.response || parsed.text || parsed.output || parsed.content;
    if (nested) return extractJson(nested);
  } catch {}
  const start = textValue.indexOf("[");
  const end = textValue.lastIndexOf("]");
  if (start >= 0 && end > start) return JSON.parse(textValue.slice(start, end + 1));
  return null;
}

async function enqueue(batch) {
  const lines = batch.map(({ tournament, details }) => JSON.stringify({
    queuedAt: new Date().toISOString(),
    titleRaw: tournament.titleRaw,
    sourceUrl: tournament.sourceUrl,
    detailText: details.text,
    media: tournament.media || []
  }));
  await fs.appendFile(QUEUE_FILE, `${lines.join("\n")}\n`, "utf8");
}

function uniqueMedia(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dateText(value) {
  const candidate = String(value || "");
  return /^20\d{2}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

function text(value) {
  return String(value || "").trim();
}

function safeSlug(value) {
  return normalize(value).replace(/[^a-z0-9가-힣_-]+/gi, "-").slice(0, 48) || "tournament";
}

function hashShort(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function filePath(url) {
  return path.resolve(url.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}

async function adb(...args) {
  const serialArgs = ADB_SERIAL ? ["-s", ADB_SERIAL] : [];
  return execFileAsync(ADB, [...serialArgs, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    timeout: 45000,
    windowsHide: true
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
