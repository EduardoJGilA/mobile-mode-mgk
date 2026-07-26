import { esc, t } from '../../core/utils.js';
import { section, itemRow, empty } from '../components.js';

/**
 * System Agnostic Adapter.
 *
 * Used for any system without a dedicated adapter. It makes no assumptions
 * beyond "actors have items and probably some kind of hit points", and groups
 * items by their declared type so the sheet stays useful anywhere.
 */
export class AgnosticAdapter {
  static tabs = [
    { id: "Items", label: "Items" },
    { id: "Effects", label: "Effects" },
    { id: "Other", label: "Other" }
  ];

  static get hpPaths() {
    return {
      value: this._hpRoot ? `${this._hpRoot}.value` : "system.attributes.hp.value",
      max: this._hpRoot ? `${this._hpRoot}.max` : "system.attributes.hp.max",
      temp: this._hpRoot ? `${this._hpRoot}.temp` : null,
      tempmax: null
    };
  }

  /** Probe the two layouts nearly every system uses for hit points. */
  static resolveHp(actor) {
    const candidates = ["system.attributes.hp", "system.hp", "system.health"];
    for (const path of candidates) {
      const hp = foundry.utils.getProperty(actor, path);
      if (hp && (hp.max !== undefined || hp.value !== undefined)) {
        this._hpRoot = path;
        return hp;
      }
    }
    this._hpRoot = null;
    return { value: 0, max: 0 };
  }

  static getCharacterData(actor) {
    return {
      actor,
      name: actor.name,
      img: actor.img,
      subtitle: game.i18n.localize(CONFIG.Actor?.typeLabels?.[actor.type] ?? actor.type),
      hp: this.resolveHp(actor),
      items: actor.items.contents,
      effects: Array.from(actor.effects ?? [])
    };
  }

  static renderTab(tabId, data) {
    const fn = this[`render${tabId}`];
    if (typeof fn !== "function") return empty();
    return fn.call(this, data);
  }

  static renderItems(data) {
    if (!data.items.length) return `<div class="mgk-tab">${empty(t("Sheets.NoItems", "No items."))}</div>`;

    const groups = {};
    for (const item of data.items) (groups[item.type] ??= []).push(item);

    const sections = Object.entries(groups).map(([type, items]) => {
      const label = CONFIG.Item?.typeLabels?.[type] ?? type;
      const rows = items.map(i => itemRow({
        id: i.id, img: i.img, name: i.name,
        action: typeof i.use === "function" ? "use-item" : "open-item"
      })).join("");
      return section(game.i18n.localize(label), rows, { count: items.length });
    }).join("");

    return `<div class="mgk-tab">${sections}</div>`;
  }

  static renderEffects(data) {
    const active = data.actor.statuses ?? new Set();
    const grid = (CONFIG.statusEffects ?? []).map(se => `
      <button type="button" class="mgk-status${active.has(se.id) ? " active" : ""}"
              data-action="toggle-status" data-status="${esc(se.id)}">
        <img src="${esc(se.img ?? se.icon)}" alt="" loading="lazy">
        <span>${esc(game.i18n.localize(se.name ?? se.label ?? se.id))}</span>
      </button>
    `).join("");

    return `
      <div class="mgk-tab">
        ${section(t("Sheets.Conditions", "Conditions"), `<div class="mgk-status-grid">${grid}</div>`)}
      </div>
    `;
  }

  static renderOther() {
    return `
      <div class="mgk-tab">
        <button type="button" class="mgk-big-btn wide" data-action="open-native">
          <i class="fas fa-up-right-from-square"></i> ${esc(t("Sheets.OpenNative", "Open full sheet"))}
        </button>
      </div>
    `;
  }

  static async rollAbility() {}
  static async rollSave() {}
  static async rollSkill() {}
  static async rest() {}
}
