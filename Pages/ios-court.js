/* Instant-filter UI for the standalone page. Reservation policy, RPCs and
 * alarm functions stay in index.html; this layer owns the filter state. */
(function () {
  "use strict";

  const QUERY_KEY = "tennis_recent_queries_v1";
  const CITIES = new Set(["yongin", "goyang", "suwon", "seongnam"]);
  const DISTRICTS = new Set(["처인구", "기흥구", "수지구"]);
  const nodes = {};
  const el = id => nodes[id] || (nodes[id] = document.getElementById(id));
  const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ui = {
    selected: new Set(), invalidMessage: "", userInteracted: false, pendingQuery: null,
    pickerOpen: false, pickerGeneration: 0, previousFocus: null, previousScroll: 0,
    noticeFocus: null, noticeScroll: 0, bodyPaddingRight: ""
  };
  const originalRenderCourts = window.renderCourts;
  const originalSetCity = window.setCity;

  function todayIso() {
    const ymd = typeof window.yyyymmddTodayKst === "function" ? window.yyyymmddTodayKst() : "";
    return ymd ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : "";
  }
  function cityGroups(city = window.CURRENT_CITY) {
    const groups = new Set();
    Object.entries(window.DATA?.facilities || {}).forEach(([cid, facility]) => {
      if (typeof window.cityOfFacilityId === "function" && window.cityOfFacilityId(cid) !== city) return;
      const group = typeof window.getCourtGroup === "function" ? window.getCourtGroup(facility?.title || "") : "";
      if (group) groups.add(group);
    });
    return [...groups].sort((a, b) => a.localeCompare(b, "ko"));
  }
  function modeValue() { return document.querySelector('input[name="filterTimeMode"]:checked')?.value || "contains"; }
  function currentDistrict() { return window.CURRENT_CITY === "yongin" ? (el("filterGu")?.value || "") : ""; }
  function currentScope() { if (ui.invalidMessage) return "invalid"; if (ui.selected.size) return "courts"; if (currentDistrict()) return "district"; return "all"; }
  function querySnapshot() {
    return { city: window.CURRENT_CITY || "yongin", date: el("filterDate")?.value || todayIso(), district: currentDistrict(), courts: [...ui.selected], hour: el("filterTimeHour")?.value || "", timeMode: modeValue() };
  }
  function normalizeDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : todayIso(); }
  function decodeCourts(raw) {
    return String(raw || "").split(",").filter(Boolean).map(value => { try { return decodeURIComponent(value); } catch (_) { return value; } });
  }
  function queryFromLocation() {
    const params = new URLSearchParams(window.location.search || "");
    const naturalKeys = ["city", "date", "district", "courts", "hour", "timeMode"];
    if (!naturalKeys.some(key => params.has(key))) return null;
    const rawCity = params.get("city") || window.CURRENT_CITY || "yongin";
    const rawDistrict = params.get("district") || "";
    return { city: rawCity, date: normalizeDate(params.get("date") || todayIso()), district: rawDistrict, courts: decodeCourts(params.get("courts")), hour: params.get("hour") || "", timeMode: ["before", "after", "contains"].includes(params.get("timeMode")) ? params.get("timeMode") : "contains", invalidCity: !CITIES.has(rawCity), invalidDistrict: Boolean(rawDistrict && (rawCity !== "yongin" || !DISTRICTS.has(rawDistrict))) };
  }
  function writeQuery(query, replace = true, preserveInvalidCourts = false) {
    const params = new URLSearchParams();
    if (query.city) params.set("city", query.city);
    if (query.date) params.set("date", query.date);
    if (query.district) params.set("district", query.district);
    if (query.courts?.length && (preserveInvalidCourts || !ui.invalidMessage || ui.invalidMessage.includes("시설"))) params.set("courts", query.courts.join(","));
    if (query.hour) params.set("hour", query.hour);
    if (query.hour && query.timeMode && query.timeMode !== "contains") params.set("timeMode", query.timeMode);
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || ""}`;
    window.history?.[replace ? "replaceState" : "pushState"]({}, "", next);
  }
  function readRecents() { try { const value = JSON.parse(localStorage.getItem(QUERY_KEY) || "[]"); return Array.isArray(value) ? value.slice(0, 3) : []; } catch (_) { return []; } }
  function saveRecent(query) {
    if (ui.invalidMessage || !query?.city || !query?.date) return;
    const clean = { city: query.city, date: query.date, district: query.district || "", courts: [...(query.courts || [])], hour: query.hour || "", timeMode: query.timeMode || "contains" };
    const key = JSON.stringify(clean); const next = [clean, ...readRecents().filter(item => JSON.stringify(item) !== key)].slice(0, 3);
    try { localStorage.setItem(QUERY_KEY, JSON.stringify(next)); } catch (_) {}
    renderRecents();
  }
  function queryLabel(query) {
    const city = window.CITY_LABELS?.[query.city] || query.city;
    const place = query.courts?.length ? (query.courts.length === 1 ? query.courts[0] : `${query.courts[0]} 외 ${query.courts.length - 1}곳`) : (query.district || `${city} 전체`);
    const mode = { before: "이전", after: "이후", contains: "포함" }[query.timeMode] || "포함";
    return `${place} · ${query.date}${query.hour ? ` · ${query.hour}시 ${mode}` : ""}`;
  }
  function renderRecents() {
    const target = el("recentQueries"); if (!target) return; target.replaceChildren();
    const recents = readRecents(); if (!recents.length) return;
    target.appendChild(Object.assign(document.createElement("span"), { className: "recent-title", textContent: "최근 조회" }));
    recents.forEach(query => { const button = document.createElement("button"); button.type = "button"; button.className = "recent-query"; button.textContent = queryLabel(query); button.addEventListener("click", () => { ui.userInteracted = true; applyQuery(query, true); }); target.appendChild(button); });
  }
  function updateHiddenSelect() {
    const select = el("filterCourt"); if (!select) return;
    const first = [...ui.selected][0] || ""; select.value = first; [...select.options].forEach(option => { option.selected = ui.selected.has(option.value); });
    const label = el("courtFilterLabel"); if (label) label.textContent = ui.selected.size ? (ui.selected.size === 1 ? first : `${ui.selected.size}곳 선택`) : "시설 전체";
  }
  function setSelected(groups) { ui.selected = new Set([...groups].filter(Boolean)); window.SELECTED_COURTS = new Set(ui.selected); updateHiddenSelect(); }
  function favoriteKey(city, group) { return `${city}|${group}`; }
  function favoriteList() { try { const parsed = JSON.parse(localStorage.getItem("tennis_favorite_courts_v1") || "[]"); return Array.isArray(parsed) ? parsed.filter(item => item?.city && item?.group).map(item => ({ city: String(item.city), group: String(item.group) })) : []; } catch (_) { return []; } }
  function saveFavorites(list) { const seen = new Set(); const clean = list.filter(item => { const key = favoriteKey(item.city, item.group); if (!item.city || !item.group || seen.has(key)) return false; seen.add(key); return true; }); localStorage.setItem("tennis_favorite_courts_v1", JSON.stringify(clean)); }
  function isFavorite(city, group) { return favoriteList().some(item => favoriteKey(item.city, item.group) === favoriteKey(city, group)); }
  function toggleFavorite(city, group) {
    const key = favoriteKey(city, group); const list = favoriteList();
    saveFavorites(list.some(item => favoriteKey(item.city, item.group) === key) ? list.filter(item => favoriteKey(item.city, item.group) !== key) : [...list, { city, group }]);
    renderPickerOptions(); renderFavorites(); window.renderCourts?.();
  }
  window.toggleFavoriteCourt = toggleFavorite;
  function selectFavorite(city, group) { ui.userInteracted = true; if (window.CURRENT_CITY !== city) originalSetCity?.(city); ui.invalidMessage = ""; setSelected([group]); syncFilters(true); }
  function renderFavorites() {
    const list = el("favoriteList"); if (!list) return; list.replaceChildren(); const favorites = favoriteList();
    if (!favorites.length) { list.appendChild(Object.assign(document.createElement("span"), { className: "favorite-empty", textContent: "저장된 시설이 없습니다." })); return; }
    favorites.forEach(item => { const row = document.createElement("div"); row.className = "favorite-chip"; const pick = document.createElement("button"); pick.type = "button"; pick.className = "favorite-pick"; pick.textContent = `${window.CITY_LABELS?.[item.city] || item.city} · ${item.group}`; pick.addEventListener("click", () => selectFavorite(item.city, item.group)); const remove = document.createElement("button"); remove.type = "button"; remove.className = "favorite-remove"; remove.textContent = "★"; remove.setAttribute("aria-label", `${item.group} 즐겨찾기 해제`); remove.addEventListener("click", () => toggleFavorite(item.city, item.group)); row.append(pick, remove); list.appendChild(row); });
  }
  window.renderFavoriteCourts = renderFavorites;
  function renderPickerOptions() {
    const target = el("courtOptions"); if (!target) return; target.replaceChildren();
    cityGroups().forEach(group => {
      const row = document.createElement("div"); row.className = "court-option"; const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = ui.selected.has(group); checkbox.setAttribute("aria-label", `${group} 선택`); checkbox.addEventListener("change", () => { ui.userInteracted = true; const next = new Set(ui.selected); if (checkbox.checked) next.add(group); else next.delete(group); setSelected(next); syncFilters(true); renderPickerOptions(); }); const name = document.createElement("span"); name.textContent = group; name.className = "court-option-name"; const starred = isFavorite(window.CURRENT_CITY, group); const star = document.createElement("button"); star.type = "button"; star.className = "court-favorite-toggle"; star.textContent = starred ? "★" : "☆"; star.setAttribute("aria-label", `${group} 즐겨찾기 ${starred ? "해제" : "등록"}`); star.setAttribute("aria-pressed", String(starred)); star.addEventListener("click", event => { event.stopPropagation(); toggleFavorite(window.CURRENT_CITY, group); }); row.append(checkbox, name, star); target.appendChild(row);
    });
  }
  function updateFilterSummary() { const button = el("courtFilterButton"); if (button) button.setAttribute("aria-label", ui.selected.size ? `${ui.selected.size}개 시설 선택됨` : "시설 전체"); const dateLabel = el("filterDateLabel"); if (dateLabel && el("filterDate")?.value) dateLabel.textContent = el("filterDate").value; }
  function showInvalid(message, query) { ui.invalidMessage = message; window.SEARCH_SCOPE = "invalid"; setSelected(query?.courts || []); window.renderCourts?.(); updateFilterSummary(); }
  function applyQuery(query, save = true) {
    if (!query) return;
    if (query.invalidCity) { showInvalid("공유 URL의 도시를 다시 선택해 주세요.", { courts: [] }); return; }
    if (window.CURRENT_CITY !== query.city) originalSetCity?.(query.city);
    if (el("filterGu")) el("filterGu").value = query.district || "";
    if (el("filterDate")) { el("filterDate").value = normalizeDate(query.date); if (el("filterDateLabel")) el("filterDateLabel").textContent = el("filterDate").value; }
    if (el("filterTimeHour")) el("filterTimeHour").value = query.hour || "";
    document.querySelectorAll('input[name="filterTimeMode"]').forEach(input => { input.checked = input.value === query.timeMode; });
    const validGroups = new Set(cityGroups(query.city)); const invalidCourts = query.courts.length > 0 && !query.courts.some(group => validGroups.has(group)); const selected = query.courts.filter(group => validGroups.has(group));
    ui.invalidMessage = query.invalidDistrict ? "공유 URL의 구를 다시 선택해 주세요." : invalidCourts ? "공유 URL의 시설을 다시 선택해 주세요." : "";
    setSelected(selected); window.SEARCH_SCOPE = ui.invalidMessage ? "invalid" : currentScope(); updateFilterSummary(); window.renderCourts?.(); renderFavorites();
    const normalized = { ...query, courts: ui.invalidMessage?.includes("시설") && !selected.length ? query.courts : selected, date: el("filterDate")?.value || todayIso() };
    if (save && !ui.invalidMessage) { saveRecent(normalized); writeQuery(normalized, true); } else if (ui.invalidMessage) writeQuery(normalized, true, true);
  }
  function syncFilters(save = true) {
    if (!el("filterDate")?.value) el("filterDate").value = todayIso(); ui.invalidMessage = ""; window.SEARCH_SCOPE = currentScope(); updateFilterSummary(); window.renderCourts?.(); renderFavorites(); const query = querySnapshot(); if (save) { saveRecent(query); writeQuery(query, true); }
  }
  function resetFilters() {
    ui.userInteracted = true; ui.invalidMessage = ""; if (el("filterGu")) el("filterGu").value = ""; setSelected([]); if (el("filterDate")) el("filterDate").value = todayIso(); if (el("filterDateLabel")) el("filterDateLabel").textContent = todayIso(); if (el("filterTimeHour")) el("filterTimeHour").value = ""; document.querySelector('input[name="filterTimeMode"][value="contains"]')?.click(); syncFilters(true);
  }
  function lockBody() { ui.previousScroll = window.scrollY; ui.bodyPaddingRight = document.body.style.paddingRight; document.body.style.position = "fixed"; document.body.style.top = `-${ui.previousScroll}px`; document.body.style.width = "100%"; document.body.style.overflow = "hidden"; const gutter = window.innerWidth - document.documentElement.clientWidth; if (gutter > 0) document.body.style.paddingRight = `${gutter}px`; }
  function unlockBody() { document.body.style.position = ""; document.body.style.top = ""; document.body.style.width = ""; document.body.style.overflow = ""; document.body.style.paddingRight = ui.bodyPaddingRight; try { window.scrollTo?.({ top: ui.previousScroll, left: 0, behavior: "instant" }); } catch (_) { window.scrollTo?.(0, ui.previousScroll); } }
  function openCourtPicker(trigger) {
    const picker = el("courtPicker"); if (!picker || ui.pickerOpen) return; ui.previousFocus = trigger || document.activeElement; ui.previousFocus?.focus?.({ preventScroll: true }); const backdrop = el("courtSheetBackdrop") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "courtSheetBackdrop", className: "ios-sheet-backdrop" })); if (!backdrop.dataset.bound) { backdrop.dataset.bound = "1"; backdrop.addEventListener("click", closeCourtPicker); } if (picker.parentNode !== document.body) document.body.appendChild(picker); picker.classList.add("ios-bottom-sheet", "ios-centered-dialog"); picker.hidden = false; picker.setAttribute("role", "dialog"); picker.setAttribute("aria-modal", "true"); picker.setAttribute("aria-labelledby", "courtPickerTitle"); ui.pickerOpen = true; ui.pickerGeneration += 1; lockBody(); renderPickerOptions(); backdrop.hidden = false; requestAnimationFrame(() => { if (!ui.pickerOpen) return; backdrop.classList.add("is-open"); picker.classList.add("is-open"); const first = picker.querySelector(".court-option input, #closeCourtPicker"); first?.focus({ preventScroll: true }); });
  }
  function closeCourtPicker() { const picker = el("courtPicker"); if (!picker || !ui.pickerOpen) return; const generation = ++ui.pickerGeneration; const backdrop = el("courtSheetBackdrop"); ui.pickerOpen = false; picker.classList.remove("is-open"); backdrop?.classList.remove("is-open"); setTimeout(() => { if (generation !== ui.pickerGeneration || ui.pickerOpen) return; picker.hidden = true; picker.classList.remove("ios-bottom-sheet", "ios-centered-dialog"); if (backdrop) backdrop.hidden = true; unlockBody(); ui.previousFocus?.focus?.({ preventScroll: true }); }, reduceMotion() ? 0 : 220); }
  function openNotice(trigger) { const modal = el("noticeModal"); if (!modal) return; ui.noticeFocus = trigger || document.activeElement; ui.noticeScroll = window.scrollY; modal.style.display = "flex"; modal.classList.add("is-open"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); lockBody(); const heading = modal.querySelector("h3"); heading?.setAttribute("tabindex", "-1"); const focusHeading = () => heading?.focus({ preventScroll: true }); requestAnimationFrame(() => { focusHeading(); requestAnimationFrame(focusHeading); }); setTimeout(focusHeading, 40); }
  function closeNotice() { const modal = el("noticeModal"); if (!modal) return; modal.classList.remove("is-open"); setTimeout(() => { modal.style.display = "none"; unlockBody(); ui.noticeFocus?.focus?.({ preventScroll: true }); }, reduceMotion() ? 0 : 220); }
  function trapFocus(event, container) { if (event.key !== "Tab") return; const focusable = [...container.querySelectorAll("button, input, select, a, [tabindex]:not([tabindex='-1'])")].filter(node => !node.disabled && node.offsetParent !== null); if (!focusable.length) return; const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  function bind() {
    el("courtFilterButton")?.addEventListener("click", event => openCourtPicker(event.currentTarget)); el("closeCourtPicker")?.addEventListener("click", closeCourtPicker); el("resetFilters")?.addEventListener("click", resetFilters);
    ["filterGu", "filterDate", "filterTimeHour"].forEach(id => el(id)?.addEventListener("change", () => { ui.userInteracted = true; syncFilters(true); })); document.querySelectorAll('input[name="filterTimeMode"]').forEach(input => input.addEventListener("change", () => { ui.userInteracted = true; syncFilters(true); })); document.querySelectorAll(".quick-date").forEach(button => button.addEventListener("click", () => setTimeout(() => { ui.userInteracted = true; syncFilters(true); }, 0))); ["tabYongin", "tabGoyang", "tabSuwon", "tabSeongnam"].forEach(id => el(id)?.addEventListener("click", () => setTimeout(() => { ui.userInteracted = true; setSelected([]); syncFilters(true); }, 0)));
    window.iosFilterChanged = () => { if (!ui.pickerOpen) syncFilters(true); }; el("noticeBtn")?.addEventListener("click", event => { event.preventDefault(); openNotice(event.currentTarget); }); el("closeNoticeBtn")?.addEventListener("click", event => { event.preventDefault(); closeNotice(); }); el("noticeModal")?.addEventListener("click", event => { if (event.target === el("noticeModal")) closeNotice(); });
    document.addEventListener("keydown", event => { if (ui.pickerOpen) { if (event.key === "Escape") { event.preventDefault(); closeCourtPicker(); } else trapFocus(event, el("courtPicker")); return; } const modal = el("noticeModal"); if (!modal?.classList.contains("is-open")) return; if (event.key === "Escape") { event.preventDefault(); closeNotice(); } else trapFocus(event, modal); });
    // WebKit can deliver End before select-ui's open rAF focuses its first
    // option. Move directly to the last option so keyboard selection remains
    // deterministic across engines.
    document.addEventListener("keydown", event => {
      const trigger = event.target?.closest?.(".ios-select-trigger");
      const directList = event.target?.closest?.(".ios-select-popover");
      const listId = trigger?.getAttribute("aria-controls");
      const list = directList || (listId ? document.getElementById(listId) : null);
      if (!list || list.hidden) return;
      if (event.key === "Escape") {
        const owner = trigger || document.getElementById(list.id.replace(/-ios-listbox$/, "-ios-trigger"));
        if (owner) { event.preventDefault(); event.stopImmediatePropagation(); owner.click(); }
        return;
      }
      if (event.key === "Enter" && list.dataset.instantEnd === "true") {
        event.preventDefault(); event.stopImmediatePropagation(); delete list.dataset.instantEnd;
        list.querySelector('[role="option"]:last-of-type')?.click(); return;
      }
      if (event.key !== "End") return;
      if (!trigger) return;
      const options = [...list.querySelectorAll('[role="option"]')].filter(option => option.getAttribute("aria-disabled") !== "true");
      if (!options.length) return;
      event.preventDefault(); event.stopImmediatePropagation(); list.dataset.instantEnd = "true"; options[options.length - 1].focus({ preventScroll: true });
    }, true);
  }
  function applyInitialState() { const parsed = queryFromLocation(); if (parsed) applyQuery(parsed, true); else applyQuery({ city: window.CURRENT_CITY || "yongin", date: todayIso(), district: "", courts: [], hour: "", timeMode: "contains" }, true); }
  function onReady() { bind(); let attempts = 0; const timer = setInterval(() => { attempts += 1; if (window.DATA?.facilities && Object.keys(window.DATA.facilities).length) { clearInterval(timer); renderPickerOptions(); renderFavorites(); if (!ui.userInteracted) applyInitialState(); } else if (attempts > 100) clearInterval(timer); }, 100); }
  window.renderCourts = function () { if (ui.invalidMessage) { const target = el("courts"); target?.replaceChildren(Object.assign(document.createElement("div"), { className: "empty-state", textContent: ui.invalidMessage })); window.renderResultSummary?.({ emptyReason: ui.invalidMessage }); renderFavorites(); return; } originalRenderCourts?.(); renderFavorites(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady, { once: true }); else onReady();
})();
