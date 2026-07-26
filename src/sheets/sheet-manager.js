import { DnD5eAdapter } from './adapters/dnd5e-adapter.js';
import { PF2eAdapter } from './adapters/pf2e-adapter.js';
import { AgnosticAdapter } from './adapters/agnostic-adapter.js';
import { HpWidget } from '../ui/hp-widget.js';
import { esc, t } from '../core/utils.js';

const SWIPE_CLOSE_PX = 90;
const SWIPE_TAB_PX = 70;

/**
 * Full-screen mobile character sheet drawer.
 *
 * The drawer owns navigation, gestures and event delegation; the per-system
 * adapters only produce markup and declare which tabs exist.
 */
export class SheetManager {
  static currentActor = null;
  static currentTab = null;
  static panel = null;
  static adapter = null;

  static init() {
    Hooks.on("mobileModeOpenSheet", (actor) => this.openSheet(actor));
    Hooks.on("mobileModeCloseSheet", () => this.close());

    // Keep an open sheet in sync with the underlying documents.
    Hooks.on("updateActor", (actor) => {
      if (actor.id === this.currentActor?.id) this.renderContent();
    });
    for (const hook of ["createItem", "updateItem", "deleteItem"]) {
      Hooks.on(hook, (item) => {
        if (item.parent?.id === this.currentActor?.id) this.renderContent();
      });
    }
  }

  static getAdapter() {
    switch (game.system.id) {
      case "dnd5e": return DnD5eAdapter;
      case "pf2e": return PF2eAdapter;
      default: return AgnosticAdapter;
    }
  }

  static openSheet(actor) {
    if (!actor) return;
    this.currentActor = actor;
    this.adapter = this.getAdapter();

    const tabs = this.adapter.tabs;
    if (!tabs.some(tab => tab.id === this.currentTab)) this.currentTab = tabs[0].id;

    if (!this.panel) this.panel = this.createPanel();
    this.renderNav();
    this.renderContent();
    this.panel.classList.add("open");
  }

  static close() {
    HpWidget.close();
    this.panel?.classList.remove("open");
  }

  /* -------------------------------------------- */
  /*  Chrome                                      */
  /* -------------------------------------------- */

  static createPanel() {
    const panel = document.createElement("div");
    panel.id = "mgk-sheet-drawer";
    panel.className = "mgk-sheet-drawer";

    panel.innerHTML = `
      <div class="mgk-drawer-grab"></div>
      <div class="mgk-sheet-header">
        <div class="mgk-header-left">
          <img id="mgk-sheet-avatar" class="mgk-header-avatar" src="" alt="">
          <div>
            <h3 id="mgk-sheet-name" class="mgk-header-name"></h3>
            <div id="mgk-sheet-sub" class="mgk-header-sub"></div>
          </div>
        </div>
        <div class="mgk-header-right">
          <button type="button" id="mgk-sheet-hp" class="mgk-header-hp"></button>
          <button type="button" id="mgk-close-sheet" class="mgk-icon-btn" aria-label="${esc(t("Sheets.Close", "Close"))}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <nav class="mgk-sheet-nav" id="mgk-sheet-nav"></nav>
      <div id="mgk-sheet-body" class="mgk-sheet-body"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#mgk-close-sheet").addEventListener("click", () => this.close());
    panel.querySelector("#mgk-sheet-hp").addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (this.currentActor) HpWidget.open(this.currentActor, this.adapter.hpPaths);
    });

    panel.querySelector("#mgk-sheet-nav").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".mgk-nav-item");
      if (!btn) return;
      this.selectTab(btn.dataset.tab);
    });

    // One delegated listener for every action any adapter emits.
    panel.querySelector("#mgk-sheet-body").addEventListener("click", (ev) => this.onAction(ev));

    this.attachSwipe(panel);
    return panel;
  }

  static renderNav() {
    const nav = this.panel.querySelector("#mgk-sheet-nav");
    nav.innerHTML = this.adapter.tabs.map(tab => `
      <button type="button" class="mgk-nav-item${tab.id === this.currentTab ? " active" : ""}" data-tab="${esc(tab.id)}">
        ${esc(t(`Sheets.${tab.id}`, tab.label))}
      </button>
    `).join("");
  }

  static selectTab(tabId) {
    if (!tabId || tabId === this.currentTab) return;
    this.currentTab = tabId;
    this.renderNav();
    this.renderContent();
    this.panel.querySelector(`.mgk-nav-item[data-tab="${CSS.escape(tabId)}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  static cycleTab(direction) {
    const tabs = this.adapter.tabs;
    const idx = tabs.findIndex(tab => tab.id === this.currentTab);
    const next = tabs[idx + direction];
    if (next) this.selectTab(next.id);
  }

  static renderContent() {
    if (!this.panel || !this.currentActor) return;
    const data = this.adapter.getCharacterData(this.currentActor);

    this.panel.querySelector("#mgk-sheet-name").textContent = data.name;
    this.panel.querySelector("#mgk-sheet-sub").textContent = data.subtitle ?? "";
    this.panel.querySelector("#mgk-sheet-avatar").src = data.img ?? "";

    const hp = data.hp ?? { value: 0, max: 0 };
    const hpBtn = this.panel.querySelector("#mgk-sheet-hp");
    hpBtn.innerHTML = `<span class="mgk-hp-value">${esc(hp.value ?? 0)}</span> / ${esc(hp.max ?? 0)} <i class="fas fa-heart"></i>`;

    const body = this.panel.querySelector("#mgk-sheet-body");
    const scroll = body.scrollTop;
    body.innerHTML = this.adapter.renderTab(this.currentTab, data);
    body.scrollTop = scroll;
  }

  /* -------------------------------------------- */
  /*  Delegated actions                           */
  /* -------------------------------------------- */

  static async onAction(ev) {
    const trigger = ev.target.closest("[data-action]");
    if (!trigger) return;
    const actor = this.currentActor;
    if (!actor) return;

    const { action, itemId, ability, skill, status } = trigger.dataset;
    const item = itemId ? actor.items.get(itemId) : null;

    switch (action) {
      case "use-item":
        ev.stopPropagation();
        if (!item) return;
        if (typeof item.use === "function") await item.use({}, { event: ev });
        else if (typeof item.toChat === "function") await item.toChat();
        else await item.sheet?.render(true);
        break;

      case "expand": {
        const row = trigger.closest(".mgk-row");
        row?.classList.toggle("expanded");
        const detail = row?.querySelector(".mgk-row-detail");
        if (detail && !detail.dataset.loaded && item) {
          detail.dataset.loaded = "1";
          detail.innerHTML = await this.enrich(item);
        }
        break;
      }

      case "open-item":
        ev.stopPropagation();
        item?.sheet?.render(true);
        break;

      case "roll-ability":
        await this.adapter.rollAbility(actor, ability, ev);
        break;

      case "roll-save":
        await this.adapter.rollSave(actor, ability, ev);
        break;

      case "roll-skill":
        await this.adapter.rollSkill(actor, skill, ev);
        break;

      case "toggle-status":
        await actor.toggleStatusEffect?.(status);
        break;

      case "rest-short":
        await this.adapter.rest(actor, "short");
        break;

      case "rest-long":
        await this.adapter.rest(actor, "long");
        break;

      case "open-native":
        this.close();
        actor.sheet?.render(true);
        break;

      default:
        // Anything else belongs to the active system adapter.
        await this.adapter.onCustomAction?.(action, trigger.dataset, actor, ev);
        break;
    }
  }

  static async enrich(item) {
    const raw = item.system?.description?.value ?? item.system?.description ?? "";
    if (!raw) return `<em>${esc(t("Sheets.NoDescription", "No description."))}</em>`;
    const TextEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    return TextEditor.enrichHTML(raw, { relativeTo: item, rollData: item.getRollData?.() ?? {} });
  }

  /* -------------------------------------------- */
  /*  Gestures                                    */
  /* -------------------------------------------- */

  static attachSwipe(panel) {
    const body = panel.querySelector("#mgk-sheet-body");
    let startX = 0;
    let startY = 0;
    let atTop = true;
    let tracking = false;

    panel.addEventListener("touchstart", (ev) => {
      if (ev.touches.length !== 1) return (tracking = false);
      tracking = true;
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      atTop = body.scrollTop <= 0;
    }, { passive: true });

    panel.addEventListener("touchend", (ev) => {
      if (!tracking || ev.changedTouches.length !== 1) return;
      tracking = false;

      const dx = ev.changedTouches[0].clientX - startX;
      const dy = ev.changedTouches[0].clientY - startY;

      // Vertical wins only when pulling down from an already-scrolled-to-top body.
      if (atTop && dy > SWIPE_CLOSE_PX && Math.abs(dy) > Math.abs(dx)) return this.close();
      if (Math.abs(dx) > SWIPE_TAB_PX && Math.abs(dx) > Math.abs(dy)) this.cycleTab(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
}
