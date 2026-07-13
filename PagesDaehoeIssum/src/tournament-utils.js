export const STATUS_ORDER = ["접수중", "접수예정", "접수마감", "대회진행중", "대회종료", "취소", "연기", "미상"];

const REGION_HINTS = [
  ["서울", "서울특별시", undefined],
  ["송파", "서울특별시", "송파구"],
  ["성남", "경기도", "성남시"],
  ["용인", "경기도", "용인시"],
  ["수원", "경기도", "수원시"],
  ["화성", "경기도", "화성시"],
  ["안양", "경기도", "안양시"],
  ["의왕", "경기도", "의왕시"],
  ["하남", "경기도", "하남시"],
  ["광주", "경기도", "광주시"],
  ["고양", "경기도", "고양시"],
  ["파주", "경기도", "파주시"],
  ["안성", "경기도", "안성시"],
  ["이천", "경기도", "이천시"],
  ["인천", "인천광역시", undefined],
  ["서귀포", "제주특별자치도", "서귀포시"],
  ["제주", "제주특별자치도", undefined],
  ["대전", "대전광역시", undefined],
  ["구미", "경상북도", "구미시"],
  ["문경", "경상북도", "문경시"],
  ["상주", "경상북도", "상주시"],
  ["창원", "경상남도", "창원시"],
  ["서천", "충청남도", "서천군"],
  ["아산", "충청남도", "아산시"],
  ["예산", "충청남도", "예산군"],
  ["보령", "충청남도", "보령시"],
  ["부여", "충청남도", "부여군"],
  ["논산", "충청남도", "논산시"],
  ["고성", "강원특별자치도", "고성군"],
  ["춘천", "강원특별자치도", "춘천시"],
  ["홍천", "강원특별자치도", "홍천군"],
  ["제천", "충청북도", "제천시"],
  ["음성", "충청북도", "음성군"]
];

export function normalizeStatus(text = "") {
  if (/취소/.test(text)) return "취소";
  if (/연기/.test(text)) return "연기";
  if (/접수중|신청 가능|신청가능|접수 가능|접수가능/.test(text)) return "접수중";
  if (/접수예정|준비중|예정/.test(text)) return "접수예정";
  if (/마감|접수종료|신청마감/.test(text)) return "접수마감";
  if (/진행/.test(text)) return "대회진행중";
  if (/종료|결과/.test(text)) return "대회종료";
  return "미상";
}

export function normalizeRegistrationStatusCode(text = "") {
  const raw = String(text || "");
  if (/취소|대회취소/.test(raw)) return "CANCELED";
  if (/마감|접수종료|신청마감/.test(raw)) return "CLOSED";
  if (/접수중|모집중|신청 가능|신청가능|접수 가능|접수가능|LIVE/.test(raw)) return "OPEN";
  if (/모집예정|접수예정|준비중|예정/.test(raw)) return "UPCOMING";
  return "UNKNOWN";
}

export function parseRegistrationCount(raw = "") {
  const text = String(raw || "").trim();
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  return {
    raw: text,
    current: match ? Number(match[1]) : null,
    capacity: match ? Number(match[2]) : null
  };
}

export function parseFeeText(raw = "") {
  const text = String(raw || "").trim();
  const isFree = /무료|free/i.test(text);
  const normalized = text.replace(/,/g, "");
  const amountMatch = normalized.match(/(\d+)\s*(?:원|₩|KRW)/i) || normalized.match(/(\d+)(?!\s*인)/);
  let unit = "unknown";
  if (/인당|1인|개인|person/i.test(text)) unit = "person";
  else if (/팀|조|페어|복식|대회|team/i.test(text)) unit = "team";
  return {
    raw: text,
    amount: isFree ? 0 : amountMatch ? Number(amountMatch[1]) : null,
    unit
  };
}

export function extractTitleTags(title = "") {
  return [...String(title || "").matchAll(/\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

export function normalizeRegion(text = "") {
  const compact = text.replace(/\s+/g, "");
  const region = {};
  if (/경기도|경기\s/.test(text)) {
    region.regionSido = "경기도";
  }
  for (const [keyword, sido, sigungu] of REGION_HINTS) {
    if (compact.includes(keyword)) {
      region.regionSido = sido;
      if (sigungu) region.regionSigungu = sigungu;
    }
  }
  return region;
}

export function normalizeDivision(divisionName = "") {
  const text = divisionName.replace(/\s+/g, "");
  const maps = [
    { keywords: ["개나리"], normalized: "개나리부", gender: "여성", level: "개나리", format: "복식" },
    { keywords: ["국화"], normalized: "국화부", gender: "여성", level: "국화", format: "복식" },
    { keywords: ["여자퓨처스"], normalized: "여자퓨처스부", gender: "여성", level: "미상", format: "복식" },
    { keywords: ["챌린저"], normalized: "챌린저부", gender: "무관", level: "챌린저", format: "복식" },
    { keywords: ["마스터스"], normalized: "마스터스부", gender: "무관", level: "마스터스", format: "복식" },
    { keywords: ["베테랑"], normalized: "베테랑부", gender: "무관", level: "시니어", format: "복식" },
    { keywords: ["신인"], normalized: "신인부", gender: "무관", level: "신인", format: "복식" },
    { keywords: ["테린이"], normalized: "테린이부", gender: "무관", level: "테린이", format: "복식" },
    { keywords: ["혼복", "혼합복식"], normalized: "혼합복식부", gender: "혼합", level: "미상", format: "혼합복식" },
    { keywords: ["단체"], normalized: "단체전", gender: "무관", level: "미상", format: "단체전" },
    { keywords: ["동배"], normalized: "동배부", gender: "무관", level: "동배", format: "복식" },
    { keywords: ["은배"], normalized: "은배부", gender: "무관", level: "은배", format: "복식" },
    { keywords: ["금배"], normalized: "금배부", gender: "무관", level: "금배", format: "복식" },
    { keywords: ["오픈"], normalized: "오픈부", gender: "무관", level: "오픈", format: "복식" }
  ];
  const match = maps.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  return match || { normalized: divisionName.trim() || "미상", gender: "미상", level: "미상", format: "미상" };
}

export function normalizeTitle(text = "") {
  return text
    .replace(/\([^)]*\)/g, "")
    .replace(/제\s*\d+\s*회/g, "")
    .replace(/20\d{2}/g, "")
    .replace(/생활체육|전국동호인|동호인|테니스대회|테니스/g, "")
    .replace(/[^가-힣a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function normalizeVenueName(text = "") {
  return text
    .replace(/\([^)]*\)/g, "")
    .replace(/테니스장|테니스코트|테니스|코트|돔구장|및|외|보조구장|보조경기장|실내|실외/g, "")
    .replace(/[^가-힣a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function normalizeKoreanDateTime(text = "", baseYear = new Date().getFullYear()) {
  const match = text.match(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일(?:\s*\([^)]+\))?(?:\s*(\d{1,2})[:시](\d{2})?)?/);
  if (!match) return {};
  return {
    startDate: `${match[1] || baseYear}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`,
    startTime: match[4] ? `${String(match[4]).padStart(2, "0")}:${match[5] || "00"}` : undefined
  };
}

export function normalizeDateRange(text = "", baseYear = new Date().getFullYear()) {
  const matches = [...text.matchAll(/(?:(20\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?(?:\s*\([^)]+\))?(?:\s*(\d{1,2})[:시](\d{2})?)?/g)];
  if (!matches.length) return {};
  const toDate = (match) => `${match[1] || baseYear}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  return {
    startDate: toDate(matches[0]),
    endDate: toDate(matches[1] || matches[0]),
    startTime: matches[0][4] ? `${String(matches[0][4]).padStart(2, "0")}:${matches[0][5] || "00"}` : undefined
  };
}

export function buildDuplicateKey(tournament) {
  return [
    tournament.titleNormalized || normalizeTitle(tournament.titleRaw),
    tournament.startDate || "",
    tournament.regionSigungu || "",
    normalizeVenueName(tournament.venueName || "")
  ].join("|");
}

export function calculateConfidenceScore(tournament) {
  let score = 0;
  if (tournament.titleRaw) score += 20;
  if (tournament.startDate) score += 20;
  if (tournament.venueName) score += 15;
  if (tournament.regionSido || tournament.regionSigungu) score += 10;
  if ((tournament.divisions || []).length > 0) score += 10;
  if ((tournament.divisions || []).some((division) => division.applicationUrl) || tournament.sourceUrl) score += 10;
  if (["KTA", "KATO", "KATA", "LOCAL_ASSOC"].includes(tournament.sourceType)) score += 15;
  return Math.min(score, 100);
}

export function scoreVenueMatch(tournament, courtVenue) {
  const left = normalizeVenueName(tournament.venueName || "");
  const right = normalizeVenueName(courtVenue.name || "");
  if (!left || !right) return 0;
  const exact = left === right ? 60 : 0;
  const contains = left.includes(right) || right.includes(left) ? 35 : 0;
  const region = tournament.regionSigungu && tournament.regionSigungu === courtVenue.regionSigungu ? 25 : 0;
  return Math.min(100, exact || contains ? Math.max(exact, contains) + region : region);
}

export function enrichTournament(tournament) {
  const region = normalizeRegion(`${tournament.titleRaw || ""} ${tournament.venueName || ""} ${tournament.venueAddress || ""}`);
  const enriched = {
    ...tournament,
    regionSido: tournament.regionSido || region.regionSido,
    regionSigungu: tournament.regionSigungu || region.regionSigungu,
    titleNormalized: tournament.titleNormalized || normalizeTitle(tournament.titleRaw),
    status: normalizeStatus(tournament.status)
  };
  return {
    ...enriched,
    duplicateKey: tournament.duplicateKey || buildDuplicateKey(enriched),
    confidenceScore: tournament.confidenceScore ?? calculateConfidenceScore(enriched)
  };
}

export function isWeekendInRange(tournament, now = new Date()) {
  const start = new Date(tournament.startDate);
  const end = new Date(tournament.endDate || tournament.startDate);
  if (Number.isNaN(start.getTime())) return false;
  const day = now.getDay();
  const saturday = new Date(now);
  saturday.setDate(now.getDate() + ((6 - day + 7) % 7));
  saturday.setHours(0, 0, 0, 0);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);
  return start <= sunday && end >= saturday;
}

export function filterTournaments(tournaments, filters) {
  return tournaments.filter((tournament) => {
    if (filters.region && `${tournament.regionSido || ""} ${tournament.regionSigungu || ""}`.trim() !== filters.region) return false;
    if (filters.status && tournament.status !== filters.status) return false;
    if (filters.openOnly && tournament.status !== "접수중") return false;
    if (filters.weekendOnly && !isWeekendInRange(tournament)) return false;
    if (filters.date) {
      const selected = new Date(filters.date);
      const start = new Date(tournament.startDate);
      const end = new Date(tournament.endDate || tournament.startDate);
      if (selected < start || selected > end) return false;
    }
    if (filters.division) {
      const found = (tournament.divisions || []).some((division) => division.divisionName === filters.division || division.level === filters.division || division.format === filters.division);
      if (!found) return false;
    }
    return true;
  });
}
