import { esc, t, signed } from '../../core/utils.js';
import { section, itemRow, statBox, pips, empty } from '../components.js';

const PHYSICAL_TYPES = ["weapon", "equipment", "consumable", "tool", "loot", "container"];

/**
 * D&D 5e adapter. Supports the 4.x and 5.x data models: several fields moved
 * from plain numbers to objects between those releases, so every read goes
 * through a defensive helper.
 */
export class DnD5eAdapter {
  static tabs = [
    { id: "Abilities", label: "Abilities" },
    { id: "Combat", label: "Combat" },
    { id: "Inventory", label: "Inventory" },
    { id: "Features", label: "Features" },
    { id: "Spells", label: "Spells" },
    { id: "Effects", label: "Effects" },
    { id: "Other", label: "Other" }
  ];

  static hpPaths = {
    value: "system.attributes.hp.value",
    max: "system.attributes.hp.max",
    temp: "system.attributes.hp.temp",
    tempmax: "system.attributes.hp.tempmax"
  };

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  static getCharacterData(actor) {
    const system = actor.system;

    const classes = (actor.itemTypes?.class ?? []).map(c => `${c.name} ${c.system.levels}`);
    const species = actor.itemTypes?.race?.[0]?.name
      ?? actor.itemTypes?.species?.[0]?.name
      ?? this.plain(system.details?.race);

    const subtitleParts = [classes.join(" / "), species].filter(Boolean);

    return {
      actor,
      name: actor.name,
      img: actor.img,
      subtitle: subtitleParts.join(" · "),
      hp: system.attributes?.hp ?? { value: 0, max: 0 },
      ac: system.attributes?.ac?.value ?? 10,
      speed: system.attributes?.movement?.walk ?? 0,
      speedUnits: system.attributes?.movement?.units ?? "ft",
      init: system.attributes?.init?.total ?? 0,
      hd: system.attributes?.hd ?? { value: 0, max: 0 },
      abilities: system.abilities ?? {},
      skills: system.skills ?? {},
      currency: system.currency ?? {},
      encumbrance: system.attributes?.encumbrance ?? null,
      spellSlots: this.getSpellSlots(system),
      senses: system.attributes?.senses ?? {},
      resources: system.resources ?? {},
      weapons: actor.itemTypes?.weapon ?? [],
      spells: actor.itemTypes?.spell ?? [],
      feats: actor.itemTypes?.feat ?? [],
      gear: actor.items.filter(i => PHYSICAL_TYPES.includes(i.type)),
      effects: Array.from(actor.effects ?? [])
    };
  }

  /** `race` was a string in older data and a document reference later. */
  static plain(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value.name ?? "";
  }

  /** Some numeric fields became `{value}` objects in 5.x. */
  static num(value, fallback = 0) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "object") return Number(value.value ?? value.total ?? fallback) || fallback;
    return Number(value) || fallback;
  }

  static getSpellSlots(system) {
    const out = [];
    for (const [key, slot] of Object.entries(system.spells ?? {})) {
      if (!slot || !slot.max) continue;
      const levelMatch = key.match(/^spell(\d+)$/);
      out.push({
        key,
        level: levelMatch ? Number(levelMatch[1]) : null,
        label: levelMatch ? this.levelLabel(Number(levelMatch[1])) : key.titleCase?.() ?? key,
        value: slot.value ?? 0,
        max: slot.max ?? 0
      });
    }
    return out;
  }

  static levelLabel(level) {
    if (level === 0) return t("Sheets.Cantrip", "Cantrips");
    return CONFIG.DND5E?.spellLevels?.[level] ?? `Level ${level}`;
  }

  /** Best-effort attack/damage labels across 4.x and 5.x. */
  static itemChips(item) {
    const labels = item.labels ?? {};
    const toHit = labels.modifier ?? labels.toHit ?? null;
    const damage = labels.damage ?? (Array.isArray(labels.damages) ? labels.damages[0]?.formula : null);
    const uses = item.system?.uses;
    const usesChip = uses?.max ? `${uses.value ?? 0}/${uses.max}` : null;
    return [toHit, damage, usesChip];
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  static renderTab(tabId, data) {
    const fn = this[`render${tabId}`];
    if (typeof fn !== "function") return empty(t("Sheets.Empty", "Nothing here."));
    return fn.call(this, data);
  }

  static renderAbilities(data) {
    const abilityCards = Object.entries(data.abilities).map(([key, ab]) => {
      const label = CONFIG.DND5E?.abilities?.[key]?.abbreviation?.toUpperCase() ?? key.toUpperCase();
      return `
        <div class="mgk-ability-card">
          <div class="mgk-ability-label">${esc(label)}</div>
          <button type="button" class="mgk-ability-score" data-action="roll-ability" data-ability="${esc(key)}">
            ${esc(this.num(ab.value, 10))}
          </button>
          <div class="mgk-ability-mod">${esc(signed(this.num(ab.mod)))}</div>
          <button type="button" class="mgk-save-mod" data-action="roll-save" data-ability="${esc(key)}">
            ${esc(t("Sheets.Save", "SAVE"))} ${esc(signed(this.num(ab.save)))}
          </button>
        </div>
      `;
    }).join("");

    const skillRows = Object.entries(data.skills).map(([key, sk]) => {
      const label = CONFIG.DND5E?.skills?.[key]?.label ?? key;
      const abil = (sk.ability ?? "").toUpperCase();
      const prof = this.num(sk.proficient);
      const profClass = prof >= 2 ? "expertise" : prof >= 1 ? "proficient" : prof > 0 ? "half" : "";
      return `
        <button type="button" class="mgk-skill-row" data-action="roll-skill" data-skill="${esc(key)}">
          <span class="mgk-prof ${profClass}"></span>
          <span class="mgk-skill-name">${esc(label)}</span>
          <span class="mgk-skill-abil">${esc(abil)}</span>
          <span class="mgk-skill-total">${esc(signed(this.num(sk.total)))}</span>
        </button>
      `;
    }).join("");

    return `
      <div class="mgk-tab">
        <div class="mgk-stat-grid">
          ${statBox(t("Sheets.AC", "AC"), data.ac)}
          ${statBox(t("Sheets.Speed", "SPEED"), `${data.speed}`)}
          ${statBox(t("Sheets.HitDice", "HIT DICE"), `${this.num(data.hd.value)}/${this.num(data.hd.max)}`)}
          ${statBox(t("Sheets.Initiative", "INITIATIVE"), signed(data.init))}
        </div>
        <div class="mgk-ability-grid">${abilityCards}</div>
        ${section(t("Sheets.Skills", "Skills"), skillRows || empty(), { count: Object.keys(data.skills).length })}
      </div>
    `;
  }

  static renderCombat(data) {
    const quickActions = [
      { key: "dash", icon: "fa-person-running", label: t("Sheets.Dash", "Dash") },
      { key: "disengage", icon: "fa-person-walking-arrow-right", label: t("Sheets.Disengage", "Disengage") },
      { key: "dodge", icon: "fa-shield", label: t("Sheets.Dodge", "Dodge") },
      { key: "grapple", icon: "fa-hands-bound", label: t("Sheets.Grapple", "Grapple") },
      { key: "hide", icon: "fa-eye-slash", label: t("Sheets.Hide", "Hide") },
      { key: "shove", icon: "fa-hand", label: t("Sheets.Shove", "Shove") }
    ].map(a => `
      <div class="mgk-action-btn">
        <i class="fas ${esc(a.icon)}"></i><span>${esc(a.label)}</span>
      </div>
    `).join("");

    const weapons = data.weapons.map(w => itemRow({
      id: w.id, img: w.img, name: w.name, chips: this.itemChips(w)
    })).join("");

    const cantrips = data.spells.filter(s => s.system.level === 0);
    const leveled = data.spells.filter(s => s.system.level > 0 && this.isPrepared(s));

    const activeFeats = data.feats.filter(f => f.system?.uses?.max || f.system?.activation?.type);

    return `
      <div class="mgk-tab">
        <div class="mgk-actions-row">${quickActions}</div>
        ${section(t("Sheets.Weapons", "Weapons"), weapons || empty(), { count: data.weapons.length })}
        ${section(t("Sheets.Cantrip", "Cantrips"), cantrips.map(s => itemRow({
          id: s.id, img: s.img, name: s.name, chips: this.itemChips(s), actionLabel: ""
        })).join("") || empty(), { count: cantrips.length })}
        ${section(t("Sheets.PreparedSpells", "Prepared Spells"), leveled.map(s => itemRow({
          id: s.id, img: s.img, name: s.name,
          subtitle: this.levelLabel(s.system.level), chips: this.itemChips(s)
        })).join("") || empty(), { count: leveled.length })}
        ${section(t("Sheets.Features", "Features"), activeFeats.map(f => itemRow({
          id: f.id, img: f.img, name: f.name, chips: this.itemChips(f)
        })).join("") || empty(), { count: activeFeats.length })}
      </div>
    `;
  }

  static isPrepared(spell) {
    const prep = spell.system?.preparation ?? {};
    if (prep.mode && prep.mode !== "prepared") return true;   // pact, innate, always...
    return prep.prepared !== false;
  }

  static renderInventory(data) {
    const groups = {};
    for (const item of data.gear) {
      (groups[item.type] ??= []).push(item);
    }

    const currency = `
      <div class="mgk-currency">
        ${["pp", "gp", "ep", "sp", "cp"].map(c => `
          <div><small>${esc(c.toUpperCase())}</small><div>${esc(this.num(data.currency[c]))}</div></div>
        `).join("")}
      </div>
      ${data.encumbrance ? `
        <div class="mgk-encumbrance">
          <div class="mgk-bar"><span style="width:${esc(Math.min(100, this.num(data.encumbrance.pct)))}%"></span></div>
          <small>${esc(this.num(data.encumbrance.value))} / ${esc(this.num(data.encumbrance.max))} ${esc(data.encumbrance.units ?? "lbs")}</small>
        </div>` : ""}
    `;

    const sections = Object.entries(groups).map(([type, items]) => {
      const labels = CONFIG.Item?.typeLabels ?? {};
      const label = labels[type] ?? labels[`${game.system.id}.${type}`] ?? type;
      const rows = items.map(i => itemRow({
        id: i.id, img: i.img, name: i.name,
        subtitle: this.num(i.system?.quantity, 1) > 1 ? `x${this.num(i.system.quantity, 1)}` : "",
        chips: this.itemChips(i)
      })).join("");
      return section(game.i18n.localize(label), rows, { count: items.length });
    }).join("");

    return `<div class="mgk-tab">${currency}${sections || empty()}</div>`;
  }

  static renderFeatures(data) {
    const classes = actorItemsByType(data.actor, ["class", "subclass"]);
    const species = actorItemsByType(data.actor, ["race", "species", "background"]);

    const featRows = data.feats.map(f => itemRow({
      id: f.id, img: f.img, name: f.name, chips: this.itemChips(f)
    })).join("");

    return `
      <div class="mgk-tab">
        ${section(t("Sheets.Class", "Class"), classes.map(c => itemRow({
          id: c.id, img: c.img, name: c.name,
          subtitle: c.system?.levels ? `Lvl ${c.system.levels}` : "", expandable: true
        })).join("") || empty(), { count: classes.length })}
        ${section(t("Sheets.Origin", "Origin"), species.map(c => itemRow({
          id: c.id, img: c.img, name: c.name, expandable: true
        })).join("") || empty(), { count: species.length })}
        ${section(t("Sheets.Features", "Features"), featRows || empty(), { count: data.feats.length })}
      </div>
    `;
  }

  static renderSpells(data) {
    if (!data.spells.length) return `<div class="mgk-tab">${empty(t("Sheets.NoSpells", "No spells."))}</div>`;

    const byLevel = new Map();
    for (const spell of data.spells) {
      const level = spell.system?.level ?? 0;
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(spell);
    }

    const slotFor = (level) => data.spellSlots.find(s => s.level === level);

    const sections = [...byLevel.keys()].sort((a, b) => a - b).map(level => {
      const slot = slotFor(level);
      const header = `${esc(this.levelLabel(level))}${slot ? ` ${pips(slot.value, slot.max)}` : ""}`;
      const rows = byLevel.get(level).map(s => itemRow({
        id: s.id, img: s.img, name: s.name,
        subtitle: [s.labels?.components?.vsm, s.labels?.school].filter(Boolean).join(" · "),
        chips: [this.isPrepared(s) ? null : t("Sheets.Unprepared", "unprepared"), ...this.itemChips(s)]
      })).join("");
      // `header` already contains markup from pips(), so it is injected raw.
      return `
        <details class="mgk-section" open>
          <summary class="mgk-section-title"><span>${header}</span><i class="fas fa-chevron-down"></i></summary>
          <div class="mgk-section-body">${rows}</div>
        </details>
      `;
    }).join("");

    return `<div class="mgk-tab">${sections}</div>`;
  }

  static renderEffects(data) {
    const active = data.actor.statuses ?? new Set();
    const grid = (CONFIG.statusEffects ?? []).map(se => {
      const id = se.id;
      const label = game.i18n.localize(se.name ?? se.label ?? id);
      return `
        <button type="button" class="mgk-status${active.has(id) ? " active" : ""}"
                data-action="toggle-status" data-status="${esc(id)}">
          <img src="${esc(se.img ?? se.icon)}" alt="" loading="lazy">
          <span>${esc(label)}</span>
        </button>
      `;
    }).join("");

    const effects = data.effects.map(e => `
      <div class="mgk-row">
        <div class="mgk-row-main">
          <img class="mgk-row-img" src="${esc(e.img ?? e.icon)}" alt="">
          <div class="mgk-row-text">
            <span class="mgk-row-name">${esc(e.name)}</span>
            <span class="mgk-row-sub">${esc(e.disabled ? t("Sheets.Disabled", "Disabled") : t("Sheets.Active", "Active"))}</span>
          </div>
        </div>
      </div>
    `).join("");

    return `
      <div class="mgk-tab">
        ${section(t("Sheets.Conditions", "Conditions"), `<div class="mgk-status-grid">${grid}</div>`)}
        ${section(t("Sheets.ActiveEffects", "Active Effects"), effects || empty(), { count: data.effects.length })}
      </div>
    `;
  }

  static renderOther(data) {
    const senses = Object.entries(data.senses)
      .filter(([key, val]) => key !== "units" && this.num(val) > 0)
      .map(([key, val]) => `<div class="mgk-kv"><span>${esc(key)}</span><span>${esc(this.num(val))} ${esc(data.senses.units ?? "ft")}</span></div>`)
      .join("");

    const resources = Object.entries(data.resources)
      .filter(([, r]) => r && r.max)
      .map(([key, r]) => `<div class="mgk-kv"><span>${esc(r.label || key)}</span><span>${esc(r.value ?? 0)} / ${esc(r.max)}</span></div>`)
      .join("");

    return `
      <div class="mgk-tab">
        <div class="mgk-rest-row">
          <button type="button" class="mgk-big-btn" data-action="rest-short">
            <i class="fas fa-utensils"></i> ${esc(t("Sheets.ShortRest", "Short Rest"))}
          </button>
          <button type="button" class="mgk-big-btn" data-action="rest-long">
            <i class="fas fa-bed"></i> ${esc(t("Sheets.LongRest", "Long Rest"))}
          </button>
        </div>
        ${section(t("Sheets.Senses", "Senses"), senses || empty())}
        ${section(t("Sheets.Resources", "Resources"), resources || empty())}
        <button type="button" class="mgk-big-btn wide" data-action="open-native">
          <i class="fas fa-up-right-from-square"></i> ${esc(t("Sheets.OpenNative", "Open full sheet"))}
        </button>
      </div>
    `;
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  /** dnd5e 5.x takes a config object; 4.x took positional arguments. */
  static get usesObjectRollApi() {
    return Number.parseInt(game.system.version, 10) >= 5;
  }

  static async rollAbility(actor, ability, event) {
    if (actor.rollAbilityCheck) return actor.rollAbilityCheck({ ability, event });
    return actor.rollAbilityTest?.(ability, { event });
  }

  static async rollSave(actor, ability, event) {
    if (actor.rollSavingThrow) return actor.rollSavingThrow({ ability, event });
    return actor.rollAbilitySave?.(ability, { event });
  }

  static async rollSkill(actor, skill, event) {
    if (!actor.rollSkill) return;
    if (this.usesObjectRollApi) return actor.rollSkill({ skill, event });
    return actor.rollSkill(skill, { event });
  }

  static async rest(actor, type) {
    if (type === "short") return actor.shortRest?.();
    return actor.longRest?.();
  }
}

function actorItemsByType(actor, types) {
  return actor.items.filter(i => types.includes(i.type));
}
