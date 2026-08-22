import { DeviceDetector } from '../core/device-detector.js';

/**
 * Transforms Foundry's desktop-heavy SettingsConfig dialog into a full-screen,
 * single-column, thumb-friendly mobile configuration panel.
 */
export class SettingsInterceptor {
  static init() {
    Hooks.on("renderSettingsConfig", (app, html) => this.enhanceSettings(app, html));
    Hooks.on("closeSettingsConfig", () => {
      document.body.classList.remove("mgk-settings-open");
    });

    // Catch submenus opened by modules (registerMenu)
    Hooks.on("renderFormApplication", (app, html) => {
      const classes = app.options?.classes || [];
      if (classes.some(c => /settings|config/i.test(c))) {
        this.enhanceSettings(app, html);
      }
    });

    Hooks.on("closeFormApplication", (app) => {
      const classes = app.options?.classes || [];
      if (classes.some(c => /settings|config/i.test(c))) {
        if (!document.querySelector(".settings-config:not([style*='display: none'])")) {
          document.body.classList.remove("mgk-settings-open");
        }
      }
    });
  }

  static enhanceSettings(app, html) {
    if (!DeviceDetector.isMobileMode()) return;

    const el = html instanceof HTMLElement ? html : html?.[0];
    if (!el) return;

    document.body.classList.add("mgk-settings-open");
    el.classList.add("mgk-mobile-settings");

    const form = el.tagName === "FORM" ? el : el.querySelector("form");
    if (form) form.classList.add("mgk-mobile-settings-form");

    // Add mobile close header button if not present
    this.ensureMobileHeader(app, el);

    // Transform checkboxes into touch switches
    this.enhanceCheckboxes(el);

    // Enhance sliders with live numeric badges
    this.enhanceRangeSliders(el);

    // Make category navigation smooth
    this.enhanceCategories(el);

    // Observe changes inside the settings list when categories change
    this.observeSettingsChanges(el);
  }

  static ensureMobileHeader(app, el) {
    const header = el.querySelector(".window-header");
    if (header) {
      header.classList.add("mgk-settings-header");
    }
  }

  static enhanceCheckboxes(el) {
    const checkboxes = el.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      const parent = cb.closest(".form-group") || cb.parentElement;
      if (parent && !parent.classList.contains("mgk-switch-enhanced")) {
        parent.classList.add("mgk-switch-enhanced");
      }
    });
  }

  static enhanceRangeSliders(el) {
    const ranges = el.querySelectorAll('input[type="range"]');
    ranges.forEach((range) => {
      const parent = range.parentElement;
      if (!parent || parent.querySelector(".mgk-range-badge")) return;

      const badge = document.createElement("span");
      badge.className = "mgk-range-badge";
      badge.textContent = range.value;

      range.addEventListener("input", () => {
        badge.textContent = range.value;
      });

      range.insertAdjacentElement("afterend", badge);
    });
  }

  static enhanceCategories(el) {
    const categoryItems = el.querySelectorAll(".categories .category, .categories li, .categories a, nav.sheet-tabs .item, nav.tabs .item");
    categoryItems.forEach((item) => {
      item.addEventListener("click", () => {
        item.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        setTimeout(() => {
          this.enhanceCheckboxes(el);
          this.enhanceRangeSliders(el);
        }, 80);
      });
    });
  }

  static observeSettingsChanges(el) {
    const list = el.querySelector(".settings-list, .scrollable, section.content, .sheet-body");
    if (!list || list.dataset.mgkObserved || typeof globalThis.MutationObserver !== "function") return;

    list.dataset.mgkObserved = "1";
    const observer = new globalThis.MutationObserver(() => {
      this.enhanceCheckboxes(el);
      this.enhanceRangeSliders(el);
    });

    observer.observe(list, { childList: true, subtree: true });
  }
}
