import { DeviceDetector } from '../core/device-detector.js';

/**
 * Transforms Foundry's desktop-heavy SettingsConfig dialog into a full-screen,
 * thumb-friendly mobile configuration panel.
 */
export class SettingsInterceptor {
  static init() {
    Hooks.on("renderSettingsConfig", (app, html) => this.enhanceSettings(app, html));
    // Catch submenus opened by modules (registerMenu)
    Hooks.on("renderFormApplication", (app, html) => {
      const classes = app.options?.classes || [];
      if (classes.some(c => /settings|config/i.test(c))) {
        this.enhanceSettings(app, html);
      }
    });
  }

  static enhanceSettings(app, html) {
    if (!DeviceDetector.isMobileMode()) return;

    const el = html instanceof HTMLElement ? html : html?.[0];
    if (!el) return;

    el.classList.add("mgk-mobile-settings");

    // Add mobile close header button if not present
    this.ensureMobileHeader(app, el);

    // Transform checkboxes into touch switches
    this.enhanceCheckboxes(el);

    // Enhance sliders with live numeric badges
    this.enhanceRangeSliders(el);

    // Scroll tabs smoothly to active item
    this.enhanceTabs(el);
  }

  static ensureMobileHeader(app, el) {
    if (el.querySelector(".mgk-settings-header")) return;

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

  static enhanceTabs(el) {
    const tabs = el.querySelectorAll("nav.sheet-tabs .item, nav.tabs .item");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      });
    });
  }
}
