import { esc, t, signed } from '../../core/utils.js';
import { section, itemRow, statBox, slotTracker, empty, bioField, bioGrid } from '../components.js';

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
    { id: "Notes", label: "Notes" },
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
      details: system.details ?? {},
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
      if (key === "pact") {
        out.push({
          key,
          level: slot.level ?? null,
          isPact: true,
          label: t("Sheets.PactMagic", "Pact Magic"),
          value: slot.value ?? 0,
          max: slot.max ?? 0
        });
      } else {
        const levelMatch = key.match(/^spell(\d+)$/);
        if (levelMatch) {
          const lvl = Number(levelMatch[1]);
          out.push({
            key,
            level: lvl,
            isPact: false,
            label: this.levelLabel(lvl),
            value: slot.value ?? 0,
            max: slot.max ?? 0
          });
        }
      }
    }
    return out;
  }

  static levelLabel(level) {
    if (level === 0) return t("Sheets.Cantrip", "Cantrips");
    return CONFIG.DND5E?.spellLevels?.[level] ?? `Level ${level}`;
  }

  static spellSubtitle(spell) {
    const labels = spell.labels ?? {};
    const school = labels.school ?? CONFIG.DND5E?.spellSchools?.[spell.system?.school]?.label ?? CONFIG.DND5E?.spellSchools?.[spell.system?.school] ?? "";
    const vsm = labels.components?.vsm ?? "";
    const range = labels.range ?? (spell.system?.range?.value ? `${spell.system.range.value} ${spell.system.range.units ?? "ft"}` : spell.system?.range?.units ?? "");
    return [school, vsm, range].filter(Boolean).join(" · ");
  }

  static spellChips(spell) {
    const labels = spell.labels ?? {};
    const props = spell.system?.properties;
    const isConc = (props instanceof Set ? props.has("concentration") : Array.isArray(props) ? props.includes("concentration") : false)
      || labels.components?.concentration || spell.system?.components?.concentration || false;
    const isRitual = (props instanceof Set ? props.has("ritual") : Array.isArray(props) ? props.includes("ritual") : false)
      || labels.components?.ritual || spell.system?.components?.ritual || false;

    const chips = [];

    // Preparation status (for standard prepared mode)
    if (!this.isPrepared(spell)) {
      chips.push({ label: t("Sheets.Unprepared", "unprepared"), cls: "unprepared" });
    }

    // Limited uses (e.g. 1/1)
    const uses = spell.system?.uses;
    if (uses?.max) {
      chips.push({ label: `${uses.value ?? 0}/${uses.max}`, cls: "uses" });
    }

    // Concentration badge
    if (isConc) {
      chips.push({ label: "C", cls: "conc" });
    }

    // Ritual badge
    if (isRitual) {
      chips.push({ label: "R", cls: "ritual" });
    }

    // Activation / Cast Time (e.g. Action, Bonus, Reaction)
    const act = labels.activation || spell.system?.activation?.type;
    if (act) {
      chips.push({ label: act, cls: "cast-time" });
    }

    // Damage or Save
    const damage = labels.damage ?? (Array.isArray(labels.damages) ? labels.damages[0]?.formula : null);
    if (damage) chips.push(damage);
    else if (labels.save) chips.push(`DC ${labels.save}`);

    return chips;
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
          id: s.id, img: s.img, name: s.name,
          subtitle: this.spellSubtitle(s),
          chips: this.spellChips(s), actionLabel: ""
        })).join("") || empty(), { count: cantrips.length })}
        ${section(t("Sheets.PreparedSpells", "Prepared Spells"), leveled.map(s => itemRow({
          id: s.id, img: s.img, name: s.name,
          subtitle: `${this.levelLabel(s.system.level)} · ${this.spellSubtitle(s)}`,
          chips: this.spellChips(s)
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

    // Categorize spells by preparation mode & level
    const innate = [];
    const atwill = [];
    const pact = [];
    const ritual = [];
    const byLevel = new Map();

    for (const spell of data.spells) {
      const mode = spell.system?.preparation?.mode ?? "prepared";
      if (mode === "innate") {
        innate.push(spell);
      } else if (mode === "atwill") {
        atwill.push(spell);
      } else if (mode === "pact") {
        pact.push(spell);
      } else if (mode === "ritual") {
        ritual.push(spell);
      } else {
        const level = spell.system?.level ?? 0;
        if (!byLevel.has(level)) byLevel.set(level, []);
        byLevel.get(level).push(spell);
      }
    }

    const slotFor = (level) => data.spellSlots.find(s => s.level === level && !s.isPact)
      ?? (level > 0 ? data.spellSlots.find(s => s.level === level) : null);

    const renderSpellGroup = (title, spells, slot = null) => {
      if (!spells.length && !slot) return "";
      const tracker = slot ? slotTracker(slot) : "";
      const count = spells.length ? ` <span class="mgk-count">(${spells.length})</span>` : "";
      const header = `<span>${esc(title)}${count}</span>${tracker}`;
      const rows = spells.map(s => itemRow({
        id: s.id, img: s.img, name: s.name,
        subtitle: this.spellSubtitle(s),
        chips: this.spellChips(s)
      })).join("");
      return `
        <details class="mgk-section" open>
          <summary class="mgk-section-title">${header}<i class="fas fa-chevron-down"></i></summary>
          <div class="mgk-section-body">${rows || empty(t("Sheets.NoSpells", "No spells."))}</div>
        </details>
      `;
    };

    const htmlParts = [];

    // 1. Innate Spellcasting
    if (innate.length) {
      htmlParts.push(renderSpellGroup(t("Sheets.InnateSpells", "Innate Spellcasting"), innate));
    }

    // 2. At-Will Spells
    if (atwill.length) {
      htmlParts.push(renderSpellGroup(t("Sheets.AtWillSpells", "At-Will Spells"), atwill));
    }

    // 3. Cantrips (Level 0)
    const cantrips = byLevel.get(0) ?? [];
    if (cantrips.length) {
      htmlParts.push(renderSpellGroup(this.levelLabel(0), cantrips));
    }

    // 4. Pact Magic
    const pactSlot = data.spellSlots.find(s => s.isPact);
    if (pact.length || pactSlot) {
      htmlParts.push(renderSpellGroup(t("Sheets.PactMagic", "Pact Magic"), pact, pactSlot));
    }

    // 5. Ritual-only spells
    if (ritual.length) {
      htmlParts.push(renderSpellGroup(t("Sheets.RitualSpells", "Rituals"), ritual));
    }

    // 6. Leveled Spells (1st Level, 2nd Level...)
    const leveledKeys = [...byLevel.keys()].filter(lvl => lvl > 0).sort((a, b) => a - b);
    for (const level of leveledKeys) {
      const spells = byLevel.get(level) ?? [];
      const slot = slotFor(level);
      htmlParts.push(renderSpellGroup(this.levelLabel(level), spells, slot));
    }

    return `<div class="mgk-tab">${htmlParts.join("")}</div>`;
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

  /** Short scalar details, in sheet order. */
  static NOTE_DETAILS = [
    ["alignment", "DND5E.Alignment", "Alignment"],
    ["gender", "DND5E.Gender", "Gender"],
    ["age", "DND5E.Age", "Age"],
    ["height", "DND5E.Height", "Height"],
    ["weight", "DND5E.Weight", "Weight"],
    ["eyes", "DND5E.Eyes", "Eyes"],
    ["skin", "DND5E.Skin", "Skin"],
    ["hair", "DND5E.Hair", "Hair"],
    ["faith", "DND5E.Faith", "Faith"]
  ];

  /** Long-form details the system stores as enriched HTML. */
  static NOTE_PROSE = [
    ["appearance", "DND5E.Appearance", "Appearance"],
    ["trait", "DND5E.PersonalityTraits", "Personality Traits"],
    ["ideal", "DND5E.Ideals", "Ideals"],
    ["bond", "DND5E.Bonds", "Bonds"],
    ["flaw", "DND5E.Flaws", "Flaws"]
  ];

  /** Detail scalars are strings in most versions but numbers in a few. */
  static str(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return value.value ?? value.name ?? "";
    return String(value);
  }

  /** Prefer the system's own translation, so labels match the native sheet. */
  static label(systemKey, fallback) {
    const out = game.i18n.localize(systemKey);
    return out === systemKey ? fallback : out;
  }

  static renderNotes(data) {
    const details = data.details ?? {};
    const biography = details.biography ?? {};

    // NPCs and vehicles carry a narrower schema than characters, so only offer
    // the fields their data model actually defines.
    const scalars = this.NOTE_DETAILS
      .filter(([key]) => key in details)
      .map(([key, i18n, fallback]) =>
        bioField(this.label(i18n, fallback), `system.details.${key}`, this.str(details[key]), "text"))
      .join("");

    const prose = this.NOTE_PROSE
      .filter(([key]) => key in details)
      .map(([key, i18n, fallback]) =>
        bioField(this.label(i18n, fallback), `system.details.${key}`, details[key] ?? "", "html"))
      .join("");

    const notes = [
      ["value", "DND5E.Biography", "Biography"],
      ["public", "DND5E.PublicBiography", "Public Biography"]
    ]
      .filter(([key]) => key in biography)
      .map(([key, i18n, fallback]) =>
        bioField(this.label(i18n, fallback), `system.details.biography.${key}`, biography[key] ?? "", "html"))
      .join("");

    const block = (title, fields, options) => (fields ? section(title, bioGrid(fields, options)) : "");

    return `
      <div class="mgk-tab">
        ${block(this.label("DND5E.CharacterDetails", t("Sheets.Details", "Details")), scalars, { columns: true })}
        ${block(this.label("DND5E.PersonalityTraits", t("Sheets.Personality", "Personality")), prose)}
        ${block(this.label("DND5E.Biography", t("Sheets.Notes", "Notes")), notes)}
        ${scalars || prose || notes ? "" : empty(t("Sheets.Empty", "Nothing here."))}
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

  static async onCustomAction(action, dataset, actor, event) {
    event?.stopPropagation?.();
    if (action === "slot-step") {
      const slotKey = dataset.slot;
      if (!slotKey) return;
      const step = Number(dataset.step) || 0;
      const current = Number(foundry.utils.getProperty(actor, `system.spells.${slotKey}.value`)) || 0;
      const max = Number(foundry.utils.getProperty(actor, `system.spells.${slotKey}.max`)) || 0;
      const next = Math.max(0, Math.min(max, current + step));
      if (next !== current) {
        await actor.update({ [`system.spells.${slotKey}.value`]: next });
      }
    }
  }
}

function actorItemsByType(actor, types) {
  return actor.items.filter(i => types.includes(i.type));
}
