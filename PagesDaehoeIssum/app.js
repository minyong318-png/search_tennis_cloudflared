const state = {
  tournaments: [],
  filtered: [],
  activeMonthItems: [],
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  selectedDate: "",
  view: "calendar",
  profile: {}
};

const els = {};
const ACTIVE_STATUSES = new Set(["접수중", "대진오픈", "접수예정", "준비중", "대기", "미상"]);
const CLOSED_STATUSES = new Set(["접수마감", "대회종료", "종료", "취소", "연기"]);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  const raw = await fetchJson("./data/tournaments.json", []);
  state.tournaments = raw.map(enrichTournament).sort(sortTournaments);
  const now = todayStart();
  state.selectedYear = now.getFullYear();
  state.selectedMonth = now.getMonth() + 1;
  populateFilters();
  render();
}

function cacheElements() {
  [
    "sourceFilter", "regionFilter", "keywordFilter", "organizerFilter", "divisionFilter", "tournamentList", "calendarList", "detailPanel",
    "monthSummary", "yearSelect", "monthSelect", "prevMonthBtn", "nextMonthBtn",
    "profileGender", "profileFormat", "profileLevel", "profileYears", "dateTypeFilter", "weekFilter",
    "recommendPanel", "dataStats"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("select").forEach((input) => input.addEventListener("change", () => {
    if (input === els.yearSelect || input === els.monthSelect) {
      state.selectedDate = "";
    } else if (isMobileViewport() && isFilterControl(input)) {
      state.view = "list";
      state.selectedDate = "";
    }
    render();
  }));
  if (els.keywordFilter) {
    els.keywordFilter.addEventListener("input", () => {
      if (isMobileViewport()) {
        state.view = "list";
        state.selectedDate = "";
      }
      render();
    });
  }
  els.prevMonthBtn.addEventListener("click", () => shiftMonth(-1));
  els.nextMonthBtn.addEventListener("click", () => shiftMonth(1));
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      if (state.view === "list") state.selectedDate = "";
      document.body.dataset.view = state.view;
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === "calendarView"));
      render();
    });
  });
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function isFilterControl(input) {
  return [
    els.profileGender,
    els.profileFormat,
    els.profileLevel,
    els.regionFilter,
    els.keywordFilter,
    els.organizerFilter,
    els.divisionFilter,
    els.dateTypeFilter,
    els.weekFilter,
    els.sourceFilter
  ].includes(input);
}

async function fetchJson(url, fallback) {
  try {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}v=${Date.now()}`, { cache: "no-store" });
    return response.ok ? response.json() : fallback;
  } catch {
    return fallback;
  }
}

function populateFilters() {
  fillSelect(els.regionFilter, "전체 지역", unique(state.tournaments.map((item) => item.regionLabel).filter(Boolean)));
  fillSelect(els.organizerFilter, "전체 주체", unique(state.tournaments.flatMap(organizerFilterValues).filter(Boolean)));
  fillSelect(els.divisionFilter, "전체 부서", unique(state.tournaments.flatMap((item) => item.divisions.map((division) => division.divisionName)).filter(Boolean)));
  populateMonthControls();
}

function fillSelect(select, label, values) {
  select.innerHTML = `<option value="">${label}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function populateMonthControls() {
  const years = unique([
    new Date().getFullYear(),
    ...state.tournaments.flatMap((item) => [item.startDate, item.endDate].filter(Boolean).map((value) => Number(value.slice(0, 4))))
  ]).filter(Boolean).sort((a, b) => a - b);
  els.yearSelect.innerHTML = years.map((year) => `<option value="${year}">${year}년</option>`).join("");
  els.monthSelect.innerHTML = Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${index + 1}월</option>`).join("");
  syncMonthControls();
}

function render() {
  document.body.dataset.view = state.view;
  document.body.dataset.selectedDate = state.selectedDate ? "true" : "false";
  syncViewControls();
  state.profile = {
    gender: els.profileGender.value,
    format: els.profileFormat.value,
    level: els.profileLevel.value,
    years: els.profileYears.value ? Number(els.profileYears.value) : null
  };
  state.selectedYear = Number(els.yearSelect.value || state.selectedYear);
  state.selectedMonth = Number(els.monthSelect.value || state.selectedMonth);
  syncMonthControls();

  const month = selectedMonthValue();
  const filtered = state.tournaments.filter((item) => {
    const keyword = normalizeSearchValue(els.keywordFilter?.value || "");
    const organizer = els.organizerFilter?.value || "";
    if (els.sourceFilter.value === "tennistown" && !isTennisTownTournament(item)) return false;
    if (els.sourceFilter.value === "official" && isTennisTownTournament(item)) return false;
    if (els.regionFilter.value && item.regionLabel !== els.regionFilter.value) return false;
    if (organizer && !organizerFilterValues(item).includes(organizer)) return false;
    if (keyword && !normalizeSearchValue(searchableText(item)).includes(keyword)) return false;
    if (els.divisionFilter.value && !item.divisions.some((division) => division.divisionName === els.divisionFilter.value)) return false;
    if (els.dateTypeFilter.value && !matchesDateType(item.startDate, els.dateTypeFilter.value)) return false;
    if (els.weekFilter.value && getMonthWeekIndex(item.startDate) !== Number(els.weekFilter.value)) return false;
    return isInSelectedMonth(item, month);
  }).map((item) => ({ ...item, fit: evaluateFit(item, state.profile) }));

  state.activeMonthItems = filtered.sort(sortTournaments);
  const futureMonthItems = state.activeMonthItems.filter((item) => !isPastTournament(item)).sort(sortByFitThenDate);
  state.filtered = state.selectedDate
    ? futureMonthItems.filter((item) => item.startDate === state.selectedDate)
    : futureMonthItems;
  renderStats(month);
  renderRecommendation();
  renderCalendar(month);
  renderList();
}

function syncViewControls() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
}

function renderStats(month) {
  const active = state.activeMonthItems.filter((item) => !isInactiveTournament(item));
  const tennistown = state.activeMonthItems.filter(isTennisTownTournament);
  const openCapacity = state.activeMonthItems.filter(hasOpenCapacity);
  const closed = state.activeMonthItems.filter(isInactiveTournament);
  const updatedAt = latestDate(state.activeMonthItems.map((item) => item.updatedAt || item.crawledAt));
  els.dataStats.innerHTML = [
    statCard(`${Number(month.slice(5))}월 전체`, `${state.activeMonthItems.length}건`),
    statCard("참가 가능 후보", `${active.length}건`),
    statCard("테니스타운 앱", `${tennistown.length}건`),
    statCard("신청 여유 있음", `${openCapacity.length}건`),
    statCard("마감/지난 대회", `${closed.length}건`),
    statCard("최신 수집", updatedAt ? formatKoreanDateTime(updatedAt) : "확인 필요")
  ].join("");
}

function statCard(label, value) {
  return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function renderRecommendation() {
  const candidates = state.filtered
    .filter((item) => item.fit.level !== "ineligible" && !isInactiveTournament(item))
    .sort((a, b) => recommendationScore(b) - recommendationScore(a));
  const picks = candidates.slice(0, 3);
  if (!picks.length) {
    els.recommendPanel.innerHTML = `<div class="recommend-title"><strong>맞춤 추천</strong><span>조건에 맞는 추천 대회가 없습니다.</span></div>`;
    return;
  }
  els.recommendPanel.innerHTML = `
    <div class="recommend-title">
      <strong>✦ 맞춤 추천</strong>
      <span>내 조건에 맞는 추천 대회</span>
    </div>
    <div class="recommend-items">
      ${picks.map((item) => {
        const level = inferLevelTone(item);
        return `
          <button class="recommend-item" data-detail="${escapeHtml(item.id)}" type="button">
            ${level ? `<span class="level-badge level-${level.key}">${escapeHtml(level.label)}</span>` : ""}
            <strong>${escapeHtml(item.titleRaw)}</strong>
            <small>${escapeHtml(shortDateRange(item))} · ${escapeHtml(item.venueName || item.regionLabel || "장소 미상")}</small>
            ${compactParticipantLine(item) ? `<em>${escapeHtml(compactParticipantLine(item))}</em>` : ""}
          </button>
        `;
      }).join("")}
    </div>
    <button class="more-recommend" type="button">추천 더보기 ›</button>
  `;
  els.recommendPanel.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.detail));
  });
}

function renderList() {
  if (!state.filtered.length) {
    els.tournamentList.innerHTML = `<div class="empty">조건에 맞는 대회가 없습니다.</div>`;
    const title = document.getElementById("listTitle");
    if (title) title.textContent = state.selectedDate ? `${formatSelectedDateTitle(state.selectedDate)} 대회 (0)` : `${state.selectedMonth}월 남은 대회 (0)`;
    return;
  }
  const title = document.getElementById("listTitle");
  if (title) {
    title.textContent = state.selectedDate
      ? `${formatSelectedDateTitle(state.selectedDate)} 대회 (${state.filtered.length})`
      : `${state.selectedMonth}월 남은 대회 (${state.filtered.length})`;
  }
  els.tournamentList.innerHTML = state.filtered.map(renderCard).join("");
  els.tournamentList.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.detail));
  });
}

function renderCard(tournament) {
  const level = inferLevelTone(tournament);
  const levelBadge = level ? `<span class="level-badge level-${level.key}">${escapeHtml(level.label)}</span>` : "";
  const divisions = tournament.divisions.slice(0, 6).map((division) => {
    const divisionLevel = inferLevelTone({
      titleRaw: division.divisionName,
      venueName: "",
      eligibilityText: division.eligibilityText,
      inferredEligibilityText: "",
      detailText: "",
      divisions: [division]
    }) || level;
    const levelClass = divisionLevel ? ` level-${divisionLevel.key}` : "";
    return `<span class="division-chip${levelClass}">${escapeHtml(division.divisionName)}</span>`;
  }).join("");
  const status = getDisplayStatus(tournament);
  const organizer = organizerLine(tournament);
  return `
    <article class="tournament-card ${isInactiveTournament(tournament) ? "is-inactive" : ""} fit-${tournament.fit.level} ${level ? `level-card-${level.key}` : ""}">
      <div class="row-level">${levelBadge || `<span class="level-badge level-neutral">대회</span>`}</div>
      <button class="row-main" data-detail="${escapeHtml(tournament.id)}" type="button">
        ${organizer ? `<span class="organizer-line">${escapeHtml(organizer)}</span>` : ""}
        <strong>${escapeHtml(tournament.titleRaw)}</strong>
        <small>${escapeHtml(formatDateRange(tournament))} · ${escapeHtml(tournament.venueName || tournament.regionLabel || "장소 미상")}</small>
        <span class="division-list">${divisions}</span>
      </button>
      <div class="row-status">
        <span class="${statusClass(status)}">${escapeHtml(status)}</span>
        ${compactParticipantLine(tournament) ? `<strong class="people-count">♙ ${escapeHtml(compactParticipantLine(tournament))}</strong>` : ""}
        <span class="${fitClass(tournament.fit.level)}">${escapeHtml(tournament.fit.label)}</span>
      </div>
      <button class="bookmark-btn" data-detail="${escapeHtml(tournament.id)}" type="button" aria-label="상세 보기">♡</button>
    </article>
  `;
}

function renderCalendar(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const afterToday = state.activeMonthItems.filter((item) => !isPastTournament(item)).length;
  els.monthSummary.textContent = `${monthNumber}월 대회 ${afterToday}건 · 오늘 이후 대회만 표시됩니다.`;
  const weeks = buildMonthWeeks(year, monthNumber, state.activeMonthItems);
  els.calendarList.innerHTML = `
    <div class="calendar-weekday-row">
      <span></span><strong>월</strong><strong>화</strong><strong>수</strong><strong>목</strong><strong>금</strong><strong>토</strong><strong>일</strong>
    </div>
    ${weeks.map((week) => `
    <section class="week-section">
      <div class="week-days">
        <div class="week-side"><strong>${escapeHtml(week.label)}</strong><small>${escapeHtml(week.rangeLabel)}</small></div>
        ${week.days.map((day) => renderCalendarDay(day, month)).join("")}
      </div>
    </section>
  `).join("") || `<div class="empty">캘린더에 표시할 대회가 없습니다.</div>`}`;
  els.calendarList.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.detail));
  });
  els.calendarList.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      render();
      if (window.matchMedia("(max-width: 720px)").matches) {
        document.querySelector(".list-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function renderCalendarDay(day, month) {
  const isOutside = !day.date.startsWith(month);
  const isPast = new Date(`${day.date}T23:59:59`) < todayStart();
  const visibleItems = day.items.filter((item) => !isPastTournament(item));
  const countLabel = visibleItems.length > 99 ? "99+" : `${visibleItems.length}개`;
  const levels = ["iron", "bronze", "silver", "gold"].map((key) => ({
    key,
    count: visibleItems.filter((item) => inferLevelTone(item)?.key === key).length
  })).filter((item) => item.count);
  return `
    <article class="calendar-day ${isOutside ? "is-outside" : ""} ${isPast ? "is-past" : ""} ${state.selectedDate === day.date ? "is-selected" : ""}">
      <div class="day-label">${formatDayLabel(day.date)}</div>
      <div class="day-events">
        ${visibleItems.length ? `
          <button class="day-count" data-date="${escapeHtml(day.date)}" type="button" aria-label="${escapeHtml(day.date)} 대회 보기">
            ${levels.map((level) => `<span class="level-dot dot-${level.key}"></span>`).join("")}
            <strong>${escapeHtml(countLabel)}</strong>
          </button>
        ` : `<span class="no-event"></span>`}
      </div>
    </article>
  `;
}

function openDetail(id) {
  const tournament = state.tournaments.find((item) => item.id === id);
  if (!tournament) return;
  const fit = evaluateFit(tournament, state.profile);
  const status = getDisplayStatus(tournament);
  els.detailPanel.innerHTML = `
    <button class="detail-close" type="button">닫기</button>
    <h2>${escapeHtml(tournament.titleRaw)}</h2>
    <div class="detail-badges">
      <span class="${statusClass(status)}">${escapeHtml(status)}</span>
      <span class="${fitClass(fit.level)}">${escapeHtml(fit.label)}</span>
    </div>
    <div class="detail-block">
      <h3>기본 정보</h3>
      <p>${formatDateRange(tournament)}<br>${escapeHtml(tournament.venueName || "장소 미상")}<br>${escapeHtml(tournament.regionLabel || "지역 미상")}</p>
    </div>
    <div class="detail-block">
      <h3>참가 판단</h3>
      <p>${escapeHtml(fit.reason)}</p>
    </div>
    ${renderDivisionBlock(tournament)}
    ${renderApplicationBlock(tournament)}
    ${renderEligibilityBlock(tournament)}
    ${renderMediaBlock(tournament)}
    <div class="detail-block">
      <h3>신청/출처</h3>
      <p>${escapeHtml(tournament.applicationMethodText || "원문 확인")}</p>
      ${sourceLink(tournament)}
    </div>
  `;
  els.detailPanel.classList.add("is-open");
  els.detailPanel.querySelector(".detail-close").addEventListener("click", () => els.detailPanel.classList.remove("is-open"));
}

function enrichTournament(input) {
  const divisions = Array.isArray(input.divisions) ? input.divisions.map((division) => ({
    ...division,
    divisionName: division.divisionName || "부서 미상"
  })) : [];
  const regionLabel = [input.regionSido, input.regionSigungu].filter(Boolean).join(" ") || inferRegion(input);
  return {
    ...input,
    divisions,
    media: Array.isArray(input.media) ? input.media : [],
    status: normalizeStatus(input.registrationStatus || input.applicationStatus || input.status),
    regionLabel,
    feeText: input.feeText || divisions.find((division) => division.feeText)?.feeText || "",
    participantCurrent: numberOrNull(input.participantCurrent ?? divisions.find((division) => Number.isFinite(numberOrNull(division.participantCurrent)))?.participantCurrent),
    participantCapacity: numberOrNull(input.participantCapacity ?? divisions.find((division) => Number.isFinite(numberOrNull(division.participantCapacity)))?.participantCapacity)
  };
}

function evaluateFit(tournament, profile) {
  const hasProfile = Boolean(profile.gender || profile.format || profile.level || profile.years);
  if (!hasProfile) return { level: "unknown", label: "조건 필요", reason: "내 참가 조건을 설정하면 참가 가능성을 판정합니다." };
  if (isInactiveTournament(tournament)) return { level: "ineligible", label: "참가 어려움", reason: "이미 마감되었거나 종료된 대회입니다." };

  const text = searchableText(tournament);
  const blockers = [];
  const matches = [];

  if (profile.gender) {
    const gender = inferGender(text);
    if (profile.gender === "male" && gender === "female") blockers.push("여성 전용 부서로 보입니다.");
    else if (profile.gender === "female" && gender === "male") blockers.push("남성 전용 부서로 보입니다.");
    else if (profile.gender === "mixed" && gender !== "mixed") blockers.push("혼합복식 부서가 아닐 수 있습니다.");
    else matches.push("성별 조건이 맞습니다.");
  }

  if (profile.format) {
    const format = inferFormat(text);
    if (format && format !== profile.format) blockers.push("선택한 경기 방식과 다릅니다.");
    else if (format) matches.push("경기 방식이 맞습니다.");
  }

  if (profile.level) {
    if (text.includes(profile.level)) matches.push(`${profile.level} 부서와 맞습니다.`);
    else if (hasAnyLevel(text)) blockers.push(`${profile.level} 부서로 확인되지 않습니다.`);
  }

  if (profile.years) {
    const limit = inferYearLimit(text);
    if (limit && profile.years > limit) blockers.push(`구력 ${limit}년 이하 제한으로 보입니다.`);
    else if (limit) matches.push(`구력 제한 ${limit}년 이하에 맞습니다.`);
  }

  if (hasOpenCapacity(tournament)) matches.push("신청 가능 인원이 남아 있습니다.");
  if (blockers.length) return { level: "ineligible", label: "참가 어려움", reason: blockers[0] };
  if (matches.length >= 2) return { level: "eligible", label: "참가 가능", reason: matches.slice(0, 2).join(" ") };
  return { level: "check", label: "확인 필요", reason: matches[0] || "요강 정보가 부족해 원문 확인이 필요합니다." };
}

function recommendationScore(tournament) {
  let score = 0;
  if (tournament.fit.level === "eligible") score += 70;
  if (tournament.fit.level === "check") score += 35;
  if (normalizeStatus(getDisplayStatus(tournament)) === "접수중") score += 35;
  if (hasOpenCapacity(tournament)) score += 25;
  if (tournament.media.length) score += 8;
  if ((tournament.sourceType || "").includes("TENNISTOWN")) score += 6;
  const days = daysUntil(tournament.startDate);
  if (Number.isFinite(days)) score += Math.max(0, 30 - days);
  return score;
}

function buildMonthWeeks(year, month, items) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const byDate = new Map();
  items.forEach((item) => {
    const key = item.startDate || "날짜 미상";
    byDate.set(key, [...(byDate.get(key) || []), item]);
  });
  const weeks = [];
  let weekIndex = 1;
  while (cursor <= end) {
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const date = toDateValue(cursor);
      days.push({ date, items: (byDate.get(date) || []).sort(sortByFitThenDate) });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({
      label: `${weekIndex}주차`,
      rangeLabel: `${shortMonthDay(days[0].date)} - ${shortMonthDay(days[6].date)}`,
      days,
      items: days.flatMap((day) => day.items)
    });
    weekIndex += 1;
  }
  return weeks;
}

function renderDivisionBlock(tournament) {
  if (!tournament.divisions.length) return "";
  return `
    <div class="detail-block">
      <h3>부서</h3>
      <ul>${tournament.divisions.map((division) => `<li>${escapeHtml(division.divisionName)} · ${escapeHtml(division.playDate || tournament.startDate || "일정 미상")} · ${escapeHtml(division.feeText || tournament.feeText || "참가비 원문 확인")} ${participantLine(division) ? `· ${participantLine(division)}` : ""}</li>`).join("")}</ul>
    </div>
  `;
}

function renderApplicationBlock(tournament) {
  const rows = [getDisplayStatus(tournament), participantLine(tournament), applicationDateLine(tournament)].filter(Boolean);
  if (!rows.length) return "";
  return `<div class="detail-block"><h3>신청 상태</h3><p>${rows.map(escapeHtml).join("<br>")}</p></div>`;
}

function renderEligibilityBlock(tournament) {
  const text = tournament.eligibilityText || tournament.inferredEligibilityText || tournament.divisions.find((division) => division.eligibilityText)?.eligibilityText;
  if (!text) return "";
  return `<div class="detail-block"><h3>참가 자격</h3><p>${escapeHtml(text)}</p></div>`;
}

function renderMediaBlock(tournament) {
  if (!tournament.media.length) return "";
  return `
    <div class="detail-block">
      <h3>포스터/이미지</h3>
      <div class="media-grid">${tournament.media.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || tournament.titleRaw)}" loading="lazy"></a>`).join("")}</div>
    </div>
  `;
}

function normalizeStatus(status = "") {
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

function inferRegion(tournament) {
  const text = `${tournament.titleRaw || ""} ${tournament.venueName || ""} ${tournament.venueAddress || ""}`;
  const hints = ["서울", "김포", "화성", "성남", "용인", "수원", "안양", "고양", "파주", "인천", "부천", "광주", "안성", "순창", "함안"];
  return hints.find((hint) => text.includes(hint)) || "";
}

function searchableText(tournament) {
  return [
    tournament.titleRaw, tournament.organizer, tournament.host, tournament.sourceName, tournament.regionLabel,
    tournament.venueName, tournament.venueAddress, tournament.eligibilityText, tournament.inferredEligibilityText, tournament.detailText,
    ...tournament.divisions.flatMap((division) => [division.divisionName, division.eligibilityText, division.feeText])
  ].filter(Boolean).join(" ");
}

function normalizeSearchValue(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function organizerFilterValues(tournament) {
  return unique([
    tournament.organizer,
    tournament.host,
    tournament.sourceName
  ].filter(Boolean).map((value) => String(value).trim()));
}

function inferLevelTone(tournament) {
  const text = searchableText(tournament);
  const tones = [
    { key: "gold", label: "골드", pattern: /골드|gold/i },
    { key: "silver", label: "실버", pattern: /실버|silver/i },
    { key: "bronze", label: "브론즈", pattern: /브론즈|bronze/i },
    { key: "iron", label: "아이언", pattern: /아이언|iron/i }
  ];
  return tones.find((tone) => tone.pattern.test(text)) || null;
}

function levelEventClass(tournament) {
  const level = inferLevelTone(tournament);
  return level ? `level-event-${level.key}` : "";
}

function levelPrefix(tournament) {
  const level = inferLevelTone(tournament);
  return level ? `${level.label} · ` : "";
}

function organizerLine(tournament) {
  const parts = [];
  if (tournament.organizer) parts.push(`주최 ${tournament.organizer}`);
  if (tournament.host && tournament.host !== tournament.organizer) parts.push(`주관 ${tournament.host}`);
  if (!parts.length && tournament.sourceName) parts.push(tournament.sourceName);
  return parts.join(" · ");
}

function inferGender(text) {
  if (/혼합|혼복|믹스/.test(text)) return "mixed";
  if (/여자|여성|여복|여단|개나리|국화/.test(text)) return "female";
  if (/남자|남성|남복|남단/.test(text)) return "male";
  return "";
}

function inferFormat(text) {
  if (/혼합|혼복/.test(text)) return "mixed";
  if (/복식|남복|여복/.test(text)) return "doubles";
  if (/단식|남단|여단/.test(text)) return "singles";
  return "";
}

function hasAnyLevel(text) {
  return /테린이|아이언|브론즈|실버|골드|신인|개나리|국화|오픈/.test(text);
}

function inferYearLimit(text) {
  const year = text.match(/(\d+(?:\.\d+)?)\s*년\s*(?:이하|미만|입문|구력)/);
  if (year) return Number(year[1]);
  const month = text.match(/(\d+)\s*개월\s*(?:이하|미만)/);
  if (month) return Number(month[1]) / 12;
  return null;
}

function hasOpenCapacity(item) {
  const current = numberOrNull(item.participantCurrent);
  const capacity = numberOrNull(item.participantCapacity);
  return Number.isFinite(current) && Number.isFinite(capacity) && current < capacity;
}

function participantLine(item) {
  const current = numberOrNull(item.participantCurrent);
  const capacity = numberOrNull(item.participantCapacity);
  if (!Number.isFinite(current) || !Number.isFinite(capacity)) return "";
  return `신청 인원: ${current}/${capacity}`;
}

function compactParticipantLine(item) {
  const current = numberOrNull(item.participantCurrent);
  const capacity = numberOrNull(item.participantCapacity);
  if (!Number.isFinite(current) || !Number.isFinite(capacity)) return "";
  return `${current}/${capacity}`;
}

function calendarMetaLine(item) {
  return [
    levelPrefix(item).replace(/\s·\s$/, ""),
    item.fit.label,
    item.venueName || item.regionLabel || "장소 미상",
    compactParticipantLine(item)
  ].filter(Boolean).join(" · ");
}

function applicationDateLine(tournament) {
  if (!tournament.applicationStartDate && !tournament.applicationEndDate) return "";
  return `접수 기간: ${tournament.applicationStartDate || "미상"} ~ ${tournament.applicationEndDate || "미상"}`;
}

function sourceLink(tournament) {
  if (!tournament.sourceUrl) return "";
  const isAppUrl = String(tournament.sourceUrl).startsWith("tennistown-app://");
  const url = isAppUrl ? "https://play.google.com/store/apps/details?id=com.momzit.tennistown" : tournament.sourceUrl;
  return `<a class="secondary-action" href="${escapeHtml(url)}" target="_blank" rel="noopener">${isAppUrl ? "앱 열기" : "원문"}</a>`;
}

function getDisplayStatus(tournament) {
  return normalizeStatus(tournament.registrationStatus || tournament.applicationStatus || tournament.status || "미상");
}

function isInactiveTournament(tournament) {
  return isPastTournament(tournament) || CLOSED_STATUSES.has(normalizeStatus(getDisplayStatus(tournament)));
}

function isTennisTownTournament(tournament) {
  return tournament.sourceType === "TENNISTOWN_APP" || tournament.sourceType === "TENNISTOWN";
}

function isPastTournament(tournament) {
  const start = new Date(`${tournament.startDate || "1900-01-01"}T23:59:59`);
  return start < todayStart();
}

function isInSelectedMonth(tournament, month) {
  if (!tournament.startDate) return false;
  const start = tournament.startDate.slice(0, 7);
  const end = (tournament.endDate || tournament.startDate).slice(0, 7);
  return start <= month && end >= month;
}

function matchesDateType(dateValue, type) {
  if (!dateValue) return false;
  const day = new Date(`${dateValue}T00:00:00`).getDay();
  if (type === "weekend") return day === 0 || day === 6;
  if (type === "weekday") return day >= 1 && day <= 5;
  return true;
}

function getMonthWeekIndex(dateValue) {
  if (!dateValue) return 0;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstMondayOffset = (first.getDay() + 6) % 7;
  return Math.floor((date.getDate() + firstMondayOffset - 1) / 7) + 1;
}

function sortTournaments(a, b) {
  const statusOrder = ["접수중", "대진오픈", "접수예정", "준비중", "대기", "미상", "접수마감", "대회진행중", "대회종료", "취소", "연기"];
  const left = statusOrder.indexOf(normalizeStatus(getDisplayStatus(a)));
  const right = statusOrder.indexOf(normalizeStatus(getDisplayStatus(b)));
  if (left !== right) return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
  return (a.startDate || "9999").localeCompare(b.startDate || "9999");
}

function sortByFitThenDate(a, b) {
  const fitOrder = { eligible: 0, check: 1, unknown: 2, ineligible: 3 };
  const delta = (fitOrder[a.fit?.level] ?? 9) - (fitOrder[b.fit?.level] ?? 9);
  if (delta) return delta;
  return sortTournaments(a, b);
}

function shiftMonth(delta) {
  const date = new Date(state.selectedYear, state.selectedMonth - 1 + delta, 1);
  state.selectedYear = date.getFullYear();
  state.selectedMonth = date.getMonth() + 1;
  state.selectedDate = "";
  ensureYearOption(state.selectedYear);
  syncMonthControls();
  render();
}

function syncMonthControls() {
  els.yearSelect.value = String(state.selectedYear);
  els.monthSelect.value = String(state.selectedMonth);
}

function ensureYearOption(year) {
  if ([...els.yearSelect.options].some((option) => Number(option.value) === year)) return;
  const years = unique([...els.yearSelect.options].map((option) => Number(option.value)).concat(year)).filter(Boolean).sort((a, b) => a - b);
  els.yearSelect.innerHTML = years.map((value) => `<option value="${value}">${value}년</option>`).join("");
}

function selectedMonthValue() {
  return `${state.selectedYear}-${String(state.selectedMonth).padStart(2, "0")}`;
}

function todayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysUntil(dateValue) {
  if (!dateValue) return Infinity;
  return Math.ceil((new Date(`${dateValue}T00:00:00`) - todayStart()) / 86400000);
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(dateValue) {
  return `${new Date(`${dateValue}T00:00:00`).getDate()}일`;
}

function formatDateRange(tournament) {
  if (!tournament.startDate) return "날짜 미상";
  if (!tournament.endDate || tournament.endDate === tournament.startDate) return tournament.startDate;
  return `${tournament.startDate} ~ ${tournament.endDate}`;
}

function formatSelectedDateTitle(dateValue) {
  const [, month, day] = dateValue.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function shortMonthDay(dateValue) {
  const [, month, day] = dateValue.split("-");
  return `${Number(month)}.${Number(day)}`;
}

function shortDateRange(tournament) {
  const start = tournament.startDate ? tournament.startDate.slice(5).replace("-", ".") : "일정 미상";
  const end = tournament.endDate && tournament.endDate !== tournament.startDate ? `~${tournament.endDate.slice(5).replace("-", ".")}` : "";
  return `${start}${end}`;
}

function latestDate(values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

function formatKoreanDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "접수중" || normalized === "대진오픈") return "badge";
  if (normalized === "접수예정" || normalized === "준비중" || normalized === "대기") return "badge warn";
  if (normalized === "취소" || normalized === "연기") return "badge danger";
  return "badge closed";
}

function fitClass(level) {
  return `fit-badge fit-${level || "unknown"}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), "ko"));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
