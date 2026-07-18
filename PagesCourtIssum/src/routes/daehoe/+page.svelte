<script>
  import { onMount } from "svelte";
  import Drawer from "$lib/components/Drawer.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import {
    enrichTournament,
    feeText,
    filterTournaments,
    formatDate,
    participantNumbers,
    participantStatus,
    sourceHref,
    unique
  } from "$lib/tournaments.js";

  export let data;

  let filters = { region: "", gender: "", matchType: "", level: "", division: "", keyword: "" };
  let filterOpen = false;
  let alarmOpen = false;
  let selected = null;
  let weekStart = startOfWeek(new Date());
  let direction = 1;

  $: tournaments = data.tournaments.map(enrichTournament);
  $: weekEnd = addDays(weekStart, 6);
  $: baseWeekItems = tournaments.filter((item) => tournamentOverlapsWeek(item, weekStart));
  $: tabSource = filterTournaments(baseWeekItems, { ...filters, region: "" });
  $: filtered = filterTournaments(baseWeekItems, filters);
  $: regions = unique(tabSource.map((item) => item.regionLabel));
  $: regionTabs = ["", ...regions];
  $: genders = unique(tournaments.map((item) => item.genderNormalized));
  $: matchTypes = unique(tournaments.map((item) => item.matchTypeNormalized));
  $: levels = unique(tournaments.map((item) => item.levelNormalized)).filter((item) => item !== "미상").slice(0, 16);
  $: divisions = unique(tournaments.flatMap((item) => item.divisionLabels)).slice(0, 40);
  $: weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const value = toDateValue(date);
    const items = filtered.filter((item) => tournamentWeekDate(item, weekStart) === value);
    return { date, value, items };
  });
  $: groupedDays = weekDays.filter((day) => day.items.length);
  $: regionSchedule = buildRegionSchedule(filtered);
  $: activeCount = Object.values(filters).filter(Boolean).length;

  onMount(() => {
    const openFilter = () => (filterOpen = true);
    const openAlarm = () => (alarmOpen = true);
    window.addEventListener("courtissum:open-filter", openFilter);
    window.addEventListener("courtissum:open-alarm", openAlarm);
    return () => {
      window.removeEventListener("courtissum:open-filter", openFilter);
      window.removeEventListener("courtissum:open-alarm", openAlarm);
    };
  });

  function resetFilters() {
    filters = { region: "", gender: "", matchType: "", level: "", division: "", keyword: "" };
  }

  function setFilter(key, value) {
    filters = { ...filters, [key]: value };
  }

  function shiftWeek(delta) {
    direction = delta > 0 ? 1 : -1;
    weekStart = addDays(weekStart, delta * 7);
  }

  function thisWeek() {
    direction = 1;
    weekStart = startOfWeek(new Date());
  }

  function tabCount(region) {
    if (!region) return tabSource.length;
    return tabSource.filter((item) => item.regionLabel === region).length;
  }

  function buildRegionSchedule(items) {
    const groups = new Map();
    items.forEach((item) => {
      const region = item.regionLabel || "지역 미상";
      if (!groups.has(region)) groups.set(region, []);
      groups.get(region).push(item);
    });

    return [...groups.entries()]
      .map(([region, regionItems]) => ({
        region,
        items: regionItems
          .slice()
          .sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"))
          .slice(0, 4)
      }))
      .sort((a, b) => (a.items[0]?.startDate || "9999").localeCompare(b.items[0]?.startDate || "9999"));
  }

  function openTournament(item) {
    selected = item;
  }

  function statusClass(item) {
    const status = participantStatus(item);
    if (status.includes("마감")) return "warn";
    if (status.includes("없음")) return "muted";
    return "";
  }

  function eventTime(item) {
    return item.startTime || item.playTime || item.timeText || "시간 확인";
  }

  function eventDateRange(item) {
    if (!item.startDate) return "대회일 확인 필요";
    if (item.endDate && item.endDate !== item.startDate) return `${formatDate(item.startDate)} - ${formatDate(item.endDate)}`;
    return formatDate(item.startDate);
  }

  function hostText(item) {
    return item.organizer || item.host || item.sourceName || "주최 확인";
  }

  function toDateValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function startOfWeek(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    const day = next.getDay();
    next.setDate(next.getDate() - (day === 0 ? 6 : day - 1));
    return next;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function dateFromValue(dateValue) {
    if (!dateValue) return false;
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    return date;
  }

  function tournamentOverlapsWeek(item, start) {
    const eventStart = dateFromValue(item.startDate);
    if (!eventStart) return false;
    const eventEnd = dateFromValue(item.endDate) || eventStart;
    const weekEndExclusive = addDays(start, 7);
    return eventStart < weekEndExclusive && eventEnd >= start;
  }

  function tournamentWeekDate(item, start) {
    const eventStart = dateFromValue(item.startDate);
    if (!eventStart) return item.startDate;
    return toDateValue(eventStart < start ? start : eventStart);
  }

  function weekRangeLabel(start, end) {
    return `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getDate()}일`;
  }

  function weekdayLabel(date) {
    return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  }
</script>

<svelte:head>
  <title>대회있음? | 테니스 대회 일정과 신청 현황</title>
  <meta name="description" content="테니스 대회 일정, 지역, 부서, 레벨, 접수 상태를 주간 단위로 확인하세요." />
  <link rel="canonical" href="https://courtissum.pages.dev/daehoe" />
</svelte:head>

<section class="regionbar">
  <div class="regionbar-inner" aria-label="대회 지역 선택">
    {#each regionTabs as region}
      <button class:active={filters.region === region} class="region-tab" type="button" on:click={() => setFilter("region", region)}>
        <span class="status-dot"></span>
        <strong>{region || "전체"}</strong>
        <small>{tabCount(region)}개</small>
      </button>
    {/each}
  </div>
</section>

<section class="weekbar">
  <div class="weekbar-inner">
    <div class="view-title">
      <strong>{filters.region ? `${filters.region} 대회 일정` : "전체 대회 일정"}</strong>
      <small>이번 주 {filtered.length}개 · 신청 현황 기준</small>
    </div>
    <div class="week-nav" aria-label="주간 선택">
      <button class="nav-arrow" type="button" aria-label="이전 주" on:click={() => shiftWeek(-1)}>‹</button>
      <div class="week-display" style={`--dir:${direction}`}>
        <strong>{weekRangeLabel(weekStart, weekEnd)}</strong>
        <span>이번 주 · 신청 가능한 대회 {filtered.length}개</span>
      </div>
      <button class="nav-arrow" type="button" aria-label="다음 주" on:click={() => shiftWeek(1)}>›</button>
    </div>
    <button class="this-week" type="button" on:click={thisWeek}>이번 주</button>
  </div>
</section>

<main class="app-page tournament-page">
  <section class="tourney-shell glass-panel">
    <div class="tourney-main">
      <div class="tourney-toolbar" aria-label="대회 검색과 도구">
        <div class="toolbar-copy">
          <strong>대회 목록</strong>
          <span>신청 현황은 마지막 수집 시점 기준입니다.</span>
        </div>
        <div class="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={filters.keyword} placeholder="대회명, 장소, 주최 검색" on:input={(event) => setFilter("keyword", event.currentTarget.value)} />
        </div>
        <button class="icon-filter" type="button" aria-label="필터 열기" on:click={() => (filterOpen = true)}>
          <span aria-hidden="true"></span>
        </button>
      </div>

      <div class="tourney-list" style={`--dir:${direction}`} aria-label="날짜별 대회 목록">
        {#if !filtered.length}
          <div class="empty-state">
            선택한 조건에 해당하는 대회가 없습니다.
            <button class="secondary-button" type="button" on:click={resetFilters}>필터 초기화</button>
          </div>
        {:else}
          {#each groupedDays as day}
            <section class="tourney-day-group">
              <div class="tourney-day">
                <div>
                  <strong>{formatDate(day.value)}</strong>
                  <span>{day.items.length}개 대회</span>
                </div>
              </div>
              {#each day.items as item, index}
                {@const numbers = participantNumbers(item)}
                {@const status = participantStatus(item)}
                <article class="event-card" style={`--delay:${index * 46}ms`}>
                  <button class="event-main" type="button" on:click={() => openTournament(item)}>
                    <div class="event-date">
                      <b>{new Date(`${item.startDate}T00:00:00`).getDate()}</b>
                      <small>{weekdayLabel(new Date(`${item.startDate}T00:00:00`))}</small>
                    </div>
                    <div class="event-copy">
                      <div class="event-kicker">{hostText(item)} · {item.regionLabel}</div>
                      <h2>{item.titleRaw}</h2>
                      <div class="event-meta">
                        <span>{eventTime(item)}</span>
                        <span>{item.venueName || item.venueAddress || "장소 확인"}</span>
                        <span>{feeText(item)}</span>
                      </div>
                      <div class="event-tags">
                        <span>{item.genderNormalized}</span>
                        <span>{item.matchTypeNormalized}</span>
                        <span>{item.levelNormalized}</span>
                        <span>{item.divisionLabels[0]}</span>
                      </div>
                    </div>
                    <div class="entry-box">
                      <div class="entry-top">
                        <strong>{numbers ? `${numbers.current} / ${numbers.capacity}` : "정원 확인"}</strong>
                        <span>{numbers ? `${Math.round(numbers.ratio * 100)}%` : status}</span>
                      </div>
                      <div class="progress"><b style={`width:${numbers ? Math.round(numbers.ratio * 100) : 0}%`}></b></div>
                      <div class={`entry-state ${statusClass(item)}`}>{status}</div>
                    </div>
                  </button>
                </article>
              {/each}
            </section>
          {/each}
        {/if}
      </div>
    </div>

    <aside class="tourney-rail" aria-label="지역별 대회 일정">
      <section class="rail-card rail-intro">
        <span class="rail-label">Schedule</span>
        <h2>지역별 대회일</h2>
        <p>이번 주 신청 목록에 있는 대회가 실제로 언제 열리는지 지역별로 정리했습니다.</p>
      </section>
      <section class="rail-card schedule-card">
        <span class="rail-label">By Region</span>
        {#if regionSchedule.length}
          <div class="region-schedule-list">
            {#each regionSchedule as group}
              <div class="region-schedule-group">
                <div class="region-schedule-head">
                  <strong>{group.region}</strong>
                  <span>{group.items.length}개 표시</span>
                </div>
                {#each group.items as item}
                  <button class="mini-event schedule-event" type="button" on:click={() => openTournament(item)}>
                    <span class="schedule-date">{eventDateRange(item)}</span>
                    <strong>{item.titleRaw}</strong>
                    <small>{item.venueName || item.venueAddress || hostText(item)}</small>
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {:else}
          <p>선택한 조건에 맞는 이번 주 신청 대회가 없습니다.</p>
        {/if}
      </section>
      <section class="ad-unit">
        <div><strong>광고</strong><span>Advertisement</span></div>
      </section>
    </aside>
  </section>
</main>

<Drawer open={filterOpen} title="대회 필터" side="bottom" onClose={() => (filterOpen = false)}>
  <div class="drawer-section">
    <span>성별</span>
    <div class="choice-grid">
      <button class:active={!filters.gender} class="choice" type="button" on:click={() => setFilter("gender", "")}>전체</button>
      {#each genders as gender}
        <button class:active={filters.gender === gender} class="choice" type="button" on:click={() => setFilter("gender", gender)}>{gender}</button>
      {/each}
    </div>
  </div>
  <div class="drawer-section">
    <span>경기 방식</span>
    <div class="choice-grid">
      <button class:active={!filters.matchType} class="choice" type="button" on:click={() => setFilter("matchType", "")}>전체</button>
      {#each matchTypes as matchType}
        <button class:active={filters.matchType === matchType} class="choice" type="button" on:click={() => setFilter("matchType", matchType)}>{matchType}</button>
      {/each}
    </div>
  </div>
  <div class="drawer-section">
    <span>레벨</span>
    <select value={filters.level} on:change={(event) => setFilter("level", event.currentTarget.value)}>
      <option value="">전체 레벨</option>
      {#each levels as level}<option value={level}>{level}</option>{/each}
    </select>
  </div>
  <div class="drawer-section">
    <span>부서</span>
    <select value={filters.division} on:change={(event) => setFilter("division", event.currentTarget.value)}>
      <option value="">전체 부서</option>
      {#each divisions as division}<option value={division}>{division}</option>{/each}
    </select>
  </div>
  <div class="drawer-actions">
    <button class="secondary-button" type="button" on:click={resetFilters}>초기화</button>
    <button class="primary-button" type="button" on:click={() => (filterOpen = false)}>{filtered.length}개 보기</button>
  </div>
</Drawer>

<Drawer open={alarmOpen} title="대회 알림" side="bottom" onClose={() => (alarmOpen = false)}>
  <p class="drawer-copy">선택한 지역과 주간 대회 알림을 받을 수 있도록 준비 중입니다.</p>
  <button class="primary-button" type="button">알림 설정 준비 중</button>
</Drawer>

<Modal open={Boolean(selected)} title={selected?.titleRaw || ""} onClose={() => (selected = null)}>
  {#if selected}
    {@const numbers = participantNumbers(selected)}
    <div class="detail-grid">
      <div><span>일정</span><strong>{formatDate(selected.startDate)}{selected.endDate && selected.endDate !== selected.startDate ? ` - ${formatDate(selected.endDate)}` : ""}</strong></div>
      <div><span>시간</span><strong>{eventTime(selected)}</strong></div>
      <div><span>상태</span><strong>{participantStatus(selected)}</strong></div>
      <div><span>참가</span><strong>{numbers ? `${numbers.current}/${numbers.capacity}명` : "확인 필요"}</strong></div>
      <div><span>참가비</span><strong>{feeText(selected)}</strong></div>
      <div><span>주최</span><strong>{hostText(selected)}</strong></div>
    </div>
    <div class="modal-section">
      <span>장소</span>
      <p>{selected.venueName || selected.venueAddress || "장소 정보 없음"}</p>
    </div>
    <div class="modal-section">
      <span>참가 조건</span>
      <p>{selected.genderNormalized} · {selected.matchTypeNormalized} · {selected.levelNormalized} · {selected.divisionLabels.join(", ")}</p>
    </div>
    <p class="notice">신청과 결제는 공식 주최처에서 진행됩니다.</p>
    <a class="primary-button modal-apply" href={sourceHref(selected) || "#"} target="_blank" rel="noopener noreferrer">공식 신청처 열기</a>
  {/if}
</Modal>

<style>
  .regionbar,
  .weekbar {
    position: sticky;
    background: rgba(244, 245, 243, 0.86);
    backdrop-filter: blur(22px);
    border-bottom: 1px solid var(--line);
  }

  .regionbar {
    top: var(--header-height);
    z-index: 90;
    height: var(--subbar-height);
  }

  .weekbar {
    top: calc(var(--header-height) + var(--subbar-height));
    z-index: 80;
    height: var(--datebar-height);
  }

  .regionbar-inner,
  .weekbar-inner {
    max-width: 1500px;
    height: 100%;
    margin: 0 auto;
    padding: 8px 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .region-tab {
    height: 42px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 13px;
    color: #646964;
    white-space: nowrap;
  }

  .region-tab.active {
    background: #fff;
    color: var(--text-primary);
    box-shadow: 0 8px 22px rgba(42, 51, 45, 0.08), inset 0 0 0 1px rgba(23, 28, 24, 0.055);
  }

  .region-tab strong {
    font-size: 13px;
  }

  .region-tab small {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 700;
  }

  .weekbar-inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
  }

  .view-title {
    display: grid;
    gap: 3px;
    font-size: 13px;
  }

  .view-title small {
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .week-nav {
    height: 48px;
    min-width: 296px;
    display: flex;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.95);
    border-radius: 17px;
    background: rgba(255, 255, 255, 0.78);
    box-shadow: 0 10px 30px rgba(42, 51, 45, 0.07), inset 0 0 0 1px rgba(23, 28, 24, 0.04);
    padding: 5px;
  }

  .nav-arrow {
    width: 39px;
    height: 38px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    font-size: 24px;
  }

  .week-display {
    flex: 1;
    display: grid;
    text-align: center;
    animation: weekSwap 320ms var(--ease-standard);
  }

  .week-display strong {
    font-size: 14px;
  }

  .week-display span {
    margin-top: 3px;
    color: #8e938e;
    font-size: 10px;
  }

  @keyframes weekSwap {
    from {
      opacity: 0;
      transform: translateX(calc(var(--dir) * 16px));
    }
  }

  .this-week {
    justify-self: end;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #6d726d;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 700;
  }

  .tournament-page {
    padding-top: 0;
  }

  .tourney-shell {
    height: calc(100dvh - var(--header-height) - var(--subbar-height) - var(--datebar-height) - 18px);
    min-height: 540px;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(380px, 28vw);
    min-block-size: 0;
  }

  .tourney-main {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--line);
  }

  .tourney-toolbar {
    min-height: 62px;
    padding: 9px 18px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.62);
  }

  .toolbar-copy {
    display: grid;
    gap: 3px;
    min-width: 160px;
  }

  .toolbar-copy strong {
    font-size: 13px;
  }

  .toolbar-copy span {
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .search-box {
    flex: 1;
    min-width: 220px;
    height: 44px;
    display: flex;
    align-items: center;
    gap: 9px;
    border-radius: 16px;
    background: #fff;
    padding: 0 14px;
    color: var(--text-tertiary);
  }

  .search-box input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
  }

  .icon-filter {
    width: 42px;
    height: 42px;
    border: 1px solid rgba(24, 29, 25, 0.07);
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.82);
    display: grid;
    place-items: center;
  }

  .icon-filter span {
    width: 18px;
    height: 12px;
    background:
      linear-gradient(#161a17, #161a17) 0 0 / 16px 1.6px no-repeat,
      linear-gradient(#161a17, #161a17) 4px 5px / 9px 1.6px no-repeat,
      linear-gradient(#161a17, #161a17) 7px 10px / 4px 1.6px no-repeat;
  }

  .tourney-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 12px 12px 24px;
    scrollbar-width: thin;
    overscroll-behavior: contain;
    animation: listSwitch 420ms var(--ease-standard);
  }

  @keyframes listSwitch {
    from {
      opacity: 0.25;
      transform: translateX(calc(var(--dir) * 16px));
    }
  }

  .tourney-day {
    position: sticky;
    top: -12px;
    z-index: 10;
    padding: 16px 8px 9px;
    background: linear-gradient(180deg, rgba(250, 251, 249, 0.97) 70%, rgba(250, 251, 249, 0));
  }

  .tourney-day strong {
    display: block;
    font-size: 18px;
    letter-spacing: 0;
  }

  .tourney-day span {
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .event-card {
    margin: 0 0 9px;
    opacity: 0;
    transform: translateY(12px);
    animation: eventIn 540ms var(--ease-standard) forwards;
    animation-delay: var(--delay);
  }

  @keyframes eventIn {
    to {
      opacity: 1;
      transform: none;
    }
  }

  .event-main {
    width: 100%;
    min-height: 112px;
    border: 1px solid rgba(28, 34, 29, 0.07);
    border-radius: 19px;
    background: rgba(255, 255, 255, 0.78);
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) 150px;
    gap: 16px;
    align-items: center;
    padding: 17px 18px;
    text-align: left;
    transition: transform 240ms var(--ease-standard), box-shadow 240ms var(--ease-standard), background 240ms var(--ease-standard);
  }

  .event-main:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 32px rgba(43, 52, 46, 0.09);
    background: #fff;
  }

  .event-date {
    height: 62px;
    border-radius: 16px;
    border: 1px solid rgba(26, 31, 27, 0.06);
    background: linear-gradient(145deg, #f3f6f3, #fff);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .event-date b {
    font-size: 24px;
    line-height: 1;
  }

  .event-date small {
    margin-top: 5px;
    color: #878c87;
    font-size: 10px;
  }

  .event-copy {
    min-width: 0;
  }

  .event-kicker {
    margin-bottom: 7px;
    color: var(--accent);
    font-size: 10px;
    font-weight: 760;
  }

  .event-copy h2 {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    line-height: 1.35;
    letter-spacing: 0;
  }

  .event-meta,
  .event-tags {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: #818681;
    font-size: 10px;
  }

  .event-meta span,
  .event-tags span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .event-tags span {
    border-radius: 999px;
    background: rgba(24, 29, 25, 0.055);
    padding: 5px 8px;
    font-weight: 720;
  }

  .entry-box {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .entry-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 9px;
  }

  .entry-top strong {
    font-size: 16px;
  }

  .entry-top span {
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .progress {
    height: 6px;
    border-radius: 999px;
    background: rgba(36, 42, 37, 0.07);
    overflow: hidden;
  }

  .progress b {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent), #38a877);
  }

  .entry-state {
    margin-top: 8px;
    color: var(--accent);
    text-align: right;
    font-size: 10px;
    font-weight: 760;
  }

  .entry-state.warn {
    color: var(--warning);
  }

  .entry-state.muted {
    color: var(--text-tertiary);
  }

  .tourney-rail {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 18px;
  }

  .rail-card {
    margin-bottom: 12px;
    border: 1px solid rgba(28, 34, 29, 0.06);
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.72);
    padding: 18px;
  }

  .rail-label {
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .rail-card h2 {
    margin: 12px 0 8px;
    font-size: 20px;
    line-height: 1.25;
    letter-spacing: 0;
  }

  .rail-card p {
    margin: 0;
    color: #858a85;
    font-size: 11px;
    line-height: 1.65;
  }

  .schedule-card {
    padding-bottom: 8px;
  }

  .region-schedule-list {
    display: grid;
    gap: 16px;
    margin-top: 14px;
  }

  .region-schedule-group {
    display: grid;
    gap: 7px;
  }

  .region-schedule-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--line);
  }

  .region-schedule-head strong {
    font-size: 14px;
  }

  .region-schedule-head span {
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 720;
  }

  .schedule-event {
    gap: 6px;
    padding: 10px 0 11px;
  }

  .schedule-date {
    color: var(--accent);
    font-size: 11px;
    font-weight: 840;
  }

  .schedule-event small {
    color: #9a9f9a;
    font-size: 10px;
    line-height: 1.35;
  }

  .mini-event {
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
    display: grid;
    gap: 5px;
    padding: 11px 0;
    text-align: left;
  }

  .mini-event strong {
    font-size: 12px;
    line-height: 1.35;
  }

  .mini-event span {
    color: #8d928d;
    font-size: 10px;
  }

  .drawer-section {
    display: grid;
    gap: 11px;
    margin-bottom: 20px;
  }

  .drawer-section > span,
  .modal-section > span {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 800;
  }

  .choice-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .choice,
  .drawer-section select {
    min-height: 42px;
    border: 0;
    border-radius: 12px;
    background: rgba(24, 29, 25, 0.055);
    padding: 0 13px;
    color: #686d68;
    font-size: 12px;
    font-weight: 720;
  }

  .choice.active {
    background: #171b18;
    color: #fff;
  }

  .drawer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin: 18px 0;
  }

  .detail-grid div,
  .modal-section,
  .notice {
    border-radius: 16px;
    background: rgba(24, 29, 25, 0.045);
    padding: 14px;
    display: grid;
    gap: 7px;
  }

  .detail-grid span {
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 800;
  }

  .modal-section,
  .notice {
    margin-top: 10px;
  }

  .modal-section p,
  .notice {
    line-height: 1.55;
  }

  .modal-section p {
    margin: 0;
  }

  .modal-apply {
    position: sticky;
    bottom: 0;
    margin-top: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 -10px 20px rgba(251, 252, 250, 0.78);
  }

  @media (max-width: 980px) {
    .tourney-shell {
      height: auto;
      min-height: 0;
      display: block;
    }

    .tourney-main {
      border-right: 0;
    }

    .tourney-list {
      max-height: none;
    }

    .tourney-rail {
      display: none;
    }
  }

  @media (max-width: 760px) {
    .regionbar {
      background: rgba(244, 245, 243, 0.94);
    }

    .weekbar {
      background: rgba(244, 245, 243, 0.92);
    }

    .regionbar-inner,
    .weekbar-inner {
      padding: 8px 10px;
    }

    .regionbar-inner {
      gap: 6px;
      scroll-padding-inline: 10px;
    }

    .region-tab {
      height: 38px;
      border-radius: 13px;
      padding: 0 11px;
      background: rgba(255, 255, 255, 0.52);
    }

    .region-tab strong {
      font-size: 12px;
    }

    .region-tab small {
      font-size: 10px;
    }

    .weekbar-inner {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
    }

    .view-title,
    .toolbar-copy {
      display: none;
    }

    .week-nav {
      width: 100%;
      min-width: 0;
      height: 48px;
      border-radius: 16px;
    }

    .week-display strong {
      font-size: 13px;
    }

    .week-display span {
      font-size: 10px;
    }

    .nav-arrow {
      width: 36px;
      height: 36px;
    }

    .this-week {
      width: 52px;
      padding: 0;
      text-align: center;
      font-size: 11px;
    }

    .tournament-page {
      padding: 8px 10px 72px;
    }

    .tourney-shell {
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.86);
      box-shadow: 0 12px 32px rgba(43, 52, 46, 0.07);
    }

    .tourney-toolbar {
      min-height: 58px;
      border-radius: 21px 21px 0 0;
      padding: 9px 10px;
      gap: 8px;
      background: rgba(255, 255, 255, 0.78);
    }

    .search-box {
      min-width: 0;
      height: 40px;
      border-radius: 14px;
      padding: 0 11px;
    }

    .search-box input {
      font-size: 12px;
    }

    .icon-filter {
      width: 40px;
      height: 40px;
      flex: 0 0 auto;
      border-radius: 13px;
    }

    .tourney-list {
      padding: 8px 8px 18px;
      overflow: visible;
    }

    .tourney-day-group + .tourney-day-group {
      margin-top: 14px;
    }

    .tourney-day {
      position: static;
      margin: 0 -8px 8px;
      padding: 12px 12px 9px;
      background: transparent;
    }

    .tourney-day strong {
      font-size: 16px;
    }

    .tourney-day span {
      font-size: 10px;
    }

    .event-main {
      grid-template-columns: 50px minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      border-radius: 17px;
      align-items: start;
    }

    .event-date {
      width: 50px;
      height: 56px;
      border-radius: 15px;
    }

    .event-date b {
      font-size: 22px;
    }

    .event-date small {
      font-size: 10px;
    }

    .event-kicker {
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .entry-box {
      grid-column: 1 / -1;
      min-height: 46px;
      border-radius: 14px;
      padding: 10px;
      gap: 7px;
    }

    .event-copy h2 {
      white-space: normal;
      font-size: 15px;
      line-height: 1.38;
      display: -webkit-box;
      line-clamp: 2;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .event-meta {
      gap: 5px;
      font-size: 10px;
    }

    .event-meta span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .event-tags {
      gap: 5px;
      margin-top: 8px;
    }

    .event-tags span {
      max-width: 100%;
      min-height: 24px;
      border-radius: 9px;
      padding: 5px 7px;
      font-size: 10px;
    }

    .entry-top strong {
      font-size: 12px;
    }

    .entry-top span,
    .entry-state {
      font-size: 10px;
    }

    .detail-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
