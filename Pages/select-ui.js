/* Accessible single-select presentation for the standalone court page.
 * The original select remains the source of truth: its id, value and change event
 * contract are preserved for index.html and ios-court.js. */
(function () {
  "use strict";

  const DEFAULT_IDS = ["filterGu", "filterTimeHour", "alarmCourt", "alarmTimeHour"];
  const LABELS = {
    filterGu: "구",
    filterTimeHour: "조회 시간",
    alarmCourt: "알림 코트",
    alarmTimeHour: "알람 시간"
  };
  const valueDescriptor = typeof HTMLSelectElement !== "undefined"
    ? Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")
    : null;
  const registry = new Map();
  let openController = null;
  let backdrop = null;
  let closeTimer = null;
  let layerGeneration = 0;
  let bodyLock = null;

  function sourceLabel(select) {
    return select.getAttribute("aria-label") || LABELS[select.id] || "선택";
  }

  function visibleOptions(select) {
    return [...select.options].filter(option => !option.hidden);
  }

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "ios-select-backdrop";
    backdrop.tabIndex = -1;
    backdrop.setAttribute("aria-label", "선택 목록 닫기");
    backdrop.hidden = true;
    backdrop.addEventListener("pointerdown", () => openController?.close(true));
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function focusWithoutScroll(element) {
    try { element?.focus?.({ preventScroll: true }); } catch (_) { element?.focus?.(); }
  }

  function lockBody() {
    if (bodyLock) return;
    bodyLock = { scroll: window.scrollY, paddingRight: document.body.style.paddingRight };
    document.body.style.position = "fixed";
    document.body.style.top = `-${bodyLock.scroll}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
  }

  function unlockBody() {
    if (!bodyLock) return;
    const previous = bodyLock;
    bodyLock = null;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    document.body.style.paddingRight = previous.paddingRight;
    try { window.scrollTo?.({ top: previous.scroll, left: 0, behavior: "instant" }); } catch (_) { window.scrollTo?.(0, previous.scroll); }
  }

  function createController(select) {
    if (!select || select.multiple || registry.has(select.id)) return registry.get(select.id);
    const host = select.closest(".select, .time-control, .favorite-picker") || select.parentElement;
    if (!host) return null;

    const trigger = document.createElement("button");
    const listbox = document.createElement("div");
    const listboxId = select.id + "-ios-listbox";
    const label = sourceLabel(select);
    trigger.type = "button";
    trigger.className = "ios-select-trigger";
    trigger.id = select.id + "-ios-trigger";
    trigger.setAttribute("aria-label", label);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-controls", listboxId);
    trigger.setAttribute("aria-expanded", "false");

    listbox.id = listboxId;
    listbox.className = "ios-select-popover";
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("aria-label", label);
    listbox.hidden = true;

    select.classList.add("ios-select-source");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    host.insertBefore(trigger, select.nextSibling);
    document.body.appendChild(listbox);

    const controller = {
      select,
      trigger,
      listbox,
      centered: select.id === "filterGu" || select.id === "alarmCourt",
      options: [],
      activeIndex: 0,
      opened: false,
      observer: null,
      restoreValueDescriptor: false,

      sync() {
        const options = visibleOptions(select);
        const selectedIndex = Math.max(0, options.findIndex(option => option.value === select.value));
        this.activeIndex = Math.min(selectedIndex, Math.max(0, options.length - 1));
        const selected = options[selectedIndex] || options[0];
        trigger.replaceChildren(document.createTextNode(selected?.textContent?.trim() || "선택"));
        trigger.setAttribute("aria-label", label + ": " + (selected?.textContent?.trim() || "선택"));
        listbox.replaceChildren();
        this.options = options.map((option, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "ios-select-option";
          button.id = listboxId + "-option-" + index;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(option.value === select.value));
          button.setAttribute("aria-disabled", String(option.disabled));
          button.tabIndex = -1;
          button.dataset.value = option.value;
          button.textContent = option.textContent?.trim() || "선택";
          if (option.disabled) button.disabled = true;
          button.addEventListener("click", () => {
            if (!option.disabled) this.choose(index);
          });
          listbox.appendChild(button);
          return button;
        });
        if (this.opened) {
          this.position();
          this.focusActive();
        }
      },

      position() {
        if (!this.opened || listbox.hidden) return;
        if (this.centered) {
          listbox.classList.add("is-modal");
          listbox.classList.remove("is-sheet");
          listbox.style.removeProperty("top");
          listbox.style.removeProperty("left");
          return;
        }
        const mobile = window.matchMedia?.("(max-width: 720px)")?.matches;
        listbox.classList.toggle("is-sheet", Boolean(mobile));
        if (mobile) {
          listbox.style.removeProperty("top");
          listbox.style.removeProperty("left");
          return;
        }
        const rect = trigger.getBoundingClientRect();
        const height = listbox.offsetHeight;
        const gap = 6;
        let top = rect.bottom + gap;
        if (top + height > window.innerHeight - 8 && rect.top - height - gap > 8) top = rect.top - height - gap;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - listbox.offsetWidth - 8));
        listbox.style.top = String(Math.round(top)) + "px";
        listbox.style.left = String(Math.round(left)) + "px";
      },

      focusActive() {
        const option = this.options[this.activeIndex] || this.options.find(item => !item.disabled);
        focusWithoutScroll(option);
      },

      open() {
        if (!this.options.length) return;
        if (openController && openController !== this) openController.close(false);
        openController = this;
        clearTimeout(closeTimer);
        layerGeneration += 1;
        this.opened = true;
        trigger.setAttribute("aria-expanded", "true");
        const layer = ensureBackdrop();
        layer.hidden = false;
        layer.classList.add("is-open");
        listbox.hidden = false;
        if (this.centered) lockBody();
        this.position();
        requestAnimationFrame(() => { if (!this.opened) return; if (this.centered) listbox.classList.add("is-open"); this.position(); this.focusActive(); });
      },

      close(restoreFocus) {
        if (!this.opened) return;
        this.opened = false;
        trigger.setAttribute("aria-expanded", "false");
        const generation = ++layerGeneration;
        listbox.classList.remove("is-open");
        if (backdrop) backdrop.classList.remove("is-open");
        listbox.style.removeProperty("top");
        listbox.style.removeProperty("left");
        if (openController === this) openController = null;
        if (!restoreFocus) {
          listbox.hidden = true;
          listbox.classList.remove("is-modal", "is-sheet");
          if (backdrop) backdrop.hidden = true;
          if (this.centered) unlockBody();
          return;
        }
        if (!this.centered) {
          listbox.hidden = true;
          listbox.classList.remove("is-modal", "is-sheet");
          if (backdrop) backdrop.hidden = true;
          focusWithoutScroll(trigger);
          return;
        }
        clearTimeout(closeTimer);
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        closeTimer = setTimeout(() => {
          if (generation !== layerGeneration || this.opened) return;
          listbox.hidden = true;
          listbox.classList.remove("is-modal");
          if (backdrop) backdrop.hidden = true;
          unlockBody();
          if (restoreFocus) focusWithoutScroll(trigger);
        }, reduce ? 0 : 180);
      },

      choose(index) {
        const option = this.options[index];
        if (!option || option.disabled) return;
        select.value = option.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        this.sync();
        this.close(true);
      },

      move(delta) {
        if (!this.options.length) return;
        let index = this.activeIndex;
        for (let count = 0; count < this.options.length; count += 1) {
          index = (index + delta + this.options.length) % this.options.length;
          if (!this.options[index]?.disabled) break;
        }
        this.activeIndex = index;
        this.focusActive();
      }
    };

    trigger.addEventListener("click", () => {
      if (controller.opened) controller.close(true);
      else controller.open();
    });
    trigger.addEventListener("keydown", event => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (controller.opened) controller.move(event.key === "ArrowUp" ? -1 : 1);
        else controller.open();
      } else if (event.key === "Escape" && controller.opened) {
        event.preventDefault();
        controller.close(true);
      }
    });
    listbox.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") { event.preventDefault(); controller.move(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); controller.move(-1); }
      else if (event.key === "Home") { event.preventDefault(); controller.activeIndex = 0; controller.focusActive(); }
      else if (event.key === "End") { event.preventDefault(); controller.activeIndex = Math.max(0, controller.options.length - 1); controller.focusActive(); }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); controller.choose(controller.activeIndex); }
      else if (event.key === "Escape") { event.preventDefault(); controller.close(true); }
      else if (event.key === "Tab") { controller.close(true); event.preventDefault(); }
    });

    if (valueDescriptor) {
      try {
        Object.defineProperty(select, "value", {
          configurable: true,
          enumerable: valueDescriptor.enumerable,
          get: () => valueDescriptor.get.call(select),
          set: value => {
            valueDescriptor.set.call(select, value);
            queueMicrotask(() => controller.sync());
          }
        });
        controller.restoreValueDescriptor = true;
      } catch (_) {}
    }

    select.addEventListener("change", () => controller.sync());
    controller.observer = new MutationObserver(() => controller.sync());
    controller.observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["label", "value", "disabled", "hidden", "selected"] });
    controller.sync();
    registry.set(select.id, controller);
    return controller;
  }

  function refresh(target) {
    const select = typeof target === "string" ? document.getElementById(target) : target;
    if (select) {
      const controller = registry.get(select.id) || createController(select);
      controller?.sync();
      return controller;
    }
    registry.forEach(controller => controller.sync());
    return [...registry.values()];
  }

  function init(root = document) {
    DEFAULT_IDS.forEach(id => createController(root.getElementById ? root.getElementById(id) : document.getElementById(id)));
    return refresh();
  }

  function destroy() {
    registry.forEach(controller => {
      controller.close(false);
      controller.observer?.disconnect();
      if (controller.restoreValueDescriptor) {
        try { delete controller.select.value; } catch (_) {}
      }
      controller.trigger.remove();
      controller.listbox.remove();
      controller.select.classList.remove("ios-select-source");
      controller.select.removeAttribute("aria-hidden");
      controller.select.tabIndex = 0;
    });
    registry.clear();
    unlockBody();
    backdrop?.remove();
    backdrop = null;
  }

  window.IosSelectUI = { init, refresh, refreshAll: refresh, destroy };
  window.refreshIosSelects = refresh;
  window.addEventListener("resize", () => openController?.position(), { passive: true });
  window.addEventListener("scroll", () => openController?.position(), { passive: true, capture: true });

  function start() {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init(), { once: true });
    else init();
  }
  start();
}());
