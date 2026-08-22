import { esc, t, signed } from '../../core/utils.js';
import { section, itemRow, statBox, empty } from '../components.js';

const SAVES = ["fortitude", "reflex", "will"];

/**
 * Pathfinder 2e adapter.
 *
 * PF2e exposes most rollables as Statistic objects on the actor rather than
 * raw numbers in `system`, so this adapter reads from those where possible and
 * falls back to `system` only for display-only values.
 */
export class PF2eAdapter {
  static tabs = [
    { id: "Abilities", label: "Abilities" },
    { id: "Combat", label: "Combat" },
    { id: "Inventory", label: "Inventory" },
    { id: "Features", label: "Feats" },
    { id: "Spells", label: "Spells" },
    { id: "Effects", label: "Effects" },
    { id: "Other", label: "Other" }
  ];

  static hpPaths = {
    value: "system.attributes.hp.value",
    max: "system.attributes.hp.max",
    temp: "system.attributes.hp.temp",
    tempmax: null
  };

  static getCharacterData(actor) {
    const system = actor.system;
    const classItem = actor.itemTypes?.class?.[0];
    const ancestry = actor.itemTypes?.ancestry?.[0];

    return {
      actor,
      name: actor.name,
      img: actor.img,
      subtitle: [
        classItem ? `${classItem.name} ${system.details?.level?.value ?? ""}`.trim() : "",
        ancestry?.name
      ].filter(Boolean).join(" · "),
      hp: system.attributes?.hp ?? { value: 0, max: 0 },
      ac: system.attributes?.ac?.value ?? 10,
      speed: system.attributes?.speed?.value ?? 0,
      perception: actor.perception?.mod ?? system.attributes?.perception?.value ?? 0,
      level: system.details?.level?.value ?? 1,
      abilities: system.abilities ?? {},
      skills: actor.skills ?? {},
      saves: actor.saves ?? {},
      strikes: (system.actions ?? []).filter(a => a.type === "strike"),
      spellcasting: Array.from(actor.spellcasting ?? []),
      inventory: Array.from(actor.inventory ?? []),
      coins: actor.inventory?.coins ?? {},
      feats: actor.itemTypes?.feat ?? [],
      actions: actor.itemTypes?.action ?? [],
      effects: Array.from(actor.itemTypes?.effect ?? []),
      conditions: Array.from(actor.itemTypes?.condition ?? [])
    };
  }

  static renderTab(tabId, data) {
    const fn = this[`render${tabId}`];
    if (typeof fn !== "function") return empty();
    return fn.call(this, data);
  }

  static renderAbilities(data) {
    const abilityCards = Object.entries(data.abilities).map(([key, ab]) => `
      <div class="mgk-ability-card">
        <div class="mgk-ability-label">${esc(key.toUpperCase())}</div>
        <div class="mgk-ability-score">${esc(signed(ab.mod ?? 0))}</div>
      </div>
    `).join("");

    const saveRows = SAVES.map(key => {
      const save = data.saves[key];
      if (!save) return "";
      return `
        <button type="button" class="mgk-skill-row" data-action="roll-save" data-ability="${esc(key)}">
          <span class="mgk-skill-name">${esc(save.label ?? key)}</span>
          <span class="mgk-skill-total">${esc(signed(save.mod ?? 0))}</span>
        </button>
      `;
    }).join("");

    const skillRows = Object.entries(data.skills).map(([key, sk]) => `
      <button type="button" class="mgk-skill-row" data-action="roll-skill" data-skill="${esc(key)}">
        <span class="mgk-skill-name">${esc(sk.label ?? key)}</span>
        <span class="mgk-skill-total">${esc(signed(sk.mod ?? 0))}</span>
      </button>
    `).join("");

    return `
      <div class="mgk-tab">
        <div class="mgk-stat-grid">
          ${statBox(t("Sheets.AC", "AC"), data.ac)}
          ${statBox(t("Sheets.Speed", "SPEED"), data.speed)}
          ${statBox(t("Sheets.Perception", "PERCEPTION"), signed(data.perception), { action: "roll-perception" })}
          ${statBox(t("Sheets.Level", "LEVEL"), data.level)}
        </div>
        <div class="mgk-ability-grid">${abilityCards}</div>
        ${section(t("Sheets.Saves", "Saving Throws"), saveRows || empty())}
        ${section(t("Sheets.Skills", "Skills"), skillRows || empty(), { count: Object.keys(data.skills).length })}
      </div>
    `;
  }

  static renderCombat(data) {
    // Strikes are not Items, so they get their own markup and an index handle.
    const strikes = data.strikes.map((strike, index) => `
      <div class="mgk-row" data-strike="${esc(index)}">
        <div class="mgk-row-main">
          <img class="mgk-row-img" src="${esc(strike.imageUrl ?? data.img)}" alt="">
          <div class="mgk-row-text">
            <span class="mgk-row-name">${esc(strike.label ?? strike.name)}</span>
            <span class="mgk-row-sub">${esc(strike.item?.system?.damage?.damageType ?? "")}</span>
          </div>
          <div class="mgk-row-chips">
            ${(strike.variants ?? []).map((v, vi) => `
              <button type="button" class="mgk-chip tappable" data-action="pf2e-strike" data-strike="${esc(index)}" data-variant="${esc(vi)}">
                ${esc(v.label ?? signed(strike.totalModifier ?? 0))}
              </button>
            `).join("")}
          </div>
        </div>
        <button type="button" class="mgk-row-action" data-action="pf2e-damage" data-strike="${esc(index)}">
          <i class="fas fa-burst"></i>
        </button>
      </div>
    `).join("");

    const actions = data.actions.map(a => itemRow({
      id: a.id, img: a.img, name: a.name,
      subtitle: a.system?.actionType?.value ?? "", action: "use-item"
    })).join("");

    return `
      <div class="mgk-tab">
        ${section(t("Sheets.Strikes", "Strikes"), strikes || empty(), { count: data.strikes.length })}
        ${section(t("Sheets.Actions", "Actions"), actions || empty(), { count: data.actions.length })}
      </div>
    `;
  }

  static renderInventory(data) {
    const groups = {};
    for (const item of data.inventory) (groups[item.type] ??= []).push(item);

    const coins = `
      <div class="mgk-currency">
        ${["pp", "gp", "sp", "cp"].map(c => `
          <div><small>${esc(c.toUpperCase())}</small><div>${esc(data.coins?.[c] ?? 0)}</div></div>
        `).join("")}
      </div>
    `;

    const sections = Object.entries(groups).map(([type, items]) => section(
      game.i18n.localize(CONFIG.Item?.typeLabels?.[type] ?? type),
      items.map(i => itemRow({
        id: i.id, img: i.img, name: i.name,
        subtitle: (i.quantity ?? 1) > 1 ? `x${i.quantity}` : "",
        action: "open-item"
      })).join(""),
      { count: items.length }
    )).join("");

    return `<div class="mgk-tab">${coins}${sections || empty()}</div>`;
  }

  static renderFeatures(data) {
    const rows = data.feats.map(f => itemRow({
      id: f.id, img: f.img, name: f.name,
      subtitle: f.system?.category ?? "", action: "use-item"
    })).join("");
    return `<div class="mgk-tab">${section(t("Sheets.Feats", "Feats"), rows || empty(), { count: data.feats.length })}</div>`;
  }

  static renderSpells(data) {
    if (!data.spellcasting.length) {
      return `<div class="mgk-tab">${empty(t("Sheets.NoSpells", "No spells."))}</div>`;
    }

    const sections = data.spellcasting.map(entry => {
      const spells = Array.from(entry.spells ?? []);
      if (!spells.length) return "";
      const mode = entry.isSpontaneous ? t("Sheets.Spontaneous", "Spontaneous")
        : entry.isPrepared ? t("Sheets.Prepared", "Prepared")
        : "";
      const rows = spells.map(s => itemRow({
        id: s.id, img: s.img, name: s.name,
        subtitle: `${t("Sheets.Rank", "Rank")} ${s.rank ?? s.system?.level?.value ?? 0}`,
        action: "use-item"
      })).join("");
      return section(`${entry.name}${mode ? ` — ${mode}` : ""}`, rows, { count: spells.length });
    }).join("");

    return `<div class="mgk-tab">${sections || empty()}</div>`;
  }

  static renderEffects(data) {
    const conditions = data.conditions.map(c => itemRow({
      id: c.id, img: c.img, name: c.name,
      subtitle: c.system?.value?.value ? `${c.system.value.value}` : "",
      action: "open-item", expandable: false
    })).join("");

    const effects = data.effects.map(e => itemRow({
      id: e.id, img: e.img, name: e.name, action: "open-item", expandable: false
    })).join("");

    return `
      <div class="mgk-tab">
        ${section(t("Sheets.Conditions", "Conditions"), conditions || empty(), { count: data.conditions.length })}
        ${section(t("Sheets.ActiveEffects", "Effects"), effects || empty(), { count: data.effects.length })}
      </div>
    `;
  }

  static renderOther() {
    return `
      <div class="mgk-tab">
        <div class="mgk-rest-row">
          <button type="button" class="mgk-big-btn" data-action="rest-long">
            <i class="fas fa-bed"></i> ${esc(t("Sheets.Rest", "Rest"))}
          </button>
        </div>
        <button type="button" class="mgk-big-btn wide" data-action="open-native">
          <i class="fas fa-up-right-from-square"></i> ${esc(t("Sheets.OpenNative", "Open full sheet"))}
        </button>
      </div>
    `;
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  static async rollSave(actor, key, event) {
    return actor.saves?.[key]?.check?.roll({ event });
  }

  static async rollSkill(actor, key, event) {
    return actor.skills?.[key]?.check?.roll({ event });
  }

  static async rollAbility() {
    // PF2e has no bare ability checks; the skill list covers this.
  }

  static async rest(actor) {
    return game.pf2e?.actions?.restForTheNight?.({ actors: [actor] });
  }

  static async onCustomAction(action, dataset, actor, event) {
    event.stopPropagation();
    if (action === "pf2e-strike") return this.strike(actor, dataset.strike, dataset.variant);
    if (action === "pf2e-damage") return this.strikeDamage(actor, dataset.strike);
  }

  /** Strike rolls are addressed by index because strikes are not documents. */
  static async strike(actor, index, variant = 0) {
    const strike = actor.system.actions?.[Number(index)];
    return strike?.variants?.[Number(variant)]?.roll?.({});
  }

  static async strikeDamage(actor, index) {
    const strike = actor.system.actions?.[Number(index)];
    return strike?.damage?.({});
  }
}
