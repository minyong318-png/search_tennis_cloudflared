<script>
  import { onMount } from "svelte";
  import Drawer from "$lib/components/Drawer.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import {
    CITY_KEYS,
    CITY_LABELS,
    activeHours,
    buildCourtOptions,
    cityHealth,
    collectCourtRows,
    compactDate,
    fetchCourtData,
    reserveHref,
    todayKst,
    toInputDate,
    weekday
  } from "$lib/courts.js";

  const FAVORITE_KEY = "courtissum.favoriteCourts.v1";

  let data = { facilities: {}, availability: {}, updated_at: "" };
  let loading = true;
  let error = "";
  let city = "yongin";
  let date = todayKst();
  let direction = 1;
  let filters = { district: "", courtGroups: [], hour: "", timeMode: "contains" };
  let favorites = new Set();
  let filterOpen = false;
  let alarmOpen = false;
  let detailOpen = false;
  let selectedDetail = null;

  $: hours = activeHours(city);
  $: options = buildCourtOptions(data, city);
  $: districts = [...new Set(options.map((option) => option.district))];
  $: filteredOptions = options.filter((option) => !filters.district || option.district === filters.district);
  $: rows = collectCourtRows(data, { city, date, ...filters }, favorites);
  $: openRows = rows.filter((row) => row.count > 0);
  $: slotCount = openRows.reduce((sum, row) => sum + row.count, 0);
  $: firstOpen = openRows.map((row) => row.first).filter((time) => time && time !== "99:99").sort()[0] || "-";
  $: activeFilterCount = Number(Boolean(filters.district)) + Number(filters.courtGroups.length > 0) + Number(Boolean(filters.hour));

  onMount(() => {
    const openFilter = () => (filterOpen = true);
    const openAlarm = () => (alarmOpen = true);
    window.addEventListener("courtissum:open-filter", openFilter);
    window.addEventListener("courtissum:open-alarm", openAlarm);

    (async () => {
      try {
        const params = new URLSearchParams(location.search);
        const cityParam = params.get("city");
        if (cityParam && CITY_LABELS[cityParam]) city = cityParam;
        if (params.get("date")) date = params.get("date");
        filters.district = params.get("district") || "";
        filters.courtGroups = String(params.get("courts") || "").split(",").filter(Boolean);
        favorites = loadFavorites();
        data = await fetchCourtData();
      } catch (err) {
        error = err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.";
      } finally {
        loading = false;
      }
    })();

    return () => {
      window.removeEventListener("courtissum:open-filter", openFilter);
      window.removeEventListener("courtissum:open-alarm", openAlarm);
    };
  });

  $: if (typeof window !== "undefined") {
    const params = new URLSearchParams();
    params.set("city", city);
    params.set("date", date);
    if (filters.district) params.set("district", filters.district);
    if (filters.courtGroups.length) params.set("courts", filters.courtGroups.join(","));
    history.replaceState(null, "", `/?${params.toString()}`);
  }

  function setCity(next) {
    if (next === city) return;
    const oldIndex = CITY_KEYS.indexOf(city);
    const nextIndex = CITY_KEYS.indexOf(next);
    direction = nextIndex > oldIndex ? 1 : -1;
    city = next;
    filters = { ...filters, district: "", courtGroups: [] };
  }

  function moveDate(delta) {
    const base = date ? new Date(`${date}T00:00:00`) : new Date();
    base.setDate(base.getDate() + delta);
    direction = delta > 0 ? 1 : -1;
    date = toInputDate(base);
  }

  function toggleCourtGroup(group) {
    const next = new Set(filters.courtGroups);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    filters = { ...filters, courtGroups: [...next] };
  }

  function resetFilters() {
    filters = { district: "", courtGroups: [], hour: "", timeMode: "contains" };
  }

  function loadFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAVORITE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function favoriteId(row) {
    return `${city}|${row.courtGroup}`;
  }

  function toggleFavorite(row) {
    const next = new Set(favorites);
    const id = favoriteId(row);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    favorites = next;
    localStorage.setItem(FAVORITE_KEY, JSON.stringify([...favorites].sort()));
  }

  function openSlot(row, hour, slots) {
    selectedDetail = { row, hour, slots };
    detailOpen = true;
  }

  function slotLabel(slot) {
    return [slot?._courtLabel, slot?.timeContent].filter(Boolean).join(" ");
  }
</script>

<svelte:head>
  <title>코트있음? | 공공 테니스장 잔여 코트 현황</title>
  <meta name="description" content="용인, 고양, 수원, 성남, 안양, 파주, 하남, 의왕 공공 테니스장의 날짜별 잔여 코트 현황을 확인하세요." />
  <link rel="canonical" href="https://courtissum.pages.dev/" />
</svelte:head>

<section class="subbar">
  <div class="subbar-inner" aria-label="도시 선택">
    {#each CITY_KEYS as key}
      <button class:active={city === key} class="scope-tab" type="button" title={`${CITY_LABELS[key]} 수집 상태`} on:click={() => setCity(key)}>
        <span class={`status-dot ${cityHealth(data, key) === "warn" ? "warn" : cityHealth(data, key) === "error" ? "error" : ""}`}></span>
        <span>{CITY_LABELS[key]}</span>
      </button>
    {/each}
  </div>
</section>

<section class="datebar">
  <div class="datebar-inner">
    <div class="view-title">
      <strong>{CITY_LABELS[city]} 코트 시간표</strong>
      <small>{loading ? "데이터 동기화 중" : `${openRows.length}개 코트 · ${slotCount}개 잔여 시간`}</small>
    </div>
    <div class="date-nav" aria-label="날짜 선택">
      <button class="nav-arrow" type="button" aria-label="이전 날짜" on:click={() => moveDate(-1)}>‹</button>
      <div class="date-display" style={`--dir:${direction}`}>
        <strong>{compactDate(date)} {weekday(date)}요일</strong>
        <span>{date === todayKst() ? "오늘" : date}</span>
      </div>
      <button class="nav-arrow" type="button" aria-label="다음 날짜" on:click={() => moveDate(1)}>›</button>
    </div>
    <button class="today-button" type="button" on:click={() => (date = todayKst())}>오늘</button>
  </div>
</section>

<main class="app-page">
  <section class="court-shell glass-panel">
    <div class="table-toolbar">
      <div class="table-caption">
        <strong>{CITY_LABELS[city]}</strong>
        <span>잔여 시간은 공식 예약처 공개 정보를 기준으로 갱신됩니다.</span>
      </div>
      <div class="toolbar-spacer"></div>
      <button class="small-action" type="button" on:click={() => (filterOpen = true)}>필터{activeFilterCount ? ` ${activeFilterCount}` : ""}</button>
      <button class="small-action" type="button" on:click={() => (alarmOpen = true)}>알람</button>
    </div>

    {#if error}
      <div class="empty-state">마지막 정상 데이터를 불러오지 못했습니다. {error}</div>
    {:else if loading}
      <div class="empty-state">코트 데이터를 동기화하는 중입니다.</div>
    {:else}
      <div class="table-viewport" role="region" aria-label="코트 시간표 가로 스크롤 영역">
        <div class="matrix" style={`grid-template-columns: var(--court-col, clamp(154px, 20vw, 250px)) repeat(${hours.length}, minmax(var(--hour-col, 64px), 1fr)); --shift:${direction * 16}px`}>
          <div class="cell head corner">코트 / 위치</div>
          {#each hours as hour}
            <div class="cell head">{hour}:00</div>
          {/each}

          {#if !rows.length}
            <div class="matrix-empty">
              <strong>선택한 조건에 예약 가능한 코트가 없습니다.</strong>
              <button class="secondary-button" type="button" on:click={resetFilters}>필터 초기화</button>
            </div>
          {/if}

          {#each rows as row, rowIndex}
            <div class="cell court-cell row-enter" style={`animation-delay:${rowIndex * 34}ms`}>
              <button class="favorite" type="button" aria-label="즐겨찾기 전환" on:click={() => toggleFavorite(row)}>{favorites.has(favoriteId(row)) ? "★" : "☆"}</button>
              <div>
                <div class="court-name">{row.courtGroup}</div>
                <div class="court-location">{row.district} · {row.locationText}</div>
              </div>
            </div>
            {#each hours as hour, hourIndex}
              {@const hourSlots = row.byHour.get(hour) || []}
              <div class="cell slot row-enter" style={`animation-delay:${rowIndex * 34 + hourIndex * 9}ms`}>
                {#if hourSlots.length}
                  <button class:last={hourSlots.length === 1} class="slot-button available" type="button" on:click={() => openSlot(row, hour, hourSlots)}>
                    <span class="state-dot"></span>
                    <span>{hourSlots.length === 1 ? "1면" : "가능"}</span>
                  </button>
                {:else}
                  <span class="slot-button off">—</span>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <section class="below reveal is-visible" aria-label="광고 및 안내">
    <div class="ad-unit">
      <div><strong>광고</strong><span>Advertisement</span></div>
    </div>
    <div class="info-grid">
      <article class="info-card">
        <span>Data</span>
        <h3>공식 예약 정보를 기준으로 보여줍니다.</h3>
        <p>잔여 시간은 각 시설의 공개 예약 정보를 수집해 정리하며, 예약과 결제는 공식 예약처에서 진행됩니다.</p>
      </article>
      <article class="info-card">
        <span>Filter</span>
        <h3>필터는 필요할 때만 열립니다.</h3>
        <p>도시, 날짜, 구, 코트 장소, 시간 조건을 바꿔도 시간표 중심 흐름이 유지되도록 구성했습니다.</p>
      </article>
      <article class="info-card">
        <span>Alert</span>
        <h3>원하는 조건은 알림으로 관리합니다.</h3>
        <p>코트 상세와 알람 패널에서 원하는 날짜와 시간 조건을 빠르게 확인할 수 있게 준비했습니다.</p>
      </article>
    </div>

    <section class="content-panel">
      <div class="section-heading">
        <span>Summary</span>
        <h2>오늘의 조회 데이터 요약</h2>
        <p>현재 선택한 지역과 날짜를 기준으로 수집된 공개 예약 정보를 정리합니다. 수집 지연, 예약 기간 외 날짜, 공식 사이트 응답 오류는 실제 예약 불가와 다를 수 있습니다.</p>
      </div>
      <div class="metric-grid">
        <article><strong>{CITY_LABELS[city]}</strong><span>선택 지역</span></article>
        <article><strong>{openRows.length ? `${openRows.length}곳` : loading ? "확인 중" : "0곳"}</strong><span>잔여 시간이 있는 코트 묶음</span></article>
        <article><strong>{slotCount ? `${slotCount}개` : loading ? "확인 중" : "0개"}</strong><span>표시된 잔여 시간</span></article>
        <article><strong>{firstOpen}</strong><span>가장 빠른 잔여 시간</span></article>
      </div>
      <p class="content-note">마지막 정상 갱신: {data.updated_at ? new Date(data.updated_at).toLocaleString("ko-KR") : "수집 상태 확인 중"} · 예약과 결제는 각 공식 예약처에서 진행됩니다.</p>
    </section>

    <section class="content-panel">
      <div class="section-heading">
        <span>Why CourtIssum</span>
        <h2>코트있음?이 제공하는 고유한 정리 방식</h2>
        <p>여러 지자체와 시설 예약 화면은 서로 다른 형식으로 공개됩니다. 코트있음?은 날짜, 시간, 지역, 코트 묶음 기준으로 정보를 맞춰 보여주고, 사용자가 공식 예약처를 하나씩 열어 비교하는 시간을 줄이는 데 초점을 둡니다.</p>
      </div>
      <div class="explain-grid">
        <article><h3>날짜·시간 기준 비교</h3><p>지역별 예약 화면을 같은 시간표 구조로 정리해, 오늘 또는 원하는 날짜에 어느 코트가 남아 있는지 빠르게 비교할 수 있습니다.</p></article>
        <article><h3>공식 예약처 연결</h3><p>조회 결과는 예약을 대신하지 않습니다. 각 잔여 시간 상세에서 공식 예약처로 이동해 최종 상태, 결제, 취소 조건을 확인해야 합니다.</p></article>
        <article><h3>불완전 데이터 분리</h3><p>공식 사이트가 응답하지 않거나 아직 예약 기간이 열리지 않은 경우, 실제 빈 코트 0개로 단정하지 않고 상태 안내로 구분합니다.</p></article>
      </div>
    </section>

    <section class="content-panel">
      <div class="section-heading">
        <span>How To Use</span>
        <h2>빠르게 확인하는 방법</h2>
      </div>
      <ol class="step-list">
        <li><strong>지역과 날짜 선택</strong><span>상단 지역 탭과 날짜 이동 버튼으로 조회 범위를 먼저 정합니다.</span></li>
        <li><strong>필터 조정</strong><span>구, 코트 묶음, 시간 조건을 좁혀 실제로 갈 수 있는 후보만 남깁니다.</span></li>
        <li><strong>잔여 시간 상세 확인</strong><span>시간표의 예약 가능 칸을 눌러 코트명과 시간 문구를 확인합니다.</span></li>
        <li><strong>공식 예약처 최종 확인</strong><span>예약과 결제 전 공식 페이지에서 최신 상태와 취소 규칙을 다시 확인합니다.</span></li>
      </ol>
    </section>

    <section class="content-panel">
      <div class="section-heading">
        <span>Rules</span>
        <h2>지역별 예약 규칙 확인 기준</h2>
        <p>예약 오픈 시간, 관내·관외 우선권, 취소와 환불 규정은 지역과 시설마다 다릅니다. 확인되지 않은 규칙은 임의로 채우지 않고 공식 정보 확인 필요로 남깁니다.</p>
      </div>
      <div class="accordion-list">
        <details><summary>관내·관외 예약 차이</summary><p>일부 시설은 관내 주민에게 먼저 예약을 열거나, 관외 이용자에게 다른 오픈 시간을 적용합니다. 실제 적용 여부는 공식 예약처의 안내를 기준으로 합니다.</p></details>
        <details><summary>취소·환불 기준</summary><p>취소 가능 시점과 환불 비율은 시설별로 다릅니다. 우천 취소, 당일 취소, 노쇼 처리 기준도 공식 공지에서 최종 확인해야 합니다.</p></details>
        <details><summary>데이터 갱신과 지연</summary><p>공식 사이트 점검, 접속 지연, 예약 화면 변경이 있으면 수집이 늦어질 수 있습니다. 표시된 갱신 시각을 보고 오래된 데이터인지 확인하세요.</p></details>
      </div>
    </section>

    <section class="content-panel">
      <div class="section-heading">
        <span>FAQ</span>
        <h2>자주 묻는 질문</h2>
      </div>
      <div class="faq-grid">
        <article><h3>왜 공식 예약처와 숫자가 다를 수 있나요?</h3><p>수집 이후 다른 사용자가 예약했거나 공식 사이트가 상태를 늦게 반영했을 수 있습니다. 결제 전 공식 예약처에서 마지막으로 확인해야 합니다.</p></article>
        <article><h3>예약 가능한 시간이 없으면 정말 모두 찬 건가요?</h3><p>항상 그렇지는 않습니다. 예약 기간이 아직 열리지 않았거나 수집 실패 상태일 수 있어 상태 문구와 갱신 시간을 함께 확인해야 합니다.</p></article>
        <article><h3>오류 제보는 어떻게 하나요?</h3><p>문의 페이지에서 지역, 시설명, 날짜, 잘못된 내용, 공식 출처 링크를 함께 보내면 확인 후 수정합니다.</p></article>
      </div>
      <a class="text-link" href="/faq/">FAQ 전체 보기</a>
    </section>
  </section>
</main>

<Drawer open={filterOpen} title="코트 필터" side="bottom" onClose={() => (filterOpen = false)}>
  <div class="drawer-section">
    <span>구</span>
    <div class="choice-grid">
      <button class:active={!filters.district} class="choice" type="button" on:click={() => (filters = { ...filters, district: "", courtGroups: [] })}>전체</button>
      {#each districts as district}
        <button class:active={filters.district === district} class="choice" type="button" on:click={() => (filters = { ...filters, district, courtGroups: [] })}>{district}</button>
      {/each}
    </div>
  </div>
  <div class="drawer-section">
    <span>코트</span>
    <div class="option-list">
      {#each filteredOptions as option}
        <label class="check-option">
          <input type="checkbox" checked={filters.courtGroups.includes(option.value)} on:change={() => toggleCourtGroup(option.value)} />
          <strong>{option.label}</strong>
          <small>{option.district} · {option.courtCount}개 코트</small>
        </label>
      {/each}
    </div>
  </div>
  <div class="drawer-section">
    <span>시간</span>
    <div class="inline-fields">
      <select bind:value={filters.hour} aria-label="시간">
        <option value="">전체 시간</option>
        {#each hours as hour}<option value={String(hour)}>{hour}:00</option>{/each}
      </select>
      <select bind:value={filters.timeMode} aria-label="시간 조건">
        <option value="contains">해당 시간 포함</option>
        <option value="after">이후 시작</option>
        <option value="before">이전 시작</option>
      </select>
    </div>
  </div>
  <div class="drawer-actions">
    <button class="secondary-button" type="button" on:click={resetFilters}>초기화</button>
    <button class="primary-button" type="button" on:click={() => (filterOpen = false)}>{filters.courtGroups.length || filteredOptions.length}개 장소 보기</button>
  </div>
</Drawer>

<Drawer open={alarmOpen} title="코트 알람" side="bottom" onClose={() => (alarmOpen = false)}>
  <p class="drawer-copy">기존 알람 등록 기능은 다음 단계에서 Supabase RPC와 연결됩니다. 시간표 셀 상세에서 바로 알람을 등록할 수 있게 준비했습니다.</p>
  <button class="primary-button" type="button">새 알람 등록</button>
</Drawer>

<Modal open={detailOpen} title={selectedDetail ? `${selectedDetail.row.courtGroup} ${selectedDetail.hour}:00` : ""} onClose={() => (detailOpen = false)}>
  {#if selectedDetail}
    <div class="detail-grid">
      <div><span>날짜</span><strong>{compactDate(date)} {weekday(date)}요일</strong></div>
      <div><span>잔여</span><strong>{selectedDetail.slots.length}면</strong></div>
      <div><span>시설</span><strong>{selectedDetail.row.locationText}</strong></div>
      <div><span>갱신</span><strong>{data.updated_at ? new Date(data.updated_at).toLocaleString("ko-KR") : "확인 중"}</strong></div>
    </div>
    <div class="slot-links">
      {#each selectedDetail.slots as slot}
        <a class="primary-button" href={reserveHref(selectedDetail.row.cid, slot)} target="_blank" rel="noopener noreferrer">{slotLabel(slot)} 예약처 열기</a>
      {/each}
    </div>
    <p class="notice">예약과 결제는 공식 예약처에서 진행됩니다.</p>
  {/if}
</Modal>

<style>
  .subbar,
  .datebar {
    position: sticky;
    z-index: 90;
    background: rgba(244, 245, 243, 0.84);
    backdrop-filter: blur(22px);
    border-bottom: 1px solid var(--line);
  }

  .subbar {
    top: var(--header-height);
    height: var(--subbar-height);
  }

  .datebar {
    top: calc(var(--header-height) + var(--subbar-height));
    height: var(--datebar-height);
    z-index: 80;
  }

  .subbar-inner,
  .datebar-inner {
    max-width: 1500px;
    height: 100%;
    margin: 0 auto;
    padding: 8px 24px;
    display: flex;
    align-items: center;
    gap: 7px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .scope-tab {
    height: 41px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    padding: 0 14px 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #686d68;
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
  }

  .scope-tab.active {
    background: #fff;
    color: var(--text-primary);
    box-shadow: 0 8px 22px rgba(42, 51, 45, 0.08), inset 0 0 0 1px rgba(23, 28, 24, 0.055);
  }

  .datebar-inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
  }

  .view-title {
    display: grid;
    gap: 3px;
    font-size: 13px;
    color: #4d514d;
  }

  .view-title small {
    color: #929792;
    font-size: 10px;
  }

  .date-nav {
    height: 48px;
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
    font-size: 22px;
  }

  .date-display {
    min-width: 205px;
    display: grid;
    text-align: center;
    animation: dateSwap 320ms var(--ease-standard);
  }

  .date-display strong {
    font-size: 14px;
  }

  .date-display span {
    margin-top: 3px;
    color: #8e938e;
    font-size: 10px;
  }

  @keyframes dateSwap {
    from {
      opacity: 0;
      transform: translateX(calc(var(--dir) * 16px));
    }
  }

  .today-button {
    justify-self: end;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #6d726d;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 650;
  }

  .court-shell {
    height: calc(100dvh - var(--header-height) - var(--subbar-height) - var(--datebar-height) - 18px);
    min-height: 520px;
    overflow: hidden;
    position: relative;
  }

  .table-toolbar {
    height: 54px;
    padding: 0 16px 0 18px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.60);
  }

  .table-caption {
    display: flex;
    gap: 8px;
    min-width: 0;
    color: #757a75;
    font-size: 12px;
  }

  .table-caption strong,
  .table-caption span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .small-action {
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #777c77;
    padding: 8px 9px;
    font-size: 11px;
    font-weight: 650;
  }

  .small-action:hover {
    background: rgba(19, 24, 21, 0.05);
    color: var(--text-primary);
  }

  .table-viewport {
    height: calc(100% - 54px);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  .matrix {
    display: grid;
    min-width: 980px;
    width: max(100%, 980px);
    animation: tableSwitch 420ms var(--ease-standard);
  }

  @keyframes tableSwitch {
    from {
      opacity: 0.25;
      transform: translateX(var(--shift));
    }
  }

  .cell {
    min-height: 62px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.28);
  }

  .head {
    position: sticky;
    top: 0;
    z-index: 24;
    min-height: 48px;
    justify-content: center;
    background: rgba(248, 249, 247, 0.94);
    backdrop-filter: blur(18px);
    color: #7a7f7a;
    font-size: 11px;
    font-weight: 700;
  }

  .corner {
    left: 0;
    z-index: 32;
    justify-content: flex-start;
    padding-left: 18px;
  }

  .court-cell {
    position: sticky;
    left: 0;
    z-index: 18;
    gap: 10px;
    padding: 0 18px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 9px 0 18px -17px rgba(15, 20, 17, 0.55);
  }

  .court-cell > div {
    min-width: 0;
  }

  .favorite {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: var(--accent-pale);
    color: #d4961e;
  }

  .court-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 730;
  }

  .court-location {
    margin-top: 5px;
    color: #989d98;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slot {
    justify-content: center;
    padding: 7px;
  }

  .slot-button {
    width: 100%;
    height: 45px;
    border: 1px solid transparent;
    border-radius: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 720;
  }

  .slot-button.available {
    border-color: rgba(13, 122, 81, 0.12);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .slot-button.last {
    border-color: rgba(189, 114, 0, 0.14);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .slot-button.off {
    background: rgba(121, 128, 122, 0.055);
    color: #a0a5a0;
  }

  .row-enter {
    animation: rowIn 550ms var(--ease-standard) both;
  }

  @keyframes rowIn {
    from {
      opacity: 0;
      transform: translateY(9px);
    }
  }

  .matrix-empty {
    grid-column: 1 / -1;
    min-height: 240px;
    display: grid;
    place-items: center;
    gap: 12px;
    color: var(--text-secondary);
  }

  .below {
    padding: 58px 0 10px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .info-card {
    min-height: 180px;
    border: 1px solid rgba(255, 255, 255, 0.92);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.65);
    box-shadow: 0 14px 40px rgba(46, 55, 49, 0.05);
    padding: 22px;
  }

  .info-card span {
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .info-card h3 {
    margin: 13px 0 10px;
    font-size: 19px;
    line-height: 1.35;
    letter-spacing: 0;
  }

  .info-card p {
    margin: 0;
    color: #7d827d;
    font-size: 11px;
    line-height: 1.75;
  }

  .content-panel {
    margin-top: 18px;
    border: 1px solid rgba(255, 255, 255, 0.92);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.64);
    box-shadow: 0 14px 40px rgba(46, 55, 49, 0.05);
    padding: 24px;
  }

  .section-heading {
    max-width: 760px;
    display: grid;
    gap: 9px;
  }

  .section-heading span {
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 24px;
    line-height: 1.25;
    letter-spacing: 0;
  }

  .section-heading p,
  .content-note,
  .explain-grid p,
  .accordion-list p,
  .faq-grid p,
  .step-list span {
    color: var(--text-secondary);
    line-height: 1.7;
    font-size: 13px;
  }

  .metric-grid,
  .explain-grid,
  .faq-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 18px;
  }

  .explain-grid,
  .faq-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-grid article,
  .explain-grid article,
  .faq-grid article,
  .step-list li,
  .accordion-list details {
    border: 1px solid rgba(27, 34, 29, 0.06);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.68);
    padding: 16px;
  }

  .metric-grid strong {
    display: block;
    font-size: 20px;
  }

  .metric-grid span {
    display: block;
    margin-top: 6px;
    color: var(--text-tertiary);
    font-size: 11px;
    line-height: 1.45;
  }

  .content-note {
    margin: 14px 0 0;
  }

  .explain-grid h3,
  .faq-grid h3 {
    margin: 0 0 9px;
    font-size: 16px;
    line-height: 1.35;
    letter-spacing: 0;
  }

  .explain-grid p,
  .faq-grid p {
    margin: 0;
  }

  .step-list {
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .step-list strong {
    display: block;
    margin-bottom: 7px;
    font-size: 15px;
  }

  .accordion-list {
    display: grid;
    gap: 9px;
    margin-top: 18px;
  }

  .accordion-list summary {
    cursor: pointer;
    font-weight: 780;
  }

  .accordion-list p {
    margin: 10px 0 0;
  }

  .text-link {
    display: inline-flex;
    margin-top: 14px;
    color: var(--accent);
    font-size: 13px;
    font-weight: 800;
  }

  .drawer-section {
    margin-bottom: 20px;
    display: grid;
    gap: 10px;
  }

  .drawer-section > span {
    color: #8d928d;
    font-size: 10px;
    font-weight: 700;
  }

  .choice-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .choice {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.7);
    padding: 10px 12px;
    font-size: 12px;
  }

  .choice.active {
    border-color: #18201c;
    background: #18201c;
    color: #fff;
  }

  .option-list {
    display: grid;
    gap: 7px;
    max-height: 280px;
    overflow: auto;
  }

  .check-option {
    display: grid;
    grid-template-columns: 20px 1fr;
    gap: 3px 10px;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.74);
    padding: 10px;
  }

  .check-option small {
    grid-column: 2;
    color: var(--text-tertiary);
    font-size: 11px;
  }

  .inline-fields,
  .drawer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .inline-fields select {
    min-height: 42px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fff;
    padding: 0 10px;
  }

  .drawer-copy,
  .notice {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.65;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 18px 0;
  }

  .detail-grid div {
    border: 1px solid var(--line);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.72);
    padding: 14px;
  }

  .detail-grid span {
    display: block;
    margin-bottom: 7px;
    color: #929792;
    font-size: 9px;
  }

  .slot-links {
    display: grid;
    gap: 8px;
  }

  @media (max-width: 760px) {
    .subbar-inner,
    .datebar-inner {
      padding: 6px 8px;
      gap: 5px;
    }

    .subbar-inner {
      scroll-padding-inline: 8px;
    }

    .scope-tab {
      height: 34px;
      flex: 0 0 auto;
      border-radius: 12px;
      padding: 0 10px 0 9px;
      gap: 6px;
      background: rgba(255, 255, 255, 0.48);
      font-size: 12px;
    }

    .scope-tab .status-dot {
      width: 6px;
      height: 6px;
    }

    .datebar-inner {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      overflow: visible;
    }

    .view-title {
      display: none;
    }

    .today-button {
      display: none;
    }

    .date-nav {
      width: min(100%, 290px);
      height: 43px;
      padding: 4px;
      border-radius: 15px;
    }

    .date-display {
      min-width: 0;
      flex: 1;
      padding: 0 4px;
    }

    .date-display strong {
      overflow: hidden;
      font-size: 13px;
      line-height: 1.1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .date-display span {
      margin-top: 2px;
      font-size: 9px;
    }

    .nav-arrow {
      width: 34px;
      height: 34px;
      border-radius: 11px;
      font-size: 20px;
      line-height: 1;
    }

    .court-shell {
      height: calc(100dvh - var(--header-height) - var(--subbar-height) - var(--datebar-height) - 10px);
      min-height: 500px;
      border-radius: 18px;
    }

    .table-toolbar {
      height: 44px;
      padding: 0 8px 0 11px;
      gap: 6px;
    }

    .table-caption {
      flex: 1 1 auto;
      gap: 5px;
      font-size: 11px;
    }

    .table-caption span {
      display: none;
    }

    .small-action {
      min-width: 36px;
      flex: 0 0 auto;
      border-radius: 10px;
      padding: 7px 8px;
      background: rgba(24, 29, 25, 0.045);
      font-size: 10px;
      line-height: 1;
      white-space: nowrap;
    }

    .table-viewport {
      height: calc(100% - 44px);
    }

    .matrix {
      min-width: 704px;
      width: max(100%, 704px);
      --court-col: 124px;
      --hour-col: 58px;
    }

    .cell {
      min-height: 52px;
    }

    .head {
      min-height: 38px;
      font-size: 10px;
    }

    .corner {
      padding-left: 11px;
    }

    .court-cell {
      gap: 7px;
      padding: 0 8px;
    }

    .favorite {
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      font-size: 12px;
    }

    .court-name {
      font-size: 12px;
      line-height: 1.25;
    }

    .court-location {
      margin-top: 3px;
      font-size: 9px;
      line-height: 1.2;
    }

    .slot {
      padding: 5px;
    }

    .slot-button {
      height: 37px;
      border-radius: 11px;
      gap: 4px;
      font-size: 10px;
      white-space: nowrap;
    }

    .matrix-empty {
      min-height: 180px;
      padding: 0 18px;
      text-align: center;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }

    .content-panel {
      border-radius: 20px;
      padding: 18px;
    }

    .metric-grid,
    .explain-grid,
    .faq-grid,
    .step-list {
      grid-template-columns: 1fr;
    }

    .detail-grid,
    .inline-fields,
    .drawer-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
