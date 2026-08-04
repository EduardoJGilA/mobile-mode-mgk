import { esc, t } from '../../core/utils.js';
import { section, itemRow, empty, bioField, bioGrid } from '../components.js';

/**
 * Vaesen Adapter.
 *
 * Year Zero, so nothing here looks like d20: there are no hit points and no
 * saves. A character is four attributes, twelve skills, and two condition
 * tracks of three states each that end in Broken.
 *
 * Rolls are delegated to the system's own sheet class rather than rebuilt.
 * `rollSkill`, `rollAttribute`, `rollWeapon` and `rollFear` only read
 * `this.actor`, so they work on an unrendered sheet and keep every gear,
 * talent, armour and condition modifier the system applies.
 */

const ATTRIBUTES = ["physique", "precision", "logic", "empathy"];
const FEAR_ATTRIBUTES = new Set(["logic", "empathy"]);

/** Skill key -> attribute, used when an actor predates a system migration. */
const SKILL_ATTRIBUTE = {
  agility: "physique", closeCombat: "physique", force: "physique",
  medicine: "precision", rangedCombat: "precision", stealth: "precision",
  investigation: "logic", learning: "logic", vigilance: "logic",
  inspiration: "empathy", manipulation: "empathy", observation: "empathy"
};

export class VaesenAdapter {
  static tabs = [
    { id: "Skills", label: "Skills" },
    { id: "Combat", label: "Combat" },
    { id: "Gear", label: "Gear" },
    { id: "Conditions", label: "Conditions" },
    { id: "Notes", label: "Notes" },
    { id: "Other", label: "Other" }
  ];

  /**
   * Player characters have no numeric pool, so the drawer's HP control is
   * hidden for them. NPCs and vaesen do have one and keep it.
   */
  static get hasHp() {
    return this._numericConditions;
  }

  static get hpPaths() {
    if (!this._numericConditions) return { value: null, max: null, temp: null, tempmax: null };
    return {
      value: "system.condition.physical.value",
      max: "system.condition.physical.max",
      temp: null,
      tempmax: null
    };
  }

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  static getCharacterData(actor) {
    const system = actor.system ?? {};
    this._numericConditions = system.condition?.physical?.max !== undefined;

    return {
      actor,
      name: actor.name,
      img: actor.img,
      subtitle: this.subtitleFor(actor),
      hp: this._numericConditions
        ? { value: system.condition.physical.value, max: system.condition.physical.max }
        : { value: 0, max: 0 },
      items: actor.items.contents,
      effects: Array.from(actor.effects ?? [])
    };
  }

  static subtitleFor(actor) {
    const archetype = actor.system?.bio?.archetype;
    if (archetype) return archetype;
    if (actor.type === "headquarter") return actor.system?.building || actor.system?.location || "";
    return game.i18n.localize(CONFIG.Actor?.typeLabels?.[actor.type] ?? actor.type);
  }

  static renderTab(tabId, data) {
    const fn = this[`render${tabId}`];
    if (typeof fn !== "function") return empty();
    return fn.call(this, data);
  }

  /* -------------------------------------------- */
  /*  Attributes and skills                       */
  /* -------------------------------------------- */

  static renderSkills(data) {
    const system = data.actor.system ?? {};
    if (!system.attribute) return `<div class="mgk-tab">${this.openNativeButton()}</div>`;

    const blocks = ATTRIBUTES.map((key) => {
      const attribute = system.attribute[key];
      if (!attribute) return "";

      const label = game.i18n.localize(attribute.label);
      const fear = FEAR_ATTRIBUTES.has(key)
        ? `<button type="button" class="mgk-row-action" data-action="vsn-fear" data-ability="${esc(key)}"
                   title="${esc(game.i18n.localize("FEAR_ROLL"))}"><i class="fas fa-eye"></i></button>`
        : "";

      const head = `
        <div class="mgk-row mgk-vsn-attr">
          <div class="mgk-row-main" data-action="vsn-attribute" data-ability="${esc(key)}">
            <div class="mgk-vsn-score">${esc(attribute.value ?? 0)}</div>
            <div class="mgk-row-text"><span class="mgk-row-name">${esc(label)}</span></div>
          </div>
          ${fear}
        </div>`;

      const skills = Object.entries(system.skill ?? {})
        .filter(([skillKey, skill]) => (skill.attribute ?? SKILL_ATTRIBUTE[skillKey]) === key)
        .map(([skillKey, skill]) => `
          <div class="mgk-row mgk-vsn-skill">
            <div class="mgk-row-main" data-action="vsn-skill" data-skill="${esc(skillKey)}">
              <div class="mgk-row-text"><span class="mgk-row-name">${esc(game.i18n.localize(skill.label))}</span></div>
              <div class="mgk-row-chips"><span class="mgk-chip">${esc(skill.value ?? 0)}</span></div>
            </div>
          </div>`).join("");

      return section(label, head + skills, { open: true });
    }).join("");

    const resources = system.resources !== undefined
      ? `<button type="button" class="mgk-big-btn wide" data-action="vsn-resources">
           <i class="fas fa-sack-dollar"></i> ${esc(game.i18n.localize("RESOURCES"))} (${esc(system.resources ?? 0)})
         </button>`
      : "";

    return `<div class="mgk-tab">${resources}${blocks}</div>`;
  }

  /* -------------------------------------------- */
  /*  Combat                                      */
  /* -------------------------------------------- */

  static renderCombat(data) {
    const byType = (type) => data.items.filter((i) => i.type === type);

    const weapons = byType("weapon").map((i) => itemRow({
      id: i.id, img: i.img, name: i.name,
      chips: [
        i.system.damage ? `${game.i18n.localize("WEAPON.DAMAGE")} ${i.system.damage}` : null,
        i.system.range || null,
        i.system.bonus ? `+${i.system.bonus}` : null
      ],
      action: "vsn-weapon"
    })).join("");

    const armors = byType("armor").map((i) => itemRow({
      id: i.id, img: i.img, name: i.name,
      chips: [
        i.system.protection ? `${game.i18n.localize("ARMOR.PROTECTION")} ${i.system.protection}` : null,
        i.system.agility ? `${game.i18n.localize("ARMOR.AGILITY")} ${i.system.agility}` : null
      ],
      action: "open-item"
    })).join("");

    const attacks = byType("attack").map((i) => itemRow({
      id: i.id, img: i.img, name: i.name,
      chips: [i.system.damage ? `${i.system.damage}` : null, i.system.range || null],
      action: "open-item"
    })).join("");

    const injuries = byType("criticalInjury").map((i) => itemRow({
      id: i.id, img: i.img, name: i.name,
      subtitle: i.system.timeLimit || "",
      chips: [i.system.fatal || null],
      action: "open-item"
    })).join("");

    const html = [
      section(game.i18n.localize("HEADER.WEAPONS"), weapons, { count: byType("weapon").length }),
      section(game.i18n.localize("HEADER.ATTACK"), attacks, { count: byType("attack").length }),
      section(game.i18n.localize("HEADER.ARMORS"), armors, { count: byType("armor").length }),
      section(game.i18n.localize("HEADER.CRITICAL_INJURIES"), injuries, { count: byType("criticalInjury").length })
    ].join("");

    return `<div class="mgk-tab">${html || empty()}</div>`;
  }

  /* -------------------------------------------- */
  /*  Gear                                        */
  /* -------------------------------------------- */

  static renderGear(data) {
    const byType = (type) => data.items.filter((i) => i.type === type);

    const gearRow = (i) => itemRow({
      id: i.id, img: i.img, name: i.name,
      chips: [i.system.bonus ? `+${i.system.bonus}` : null, i.system.quantity || null],
      action: "open-item"
    });

    const starting = byType("gear").filter((i) => i.system.starting).map(gearRow).join("");
    const carried = byType("gear").filter((i) => !i.system.starting).map(gearRow).join("");
    const talents = byType("talent").map((i) => itemRow({
      id: i.id, img: i.img, name: i.name, action: "open-item"
    })).join("");
    const magic = byType("magic").map((i) => itemRow({
      id: i.id, img: i.img, name: i.name, subtitle: i.system.category || "", action: "open-item"
    })).join("");

    const html = [
      section(game.i18n.localize("HEADER.TALENTS"), talents, { count: byType("talent").length }),
      section(game.i18n.localize("HEADER.STARTING_GEAR"), starting),
      section(game.i18n.localize("HEADER.GEAR"), carried),
      section(game.i18n.localize("HEADER.MAGIC"), magic, { count: byType("magic").length })
    ].join("");

    return `<div class="mgk-tab">${html || empty()}</div>`;
  }

  /* -------------------------------------------- */
  /*  Conditions                                  */
  /* -------------------------------------------- */

  static renderConditions(data) {
    const condition = data.actor.system?.condition;

    // Vaesen actors carry conditions as items with a bonus, not as tracks.
    if (!condition?.physical?.states) {
      const items = data.items.filter((i) => i.type === "condition");
      if (!items.length) return `<div class="mgk-tab">${empty()}</div>`;
      const rows = items.map((i) => `
        <div class="mgk-row">
          <div class="mgk-row-main" data-action="vsn-item-condition" data-item-id="${esc(i.id)}">
            <img class="mgk-row-img" src="${esc(i.img)}" alt="" loading="lazy">
            <div class="mgk-row-text"><span class="mgk-row-name">${esc(i.name)}</span></div>
            <div class="mgk-row-chips">
              <span class="mgk-chip">${esc(i.system.bonus ?? 0)}</span>
              ${i.system.active ? `<span class="mgk-chip active">${esc(t("Sheets.Active", "Active"))}</span>` : ""}
            </div>
          </div>
        </div>`).join("");
      return `<div class="mgk-tab">${section(game.i18n.localize("HEADER.CONDITIONS"), rows)}</div>`;
    }

    return `<div class="mgk-tab">
      ${this.trackHtml("physical", condition.physical)}
      ${this.trackHtml("mental", condition.mental)}
    </div>`;
  }

  static trackHtml(track, data) {
    const isPhys = track === "physical";
    const label = game.i18n.localize(isPhys ? "CONDITION.PHYSICAL" : "CONDITION.MENTAL");
    const icon = isPhys ? "fa-heart-pulse" : "fa-brain";

    const states = Object.entries(data.states ?? {}).map(([key, state]) => `
      <button type="button" class="mgk-vsn-cond${state.isChecked ? " active" : ""}"
              data-action="vsn-condition" data-cond="${esc(key)}">
        <i class="fas ${state.isChecked ? "fa-check-square" : "fa-square"}"></i>
        <span>${esc(game.i18n.localize(state.label))}</span>
      </button>`).join("");

    const broken = `
      <button type="button" class="mgk-vsn-cond broken${data.isBroken ? " active" : ""}"
              data-action="vsn-condition" data-cond="${esc(track)}">
        <i class="fas ${data.isBroken ? "fa-skull" : "fa-heart-crack"}"></i>
        <span>${esc(game.i18n.localize("CONDITION.BROKEN"))}</span>
      </button>`;

    const recoveryLabel = game.i18n.localize(isPhys ? "UI.ROLL.PREC" : "UI.ROLL.MREC");

    const header = `
      <div class="mgk-vsn-track-header">
        <div class="mgk-vsn-track-title">
          <i class="fas ${icon}"></i>
          <span>${esc(label)}</span>
        </div>
        <button type="button" class="mgk-vsn-recovery-btn" data-action="vsn-recovery" data-track="${esc(track)}" title="${esc(recoveryLabel)}">
          <i class="fas fa-dice-d6"></i> ${esc(recoveryLabel)}
        </button>
      </div>`;

    return `<div class="mgk-vsn-track-card">${header}<div class="mgk-vsn-states">${states}${broken}</div></div>`;
  }

  static renderNotes(data) {
    const bio = data.actor.system?.bio ?? {};
    const notes = bio.note ?? bio.notes ?? data.actor.system?.notes ?? "";

    const makeField = (labelKey, fallback, path, value) =>
      bioField(game.i18n.localize(labelKey) || fallback, path, value);

    const motivation = makeField("MOTIVATION", "Motivation", "system.bio.motivation", bio.motivation);
    const trauma = makeField("TRAUMA", "Trauma", "system.bio.trauma", bio.trauma);
    const darkSecret = makeField("DARK_SECRET", "Dark Secret", "system.bio.darkSecret", bio.darkSecret);
    const memento = makeField("MEMENTO", "Memento", "system.bio.memento", bio.memento);
    const advantage = makeField("ADVANTAGE", "Advantage", "system.bio.advantage", bio.advantage);
    const noteField = makeField("NOTES", "Notes", "system.bio.note", notes);

    const bioSection = section(
      game.i18n.localize("HEADER.MOTIVATION_MEMENTO") || "Motivation & Background",
      bioGrid(`${motivation}${trauma}${darkSecret}${memento}${advantage}`)
    );

    const notesSection = section(
      game.i18n.localize("HEADER.NOTES") || "Notes",
      bioGrid(noteField)
    );

    return `<div class="mgk-tab">${bioSection}${notesSection}</div>`;
  }

  static renderOther() {
    return `<div class="mgk-tab">${this.openNativeButton()}</div>`;
  }

  static openNativeButton() {
    return `
      <button type="button" class="mgk-big-btn wide" data-action="open-native">
        <i class="fas fa-up-right-from-square"></i> ${esc(t("Sheets.OpenNative", "Open full sheet"))}
      </button>`;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * The system's roll methods live on the sheet, not the actor, and take no
   * DOM. `onRecovery` is the one exception: it reads the track from a parent
   * element, so it gets a detached node shaped the way it expects.
   */
  static async onCustomAction(action, dataset, actor, ev) {
    const sheet = actor.sheet;
    if (!sheet) return;
    ev?.stopPropagation?.();

    switch (action) {
      case "vsn-attribute":
        sheet.rollAttribute?.(dataset.ability);
        break;

      case "vsn-skill":
        sheet.rollSkill?.(dataset.skill);
        break;

      case "vsn-weapon":
        sheet.rollWeapon?.(dataset.itemId);
        break;

      case "vsn-fear":
        sheet.rollFear?.(dataset.ability);
        break;

      case "vsn-condition":
        await sheet.updateCondition?.(dataset.cond);
        break;

      case "vsn-item-condition": {
        const item = actor.items.get(dataset.itemId);
        if (item) await item.update({ "system.active": !item.system.active });
        break;
      }

      case "vsn-recovery":
        sheet.onRecovery?.({ currentTarget: this.trackStub(dataset.track) });
        break;

      case "vsn-resources": {
        const name = game.i18n.localize("RESOURCES");
        CONFIG.roll?.(sheet, name, [{ name, value: actor.system.resources || 0 }]);
        break;
      }
    }
  }

  /** A detached `.conditions[data-key]` ancestor for onRecovery to walk up to. */
  static trackStub(track) {
    const holder = document.createElement("div");
    holder.className = "conditions";
    holder.dataset.key = track;
    const trigger = document.createElement("a");
    holder.appendChild(trigger);
    return trigger;
  }

  /* Year Zero has no d20 ability checks, saves or rests. */
  static async rollAbility() {}
  static async rollSave() {}
  static async rollSkill() {}
  static async rest() {}
}
