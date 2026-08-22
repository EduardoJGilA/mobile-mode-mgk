import { DnD5eAdapter } from './adapters/dnd5e-adapter.js';
import { PF2eAdapter } from './adapters/pf2e-adapter.js';
import { VaesenAdapter } from './adapters/vaesen-adapter.js';
import { AgnosticAdapter } from './adapters/agnostic-adapter.js';
import { HpWidget } from '../ui/hp-widget.js';
import { SheetInterceptor } from './sheet-interceptor.js';
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
  static pendingRender = false;

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
      case "vaesen": return VaesenAdapter;
      default: return AgnosticAdapter;
    }
  }

  static openSheet(actor) {
    if (!actor) return;
    if (!game.user.isGM && !actor.isOwner && !actor.testUserPermission?.(game.user, "OWNER")) {
      ui.notifications?.warn(t("Sheets.NoPermission", "You do not have permission to view this character sheet."));
      return;
    }
    this.currentActor = actor;
    this.adapter = this.getAdapter();

    const tabs = this.adapter.tabs;
    if (!tabs.some(tab => tab.id === this.currentTab)) this.currentTab = tabs[0].id;

    if (!this.panel) this.panel = this.createPanel();
    this.renderNav();
    this.renderContent();
    this.panel.classList.add("open");
  }

  static get isOpen() {
    return !!this.panel?.classList.contains("open");
  }

  static minimize() {
    this.close();
  }

  static close() {
    HpWidget.close();
    // Commit whatever the caret is sitting in before the drawer goes away.
    this.saveBinding(document.activeElement);
    document.activeElement?.blur?.();
    this.pendingRender = false;
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
          <button type="button" id="mgk-minimize-sheet" class="mgk-icon-btn" aria-label="${esc(t("Sheets.Minimize", "Minimize"))}">
            <i class="fas fa-minus"></i>
          </button>
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
    panel.querySelector("#mgk-minimize-sheet").addEventListener("click", () => this.minimize());
    panel.querySelector("#mgk-sheet-hp").addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!this.currentActor || this.adapter.hasHp === false) return;
      HpWidget.open(this.currentActor, this.adapter.hpPaths);
    });

    panel.querySelector("#mgk-sheet-nav").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".mgk-nav-item");
      if (!btn) return;
      this.selectTab(btn.dataset.tab);
    });

    // One delegated listener for every action any adapter emits.
    panel.querySelector("#mgk-sheet-body").addEventListener("click", (ev) => {
      if (ev.target.closest(".mgk-slot-tracker")) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      this.onAction(ev);
    });

    // Handle generic field bindings (e.g. bio/notes textareas).
    // Inputs fire `change`; contenteditable boxes only settle on blur.
    const body = panel.querySelector("#mgk-sheet-body");
    body.addEventListener("change", (ev) => this.saveBinding(ev.target));
    body.addEventListener("focusout", (ev) => {
      this.saveBinding(ev.target);
      // `relatedTarget` is unreliable on mobile keyboards, so let focus land
      // first and only redraw once the user has left every editable field.
      setTimeout(() => {
        if (!this.pendingRender || this.isEditing()) return;
        this.pendingRender = false;
        this.renderContent();
      }, 0);
    });

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

  /** True while the caret sits in one of the tab's bound fields. */
  static isEditing() {
    return !!document.activeElement?.closest?.("#mgk-sheet-body [data-binding]");
  }

  /** Persist a bound field. Contenteditable boxes carry HTML, inputs a value. */
  static async saveBinding(target) {
    const input = target?.closest?.("#mgk-sheet-body [data-binding]");
    if (!input || !this.currentActor) return;

    const path = input.dataset.binding;
    const value = input.dataset.bindingHtml ? input.innerHTML : input.value;
    const current = foundry.utils.getProperty(this.currentActor, path) ?? "";

    // Skip no-op writes: each update re-renders the tab.
    if (String(current) === value) return;
    await this.currentActor.update({ [path]: value });
  }

  static renderContent() {
    if (!this.panel || !this.currentActor) return;

    // Never redraw under an open keyboard — it would drop what is being typed.
    if (this.isEditing()) {
      this.pendingRender = true;
      return;
    }

    const data = this.adapter.getCharacterData(this.currentActor);

    this.panel.querySelector("#mgk-sheet-name").textContent = data.name;
    this.panel.querySelector("#mgk-sheet-sub").textContent = data.subtitle ?? "";
    this.panel.querySelector("#mgk-sheet-avatar").src = data.img ?? "";

    const hp = data.hp ?? { value: 0, max: 0 };
    const hpBtn = this.panel.querySelector("#mgk-sheet-hp");
    const hasHp = this.adapter.hasHp ?? true;
    hpBtn.hidden = !hasHp;
    hpBtn.innerHTML = hasHp
      ? `<span class="mgk-hp-value">${esc(hp.value ?? 0)}</span> / ${esc(hp.max ?? 0)} <i class="fas fa-heart"></i>`
      : "";

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
        this.minimize();
        if (typeof this.adapter?.useItem === "function") {
          await this.adapter.useItem(item, actor, ev);
        } else if (typeof item.use === "function") {
          await item.use({ consumeSpellSlot: true }, { configure: true, event: ev });
        } else if (typeof item.toChat === "function") {
          await item.toChat();
        } else {
          await item.sheet?.render(true);
        }
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
        this.minimize();
        item?.sheet?.render(true);
        break;

      case "roll-ability":
        this.minimize();
        await this.adapter.rollAbility(actor, ability, ev);
        break;

      case "roll-save":
        this.minimize();
        await this.adapter.rollSave(actor, ability, ev);
        break;

      case "roll-skill":
        this.minimize();
        await this.adapter.rollSkill(actor, skill, ev);
        break;

      case "roll-initiative":
        this.minimize();
        if (typeof this.adapter?.rollInitiative === "function") {
          await this.adapter.rollInitiative(actor, ev);
        } else if (typeof actor.rollInitiativeDialog === "function") {
          await actor.rollInitiativeDialog({ event: ev });
        } else if (typeof actor.rollInitiative === "function") {
          await actor.rollInitiative({ createCombatants: true, rerollInitiative: true, event: ev });
        }
        break;

      case "roll-hit-die":
        this.minimize();
        if (typeof this.adapter?.rollHitDie === "function") {
          await this.adapter.rollHitDie(actor, ev);
        } else if (typeof actor.rollHitDie === "function") {
          await actor.rollHitDie({ event: ev });
        } else if (typeof actor.rollHitDice === "function") {
          await actor.rollHitDice({ event: ev });
        }
        break;

      case "roll-perception":
        this.minimize();
        if (typeof actor.perception?.roll === "function") {
          await actor.perception.roll({ event: ev });
        } else if (typeof this.adapter?.rollPerception === "function") {
          await this.adapter.rollPerception(actor, ev);
        } else {
          await this.adapter?.rollSkill?.(actor, "prc", ev);
        }
        break;

      case "toggle-status":
        await actor.toggleStatusEffect?.(status);
        break;

      case "rest-short":
        this.minimize();
        await this.adapter.rest(actor, "short");
        break;

      case "rest-long":
        this.minimize();
        await this.adapter.rest(actor, "long");
        break;

      case "open-native":
        this.close();
        await SheetInterceptor.openNative(actor);
        break;

      default:
        // Anything else belongs to the active system adapter.
        await this.adapter.onCustomAction?.(action, trigger.dataset, actor, ev);
        break;
    }
  }

  static async enrich(item) {
    const raw = item.system?.description?.value ?? item.system?.description ?? "";
    const TextEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const bodyHtml = raw ? await TextEditor.enrichHTML(raw, { relativeTo: item, rollData: item.getRollData?.() ?? {} })
      : `<em>${esc(t("Sheets.NoDescription", "No description."))}</em>`;

    const actions = `
      <div class="mgk-detail-actions">
        <button type="button" class="mgk-detail-btn" data-action="use-item" data-item-id="${esc(item.id)}">
          <i class="fas fa-dice-d20"></i> ${esc(t("Sheets.UseItem", "Cast / Use"))}
        </button>
        <button type="button" class="mgk-detail-btn" data-action="open-item" data-item-id="${esc(item.id)}">
          <i class="fas fa-edit"></i> ${esc(t("Sheets.EditItem", "Edit"))}
        </button>
      </div>
    `;

    return `${bodyHtml}${actions}`;
  }

  /* -------------------------------------------- */
  /*  Gestures                                    */
  /* -------------------------------------------- */

  /**
   * Swipe handling is deliberately narrow.
   *
   * Listening on the whole panel meant an ordinary scroll through a long
   * inventory registered as a swipe, so the sheet changed tab or closed while
   * the player was only trying to read. Horizontal tab changes now require a
   * clearly horizontal gesture that does not start on a control, and closing
   * is only possible from the header and grab handle.
   */
  static attachSwipe(panel) {
    const body = panel.querySelector("#mgk-sheet-body");

    // Pull down to close, from the header area only.
    const header = panel.querySelector(".mgk-sheet-header");
    const grab = panel.querySelector(".mgk-drawer-grab");
    let headerStartY = 0;

    for (const region of [header, grab]) {
      region.addEventListener("touchstart", (ev) => {
        headerStartY = ev.touches[0]?.clientY ?? 0;
      }, { passive: true });

      region.addEventListener("touchend", (ev) => {
        const dy = (ev.changedTouches[0]?.clientY ?? 0) - headerStartY;
        if (dy > SWIPE_CLOSE_PX) this.close();
      }, { passive: true });
    }

    // Horizontal tab change, from the scrollable body.
    let startX = 0;
    let startY = 0;
    let tracking = false;

    body.addEventListener("touchstart", (ev) => {
      tracking = ev.touches.length === 1
        && !ev.target.closest("button, input, textarea, a, [contenteditable], .mgk-row-detail");
      if (!tracking) return;
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
    }, { passive: true });

    body.addEventListener("touchend", (ev) => {
      if (!tracking || ev.changedTouches.length !== 1) return;
      tracking = false;

      const dx = ev.changedTouches[0].clientX - startX;
      const dy = ev.changedTouches[0].clientY - startY;

      // Must be decisively horizontal, or it was a scroll.
      if (Math.abs(dx) < SWIPE_TAB_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.5) return;

      this.cycleTab(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
}
