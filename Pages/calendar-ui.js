/* Small dependency-free calendar shared by the search and alarm date fields. */
(function () {
  "use strict";

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const FULL_WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const configs = new Map();
  const state = { active: null, month: null, date: null, open: false, focus: null, scroll: 0, bodyPaddingRight: "", bodyLocked: false, generation: 0 };
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const mobile = () => window.matchMedia?.("(max-width: 720px)").matches;
  const pad = value => String(value).padStart(2, "0");
  const iso = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseIso = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const today = () => {
    const ymd = typeof window.yyyymmddTodayKst === "function" ? window.yyyymmddTodayKst() : "";
    return parseIso(ymd ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : "") || new Date();
  };
  const monthStart = date => new Date(date.getFullYear(), date.getMonth(), 1);
  const monthKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  const textDate = date => `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${FULL_WEEKDAYS[date.getDay()]}`;

  function sourceLabel(config, value) {
    const label = document.getElementById(config.labelId);
    if (label) label.textContent = value || "날짜 선택";
    config.trigger.textContent = value || "날짜 선택";
    config.trigger.setAttribute("aria-label", `${config.name} ${value || "날짜 선택"}`);
  }

  function makeButton(className, label, text) {
    const button = document.createElement("button");
    button.type = "button"; button.className = className; button.setAttribute("aria-label", label); button.textContent = text;
    return button;
  }

  const calendar = document.createElement("div");
  calendar.id = "courtCalendar";
  calendar.hidden = true;
  calendar.setAttribute("role", "dialog");
  calendar.setAttribute("aria-modal", "true");
  calendar.setAttribute("aria-labelledby", "courtCalendarTitle");
  calendar.innerHTML = `
    <div class="calendar-head">
      <button type="button" class="calendar-nav" data-calendar-action="previous" aria-label="이전 달">‹</button>
      <h2 id="courtCalendarTitle" class="calendar-month" aria-live="polite"></h2>
      <button type="button" class="calendar-nav" data-calendar-action="next" aria-label="다음 달">›</button>
    </div>
    <button type="button" class="calendar-today" data-calendar-action="today">오늘로 이동</button>
    <div class="calendar-weekdays" aria-hidden="true"></div>
    <div class="calendar-grid" role="grid" aria-label="날짜 선택"></div>
    <button type="button" class="calendar-close" data-calendar-action="close" aria-label="달력 닫기">닫기</button>`;
  document.body.appendChild(calendar);
  const backdrop = document.createElement("button");
  backdrop.type = "button"; backdrop.className = "calendar-backdrop"; backdrop.hidden = true; backdrop.setAttribute("aria-label", "달력 닫기"); document.body.appendChild(backdrop);

  function syncSource(config) {
    const value = config.source.value || "";
    sourceLabel(config, value);
    if (state.active === config && state.open && value) {
      const date = parseIso(value);
      if (date) {
        state.date = date;
        if (monthKey(date) !== monthKey(state.month)) state.month = monthStart(date);
        render();
      }
    }
  }

  function position() {
    if (!state.open || calendar.classList.contains("calendar-mobile")) return;
    const rect = state.active.trigger.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = rect.bottom + 8;
    const height = calendar.offsetHeight;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 8);
    calendar.style.left = `${Math.round(left)}px`;
    calendar.style.top = `${Math.round(top)}px`;
  }

  function focusDate(dateValue) {
    calendar.querySelector(`[data-date="${CSS.escape(dateValue)}"]`)?.focus({ preventScroll: true });
  }

  function render() {
    if (!state.month) return;
    calendar.querySelector(".calendar-month").textContent = `${state.month.getFullYear()}년 ${state.month.getMonth() + 1}월`;
    const weekdays = calendar.querySelector(".calendar-weekdays");
    weekdays.replaceChildren(...WEEKDAYS.map(day => Object.assign(document.createElement("span"), { textContent: day })));
    const grid = calendar.querySelector(".calendar-grid"); grid.replaceChildren();
    const first = monthStart(state.month); const start = new Date(first); start.setDate(first.getDate() - first.getDay());
    const selected = state.active?.source.value || ""; const todayValue = iso(today());
    let row;
    for (let index = 0; index < 42; index += 1) {
      if (index % 7 === 0) {
        row = document.createElement("div"); row.className = "calendar-row"; row.setAttribute("role", "row"); grid.appendChild(row);
      }
      const date = new Date(start); date.setDate(start.getDate() + index); const value = iso(date);
      const button = document.createElement("button");
      button.type = "button"; button.className = "calendar-day"; button.dataset.date = value; button.textContent = String(date.getDate()); button.setAttribute("aria-label", textDate(date)); button.setAttribute("role", "gridcell");
      if (date.getMonth() !== state.month.getMonth()) button.classList.add("other-month");
      if (value === todayValue) { button.classList.add("today"); button.setAttribute("aria-current", "date"); }
      button.setAttribute("aria-selected", String(value === selected));
      if (value === selected) button.classList.add("selected");
      button.tabIndex = value === iso(state.date || parseIso(selected) || today()) ? 0 : -1;
      button.addEventListener("click", () => choose(value));
      row.appendChild(button);
    }
    position();
    if (state.open) focusDate(iso(state.date || parseIso(selected) || today()));
  }

  function lockBody() {
    if (!mobile() || state.bodyLocked) return;
    state.bodyLocked = true;
    state.scroll = window.scrollY; state.bodyPaddingRight = document.body.style.paddingRight;
    document.body.style.position = "fixed"; document.body.style.top = `-${state.scroll}px`; document.body.style.width = "100%"; document.body.style.overflow = "hidden";
    const gutter = window.innerWidth - document.documentElement.clientWidth; if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
  }
  function unlockBody() {
    if (!state.bodyLocked) return;
    state.bodyLocked = false;
    document.body.style.position = ""; document.body.style.top = ""; document.body.style.width = ""; document.body.style.overflow = ""; document.body.style.paddingRight = state.bodyPaddingRight;
    try { window.scrollTo?.({ top: state.scroll, left: 0, behavior: "instant" }); } catch (_) { window.scrollTo?.(0, state.scroll); }
  }

  function open(config) {
    if (state.open) close(false);
    state.active = config; state.open = true; state.focus = config.trigger; state.generation += 1;
    const selected = parseIso(config.source.value) || today(); state.date = selected; state.month = monthStart(selected);
    calendar.setAttribute("aria-label", `${config.name} 달력`); calendar.classList.toggle("calendar-mobile", mobile()); calendar.hidden = false; calendar.classList.add("is-open"); backdrop.hidden = !mobile();
    lockBody(); render();
    if (mobile()) requestAnimationFrame(() => backdrop.classList.add("is-open"));
    requestAnimationFrame(() => { if (!state.open) return; position(); });
  }
  function close(restoreFocus = true) {
    if (!state.open) return;
    const generation = ++state.generation; state.open = false; calendar.classList.remove("is-open"); backdrop.classList.remove("is-open");
    setTimeout(() => { if (generation !== state.generation) return; calendar.hidden = true; backdrop.hidden = true; calendar.classList.remove("calendar-mobile"); unlockBody(); if (restoreFocus) state.focus?.focus({ preventScroll: true }); state.active = null; }, reducedMotion() ? 0 : 180);
  }
  function choose(value) {
    if (!state.active) return;
    state.active.source.value = value; sourceLabel(state.active, value);
    state.active.source.dispatchEvent(new Event("change", { bubbles: true }));
    close(true);
  }
  function moveDate(days) {
    const date = new Date(state.date || today()); date.setDate(date.getDate() + days); state.date = date; state.month = monthStart(date); render();
  }
  function moveMonth(delta) {
    const date = new Date(state.date || today()); const day = date.getDate(); const next = new Date(date.getFullYear(), date.getMonth() + delta, 1); const max = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(); next.setDate(Math.min(day, max)); state.date = next; state.month = monthStart(next); render();
  }
  function focusables() { return [...calendar.querySelectorAll("button:not([disabled])")].filter(node => node.offsetParent !== null); }

  calendar.addEventListener("click", event => {
    const action = event.target.closest("[data-calendar-action]")?.dataset.calendarAction;
    if (action === "previous") moveMonth(-1); else if (action === "next") moveMonth(1); else if (action === "today") { state.date = today(); state.month = monthStart(state.date); render(); } else if (action === "close") close(true);
  });
  calendar.addEventListener("keydown", event => {
    if (!state.open) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); moveDate(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); moveDate(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveDate(-7); }
    else if (event.key === "ArrowDown") { event.preventDefault(); moveDate(7); }
    else if (event.key === "Home") { event.preventDefault(); const date = new Date(state.date); date.setDate(date.getDate() - date.getDay()); state.date = date; render(); }
    else if (event.key === "End") { event.preventDefault(); const date = new Date(state.date); date.setDate(date.getDate() + (6 - date.getDay())); state.date = date; render(); }
    else if (event.key === "PageUp") { event.preventDefault(); moveMonth(event.shiftKey ? -12 : -1); }
    else if (event.key === "PageDown") { event.preventDefault(); moveMonth(event.shiftKey ? 12 : 1); }
    else if (event.key === "Enter" && event.target.matches("[data-date]")) { event.preventDefault(); choose(event.target.dataset.date); }
    else if (event.key === "Escape") { event.preventDefault(); close(true); }
    else if (event.key === "Tab") { const list = focusables(); if (!list.length) return; const first = list[0], last = list[list.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  });
  backdrop.addEventListener("click", () => close(true));
  document.addEventListener("pointerdown", event => { if (!state.open || mobile() || calendar.contains(event.target) || state.active?.trigger.contains(event.target)) return; close(true); });
  window.addEventListener("resize", () => {
    if (!state.open) return;
    const isMobile = mobile();
    if (isMobile) lockBody(); else unlockBody();
    calendar.classList.toggle("calendar-mobile", isMobile);
    backdrop.hidden = !isMobile;
    backdrop.classList.toggle("is-open", isMobile);
    position();
  });

  function install(sourceId, labelId, triggerId, name) {
    const source = document.getElementById(sourceId); const label = document.getElementById(labelId); if (!source || !label) return;
    const host = source.closest(".date-box") || source.parentElement; const trigger = document.createElement("button"); trigger.type = "button"; trigger.id = triggerId; trigger.className = "calendar-trigger"; trigger.setAttribute("aria-haspopup", "dialog"); trigger.setAttribute("aria-controls", "courtCalendar"); label.classList.add("calendar-source-label");
    source.classList.add("calendar-source"); source.tabIndex = -1; source.setAttribute("aria-hidden", "true"); host.insertBefore(trigger, source); const config = { source, labelId, trigger, name }; configs.set(sourceId, config); syncSource(config);
    trigger.addEventListener("click", event => { event.preventDefault(); open(config); });
    host.addEventListener("click", event => { if (event.target === host || event.target.matches(".date-box")) { event.preventDefault(); open(config); } });
    source.addEventListener("change", () => syncSource(config));
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (descriptor) { try { Object.defineProperty(source, "value", { configurable: true, enumerable: descriptor.enumerable, get: () => descriptor.get.call(source), set: value => { descriptor.set.call(source, value); queueMicrotask(() => syncSource(config)); } }); } catch (_) {} }
  }
  function refresh() { configs.forEach(syncSource); }
  function init() {
    install("filterDate", "filterDateLabel", "filterDate-calendar-trigger", "조회 날짜"); install("alarmDate", "alarmDateLabel", "alarmDate-calendar-trigger", "알림 날짜");
    window.openCustomCalendar = sourceId => { const config = configs.get(sourceId); if (config) open(config); };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
}());
