const TENNISTOWN_SOURCE_TYPES = new Set(["TENNISTOWN", "TENNISTOWN_APP"]);

export function resolveTennisTownRefreshPlan({ now = new Date(), initialized = false } = {}) {
  const { year, month } = seoulYearMonth(now);
  if (!initialized) {
    return {
      mode: "full",
      targets: Array.from({ length: 12 }, (_, index) => monthTarget(year, index + 1))
    };
  }

  const next = month === 12 ? monthTarget(year + 1, 1) : monthTarget(year, month + 1);
  return {
    mode: "incremental",
    targets: [monthTarget(year, month), next]
  };
}

export function isTournamentInRefreshScope(tournament, scope) {
  if (!TENNISTOWN_SOURCE_TYPES.has(tournament?.sourceType)) return false;
  const date = String(tournament.startDate || tournament.endDate || "");
  return /^\d{4}-\d{2}/.test(date) && scope.has(date.slice(0, 7));
}

export function isTennisTownSource(tournament) {
  return TENNISTOWN_SOURCE_TYPES.has(tournament?.sourceType);
}

export function monthTarget(year, month) {
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

function seoulYearMonth(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric"
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value)
  };
}
