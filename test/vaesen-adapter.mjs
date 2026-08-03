/* Renders every tab of the Vaesen adapter against a mock actor. */
import assert from "node:assert";

const localized = {};
globalThis.game = {
  system: { id: "vaesen" },
  i18n: { localize: (k) => localized[k] ?? k, format: (k, d) => `${k}:${JSON.stringify(d)}` },
  settings: { get: () => null },
  modules: { get: () => ({}) }
};
globalThis.CONFIG = { Actor: { typeLabels: { player: "TYPES.Actor.player" } }, statusEffects: [], roll: () => {} };
globalThis.foundry = { utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o) } };
globalThis.ui = { notifications: { warn() {}, info() {} } };
globalThis.document = {
  createElement: (tag) => ({ tag, className: "", dataset: {}, children: [], appendChild(c) { this.children.push(c); } })
};

const { VaesenAdapter } = await import(
  "../src/sheets/adapters/vaesen-adapter.js"
);

const skill = (label, attribute, value) => ({ label, attribute, value });
const item = (id, type, name, system = {}) => ({ id, type, name, img: `i/${id}.png`, system });

const player = {
  id: "a1", name: "Alastor", img: "p.png", type: "player",
  system: {
    bio: { archetype: "Ocultista" },
    resources: 4,
    attribute: {
      physique: { label: "ATTRIBUTE.PHYSIQUE", value: 3 },
      precision: { label: "ATTRIBUTE.PRECISION", value: 2 },
      logic: { label: "ATTRIBUTE.LOGIC", value: 4 },
      empathy: { label: "ATTRIBUTE.EMPATHY", value: 3 },
      magic: { label: "ATTRIBUTE.MAGIC", value: 0 }
    },
    skill: {
      agility: skill("SKILL.AGILITY", "physique", 2),
      closeCombat: skill("SKILL.CLOSE_COMBAT", "physique", 1),
      force: skill("SKILL.FORCE", "physique", 2),
      medicine: skill("SKILL.MEDICINE", "precision", 0),
      rangedCombat: skill("SKILL.RANGED_COMBAT", "precision", 3),
      stealth: skill("SKILL.STEALTH", "precision", 1),
      investigation: skill("SKILL.INVESTIGATION", "logic", 3),
      learning: skill("SKILL.LEARNING", "logic", 4),
      vigilance: skill("SKILL.VIGILANCE", "logic", 2),
      inspiration: skill("SKILL.INSPIRATION", "empathy", 1),
      manipulation: skill("SKILL.MANIPULATION", "empathy", 3),
      observation: skill("SKILL.OBSERVATION", "empathy", 2)
    },
    condition: {
      physical: { isBroken: false, states: {
        exhausted: { label: "CONDITION.EXHAUSTED", isChecked: true },
        battered: { label: "CONDITION.BATTERED", isChecked: false },
        wounded: { label: "CONDITION.WOUNDED", isChecked: false } } },
      mental: { isBroken: true, states: {
        angry: { label: "CONDITION.ANGRY", isChecked: false },
        frightened: { label: "CONDITION.FRIGHTENED", isChecked: true },
        hopeless: { label: "CONDITION.HOPELESS", isChecked: false } } }
    }
  },
  items: { contents: [
    item("w1", "weapon", "Daga de Plata", { damage: 1, range: "Cuerpo a cuerpo", bonus: 1 }),
    item("g1", "gear", "Grabadora", { bonus: 2, starting: false, quantity: "1" }),
    item("g2", "gear", "Botiquín", { bonus: 2, starting: true }),
    item("t1", "talent", "Bien viajado", {}),
    item("c1", "criticalInjury", "Costilla rota", { fatal: "No", timeLimit: "1d6 días" })
  ] },
  effects: []
};

const vaesenActor = {
  id: "v1", name: "La Llorona", img: "v.png", type: "vaesen",
  system: {
    attribute: { physique: { label: "ATTRIBUTE.PHYSIQUE", value: 5 } },
    fear: { initial: 3, subsequent: 1 }
  },
  items: { contents: [
    item("k1", "condition", "Furia", { bonus: 2, active: true }),
    item("at1", "attack", "Lamento", { damage: 2, range: "Corto" })
  ] },
  effects: []
};

const npc = {
  id: "n1", name: "Sacristán", img: "n.png", type: "npc",
  system: {
    attribute: { physique: { label: "ATTRIBUTE.PHYSIQUE", value: 2 } },
    skill: { agility: skill("SKILL.AGILITY", "physique", 1) },
    condition: { physical: { value: 3, max: 5 }, mental: { value: 4, max: 4 } }
  },
  items: { contents: [] }, effects: []
};

for (const [label, actor] of [["player", player], ["vaesen", vaesenActor], ["npc", npc]]) {
  const data = VaesenAdapter.getCharacterData(actor);
  assert.equal(data.name, actor.name);
  for (const tab of VaesenAdapter.tabs) {
    const html = VaesenAdapter.renderTab(tab.id, data);
    assert.equal(typeof html, "string", `${label}/${tab.id} returned no string`);
    assert.ok(html.length > 0, `${label}/${tab.id} rendered empty`);
    assert.ok(!html.includes("undefined"), `${label}/${tab.id} leaked "undefined" into the markup`);
    assert.ok(!html.includes("[object Object]"), `${label}/${tab.id} leaked an object`);
  }
  console.log(`  ok   ${label}: ${VaesenAdapter.tabs.length} tabs render`);
}

// Player has no numeric pool; the drawer must not offer an HP editor.
VaesenAdapter.getCharacterData(player);
assert.equal(VaesenAdapter.hasHp, false, "player must not expose HP");
assert.equal(VaesenAdapter.hpPaths.value, null, "player must expose no writable HP path");
console.log("  ok   player exposes no HP editor");

// NPCs do have one, mapped to the physical condition pool.
VaesenAdapter.getCharacterData(npc);
assert.equal(VaesenAdapter.hasHp, true, "npc should expose HP");
assert.equal(VaesenAdapter.hpPaths.value, "system.condition.physical.value");
console.log("  ok   npc maps HP to the physical condition pool");

// Skills must land under the right attribute.
const skillsHtml = VaesenAdapter.renderTab("Skills", VaesenAdapter.getCharacterData(player));

/** The markup of one attribute's <details> block. */
function blockFor(key) {
  const start = skillsHtml.indexOf(`data-ability="${key}"`);
  assert.ok(start > -1, `no block rendered for ${key}`);
  const end = skillsHtml.indexOf("<details", start);
  return skillsHtml.slice(start, end === -1 ? undefined : end);
}

const expected = {
  physique: ["agility", "closeCombat", "force"],
  precision: ["medicine", "rangedCombat", "stealth"],
  logic: ["investigation", "learning", "vigilance"],
  empathy: ["inspiration", "manipulation", "observation"]
};

for (const [attribute, skills] of Object.entries(expected)) {
  const block = blockFor(attribute);
  for (const key of skills) {
    assert.ok(block.includes(`data-skill="${key}"`), `${key} not grouped under ${attribute}`);
  }
  const foreign = Object.entries(expected)
    .filter(([other]) => other !== attribute)
    .flatMap(([, keys]) => keys)
    .filter((key) => block.includes(`data-skill="${key}"`));
  assert.deepEqual(foreign, [], `${attribute} block also contains ${foreign.join(", ")}`);
}
console.log("  ok   skills group under their attribute");

// Fear rolls only exist for Logic and Empathy.
assert.ok(skillsHtml.includes('data-action="vsn-fear" data-ability="logic"'));
assert.ok(skillsHtml.includes('data-action="vsn-fear" data-ability="empathy"'));
assert.ok(!skillsHtml.includes('data-ability="physique"><i class="fas fa-eye"'));
console.log("  ok   fear rolls only on Logic and Empathy");

console.log("\nvaesen adapter: all checks passed");
