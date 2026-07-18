const CLOSED_STATUSES = new Set(["접수마감", "대회종료", "종료", "취소", "연기"]);
export const NEARLY_FULL_RATIO = 0.8;

export function normalizeStatus(status = "") {
  const text = String(status || "").replace(/\s+/g, "");
  if (/취소/.test(text)) return "취소";
  if (/연기/.test(text)) return "연기";
  if (/대진오픈/.test(text)) return "대진오픈";
  if (/접수중|신청가능|모집중|접수가능/.test(text)) return "접수중";
  if (/접수예정|모집예정|준비중|예정/.test(text)) return "접수예정";
  if (/접수마감|신청마감|마감|모집완료/.test(text)) return "접수마감";
  if (/진행/.test(text)) return "대회진행중";
  if (/종료|결과/.test(text)) return "대회종료";
  return status || "미상";
}

export function enrichTournament(tournament) {
  const text = searchableText(tournament);
  return {
    ...tournament,
    statusNormalized: normalizeStatus(tournament.registrationStatus || tournament.applicationStatus || tournament.status),
    regionLabel: compactRegionLabel(tournament),
    genderNormalized: inferGender(text),
    matchTypeNormalized: inferMatchType(text),
    levelNormalized: inferLevel(text),
    divisionLabels: divisionValues(tournament)
  };
}

export function compactRegionLabel(tournament = {}) {
  const region = tournament.regionSigungu || tournament.regionSido || inferRegion(tournament);
  return String(region || "").replace(/^대한민국\s*/, "").replace(/^경기도\s*/, "").replace(/^서울특별시\s*/, "서울").trim() || "지역 미상";
}

export function inferRegion(tournament) {
  const text = `${tournament.titleRaw || ""} ${tournament.venueName || ""} ${tournament.venueAddress || ""}`;
  const hints = ["서울", "김포", "화성", "성남", "용인", "수원", "안양", "고양", "파주", "인천", "부천", "광주", "안성", "순창", "함안", "남양주", "의정부"];
  return hints.find((hint) => text.includes(hint)) || "";
}

export function searchableText(tournament) {
  return [
    tournament.titleRaw,
    tournament.organizer,
    tournament.host,
    tournament.sourceName,
    tournament.regionSido,
    tournament.regionSigungu,
    tournament.venueName,
    tournament.venueAddress,
    tournament.eligibilityText,
    tournament.inferredEligibilityText,
    tournament.detailText,
    ...(tournament.divisions || []).flatMap((division) => [division.divisionName, division.eligibilityText, division.feeText])
  ].filter(Boolean).join(" ");
}

export function inferGender(text) {
  if (/혼합|혼복|믹스/.test(text)) return "혼합";
  if (/여자|여성|여복|여단|개나리|국화/.test(text)) return "여성";
  if (/남자|남성|남복|남단/.test(text)) return "남성";
  return "전체";
}

export function inferMatchType(text) {
  if (/복식|남복|여복|혼복|혼합/.test(text)) return "복식";
  if (/단식|남단|여단/.test(text)) return "단식";
  return "기타";
}

export function inferLevel(text) {
  const levels = ["화이트", "아이언", "브론즈", "실버", "골드", "신인", "초급", "초중급", "중급", "상급", "오픈", "개나리", "국화", "챌린저", "마스터스", "테린이"];
  return levels.find((level) => text.includes(level)) || "미상";
}

export function divisionValues(tournament) {
  const values = (tournament.divisions || []).map((division) => String(division.divisionName || "").trim()).filter(Boolean);
  if (values.length) return [...new Set(values)];
  const text = searchableText(tournament);
  const groups = [];
  if (/단체|단체전|팀전/.test(text)) groups.push("단체전");
  if (/혼합|혼복|믹스/.test(text)) groups.push("혼합복식");
  if (/여복|여자복식|여성복식/.test(text)) groups.push("여자복식");
  if (/남복|남자복식|남성복식/.test(text)) groups.push("남자복식");
  if (/여단|여자단식|여성단식/.test(text)) groups.push("여자단식");
  if (/남단|남자단식|남성단식/.test(text)) groups.push("남자단식");
  return groups.length ? groups : ["기타 부서"];
}

export function participantNumbers(item) {
  const current = numberOrNull(item.participantCurrent ?? item.registrationCountCurrent);
  const capacity = numberOrNull(item.participantCapacity ?? item.registrationCapacity);
  if (!Number.isFinite(current) || !Number.isFinite(capacity) || capacity <= 0) return null;
  return { current, capacity, ratio: Math.max(0, Math.min(1, current / capacity)) };
}

export function participantStatus(item) {
  const numbers = participantNumbers(item);
  const status = normalizeStatus(item.registrationStatus || item.applicationStatus || item.status);
  if (CLOSED_STATUSES.has(status) || isPastTournament(item)) return "마감";
  if (!numbers) return status === "접수중" ? "신청 중" : "모집 정보 없음";
  if (numbers.current >= numbers.capacity) return "마감";
  if (numbers.ratio >= NEARLY_FULL_RATIO) return "마감 임박";
  return "신청 중";
}

export function isPastTournament(tournament) {
  const date = new Date(`${tournament.endDate || tournament.startDate || "1900-01-01"}T23:59:59`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export function filterTournaments(tournaments, filters) {
  return tournaments.filter((item) => {
    if (filters.region && item.regionLabel !== filters.region) return false;
    if (filters.gender && item.genderNormalized !== filters.gender) return false;
    if (filters.matchType && item.matchTypeNormalized !== filters.matchType) return false;
    if (filters.level && item.levelNormalized !== filters.level) return false;
    if (filters.division && !item.divisionLabels.includes(filters.division)) return false;
    if (filters.keyword && !normalizeSearch(searchableText(item)).includes(normalizeSearch(filters.keyword))) return false;
    return !isPastTournament(item);
  }).sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
}

export function groupByDate(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.startDate || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()];
}

export function sourceHref(tournament) {
  if (!tournament.sourceUrl) return "";
  if (String(tournament.sourceUrl).startsWith("tennistown-app://")) {
    return "https://play.google.com/store/apps/details?id=com.momzit.tennistown";
  }
  return tournament.sourceUrl;
}

export function feeText(tournament) {
  const explicit = tournament.feeText || tournament.entryFeeText || tournament.participationFeeText;
  if (explicit) return String(explicit);
  const amount = numberOrNull(tournament.feeAmount);
  if (Number.isFinite(amount)) {
    const unit = tournament.feeUnit && tournament.feeUnit !== "unknown" ? tournament.feeUnit : "원";
    return `${amount.toLocaleString("ko-KR")}${unit}`;
  }
  const divisionFee = (tournament.divisions || []).map((division) => division.feeText).find(Boolean);
  return divisionFee || "참가비 확인";
}

export function formatDate(dateValue) {
  if (!dateValue) return "날짜 미상";
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getMonth() + 1}.${date.getDate()} ${weekday}`;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ko", { numeric: true }));
}

function normalizeSearch(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
