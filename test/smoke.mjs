/**
 * Smoke test: executes the pure rendering/maths paths against a minimal
 * Foundry mock. Catches thrown errors, undefined output and unescaped values
 * that a bundler and a linter cannot see.
 *
 * Run with: node test/smoke.mjs
 */
import assert from "node:assert";

/* -------------------------------------------- */
/*  Foundry mock                                */
/* -------------------------------------------- */

const localized = {};

globalThis.game = {
  system: { id: "dnd5e", version: "4.3.9" },
  user: { id: "user1", isGM: true, color: { css: "#ff0000" }, hotbar: { 1: "macroA", 3: "macroB" } },
  i18n: {
    localize: (key) => localized[key] ?? key,
    format: (key, data) => `${key}:${JSON.stringify(data)}`
  },
  settings: { get: () => 400, set: async () => {} },
  scenes: [],
  modules: { get: () => ({}) }
};

globalThis.CONFIG = {
  DND5E: {
    abilities: { str: { abbreviation: "str" }, dex: { abbreviation: "dex" } },
    skills: { acrobatics: { label: "Acrobatics" } },
    spellLevels: { 0: "Cantrip", 1: "1st Level" }
  },
  Item: { typeLabels: { weapon: "Weapon", spell: "Spell", equipment: "Equipment" } },
  statusEffects: [
    { id: "blinded", name: "Blinded", img: "icons/blinded.svg" },
    { id: "prone", name: "Prone", img: "icons/prone.svg" }
  ]
};

globalThis.foundry = {
  utils: {
    getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj),
    deepClone: (o) => structuredClone(o)
  }
};

/* -------------------------------------------- */
/*  Fixtures                                    */
/* -------------------------------------------- */

const makeItem = (over = {}) => ({
  id: over.id ?? "i1",
  name: over.name ?? "Handaxe",
  img: "icons/axe.webp",
  type: over.type ?? "weapon",
  labels: { modifier: "+5", damage: "1d6 + 3" },
  system: { quantity: 1, level: 0, preparation: { prepared: true }, description: { value: "<p>Hi</p>" } },
  ...over
});

// A name that breaks naive string interpolation into HTML and JS handlers.
const NASTY = `O'Brien "the <b>Bold</b>" & <script>alert(1)</script>`;

const items = [
  makeItem({ id: "w1", name: NASTY, type: "weapon" }),
  makeItem({ id: "s1", name: "Booming Blade", type: "spell", labels: { school: "Evocation", activation: "Action", components: { vsm: "V, M" } }, system: { level: 0, preparation: { prepared: true }, description: { value: "" } } }),
  makeItem({ id: "s2", name: "Thunderwave", type: "spell", labels: { school: "Evocation", activation: "Action", range: "Self", damage: "2d8 Thunder" }, system: { level: 1, preparation: { prepared: true }, description: { value: "" } } }),
  makeItem({ id: "s3", name: "Suggestion", type: "spell", labels: { school: "Enchantment", activation: "Action", range: "30 ft", components: { vsm: "V, M", concentration: true } }, system: { level: 2, preparation: { mode: "innate" }, uses: { value: 1, max: 1 }, properties: new Set(["concentration"]), description: { value: "" } } }),
  makeItem({ id: "e1", name: "Shield", type: "equipment" }),
  makeItem({ id: "f1", name: "Second Wind", type: "feat", system: { uses: { value: 2, max: 2 }, activation: { type: "bonus" }, description: { value: "" } } })
];

const byType = (type) => items.filter(i => i.type === type);

/** Stand-in for a Foundry Collection: iterable, with filter/get/contents/size. */
const collection = (entries) => ({
  contents: entries,
  size: entries.length,
  filter: (fn) => entries.filter(fn),
  map: (fn) => entries.map(fn),
  find: (fn) => entries.find(fn),
  some: (fn) => entries.some(fn),
  get: (id) => entries.find(e => e.id === id),
  [Symbol.iterator]: () => entries[Symbol.iterator]()
});

const actor = {
  id: "actor1",
  name: "Guntred Untgaard",
  img: "icons/portrait.webp",
  type: "character",
  statuses: new Set(["prone"]),
  effects: [{ name: "Bless", img: "icons/bless.svg", disabled: false }],
  items: collection(items),
  itemTypes: {
    weapon: byType("weapon"),
    spell: byType("spell"),
    feat: byType("feat"),
    class: [{ id: "c1", name: "Fighter", img: "i.webp", system: { levels: 2 } }],
    race: [{ id: "r1", name: "Dwarf", img: "i.webp", system: {} }]
  },
  system: {
    attributes: {
      hp: { value: 25, max: 29, temp: 0, tempmax: 0 },
      ac: { value: 19 },
      movement: { walk: 30, units: "ft" },
      init: { total: 1 },
      hd: { value: 3, max: 3 },
      senses: { darkvision: 60, units: "ft" },
      encumbrance: { value: 253, max: 255, pct: 99, units: "lbs" }
    },
    abilities: {
      str: { value: 17, mod: 3, save: 5 },
      dex: { value: 12, mod: 1, save: 1 }
    },
    skills: { acrobatics: { total: 1, ability: "dex", proficient: 0 } },
    currency: { pp: 1, gp: 50, ep: 0, sp: 0, cp: 0 },
    spells: { spell1: { value: 2, max: 2 } },
    resources: { primary: { label: "Ki", value: 1, max: 3 } },
    details: {}
  }
};


/* -------------------------------------------- */
/*  Assertions                                  */
/* -------------------------------------------- */

let failures = 0;

/** Must be awaited: several checks are async, and an unawaited rejection
 *  would silently report a pass. */
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
};

/* -------------------------------------------- */
/*  1. D&D 5e adapter renders every tab          */
/* -------------------------------------------- */

const { esc, signed } = await import("../src/core/utils.js");
const { DnD5eAdapter } = await import("../src/sheets/adapters/dnd5e-adapter.js");
const { AgnosticAdapter } = await import("../src/sheets/adapters/agnostic-adapter.js");

console.log("\nD&D 5e adapter");
const data = DnD5eAdapter.getCharacterData(actor);

await check("subtitle uses real class and species", () => {
  assert.strictEqual(data.subtitle, "Fighter 2 · Dwarf");
});

for (const tab of DnD5eAdapter.tabs) {
  await check(`renders ${tab.id} tab`, () => {
    const html = DnD5eAdapter.renderTab(tab.id, data);
    assert.ok(typeof html === "string" && html.length > 0, "empty output");
    assert.ok(!html.includes("undefined"), "output contains 'undefined'");
    assert.ok(!html.includes("[object Object]"), "output contains '[object Object]'");
  });
}

await check("hostile item name is escaped everywhere it appears", () => {
  // Every character of NASTY must survive only in escaped form. Checking for a
  // specific payload string would pass under partial escaping, so assert that
  // none of the raw metacharacters from the name reach the output at all.
  const rawFragments = ["<script", "</script", "<b>", `"the`, "O'Brien", "Bold</b>"];
  const escapedName = esc(NASTY);
  let seen = 0;

  for (const tab of DnD5eAdapter.tabs.map(t => t.id)) {
    const html = DnD5eAdapter.renderTab(tab, data);
    for (const fragment of rawFragments) {
      assert.ok(!html.includes(fragment), `${tab}: raw fragment ${JSON.stringify(fragment)} survived`);
    }
    if (html.includes(escapedName)) seen += 1;
  }

  assert.ok(seen > 0, "the hostile name never rendered, so nothing was actually tested");
});

await check("spell tab groups by category and shows rich metadata (innate, school, concentration, slots)", () => {
  const html = DnD5eAdapter.renderTab("Spells", data);
  assert.ok(html.includes("Cantrip"), "missing cantrip group");
  assert.ok(html.includes("1st Level"), "missing level 1 group");
  assert.ok(html.includes("Innate Spellcasting"), "missing innate group");
  assert.ok(html.includes("Suggestion"), "missing innate spell name");
  assert.ok(html.includes("mgk-chip conc"), "missing concentration chip");
  assert.ok(html.includes("1/1"), "missing innate uses chip");
  assert.ok(html.includes("mgk-slot-tracker"), "missing slot tracker");
  assert.ok(html.includes("mgk-slot-step"), "missing slot step buttons");
  assert.ok(html.includes("mgk-slot-val"), "missing slot value");
});

await check("slot-step action updates actor slot value bounded by max and zero", async () => {
  let updated = null;
  const mockActor = {
    update: async (u) => { updated = u; }
  };
  const origGetProperty = globalThis.foundry.utils.getProperty;
  globalThis.foundry.utils.getProperty = (obj, path) => {
    if (path === "system.spells.spell1.value") return 2;
    if (path === "system.spells.spell1.max") return 4;
    return origGetProperty(obj, path);
  };
  await DnD5eAdapter.onCustomAction("slot-step", { slot: "spell1", step: "-1" }, mockActor, { stopPropagation: () => {} });
  assert.deepStrictEqual(updated, { "system.spells.spell1.value": 1 });

  await DnD5eAdapter.onCustomAction("slot-step", { slot: "spell1", step: "1" }, mockActor, { stopPropagation: () => {} });
  assert.deepStrictEqual(updated, { "system.spells.spell1.value": 3 });

  globalThis.foundry.utils.getProperty = origGetProperty;
});

await check("effects tab marks the active status", () => {
  const html = DnD5eAdapter.renderTab("Effects", data);
  assert.ok(html.includes(`data-status="prone"`), "missing prone toggle");
  assert.ok(/class="mgk-status active"[^>]*data-status="prone"/.test(html), "prone not marked active");
});

await check("unknown tab id degrades instead of throwing", () => {
  assert.ok(DnD5eAdapter.renderTab("Nonexistent", data).length > 0);
});

/* -------------------------------------------- */
/*  2. Agnostic adapter                          */
/* -------------------------------------------- */

console.log("\nAgnostic adapter");
globalThis.CONFIG.Actor = { typeLabels: { character: "Character" } };

await check("resolves hp from system.attributes.hp", () => {
  const agnostic = AgnosticAdapter.getCharacterData(actor);
  assert.strictEqual(agnostic.hp.value, 25);
  assert.strictEqual(AgnosticAdapter.hpPaths.value, "system.attributes.hp.value");
});

await check("resolves hp from the system.hp layout", () => {
  const other = { name: "X", img: "", type: "npc", items: collection([]), effects: [], system: { hp: { value: 4, max: 9 } } };
  const agnostic = AgnosticAdapter.getCharacterData(other);
  assert.strictEqual(agnostic.hp.max, 9);
  assert.strictEqual(AgnosticAdapter.hpPaths.value, "system.hp.value");
});

await check("renders every declared tab", () => {
  const agnostic = AgnosticAdapter.getCharacterData(actor);
  for (const tab of AgnosticAdapter.tabs) {
    const html = AgnosticAdapter.renderTab(tab.id, agnostic);
    assert.ok(html.length > 0, `${tab.id} empty`);
  }
});

/* -------------------------------------------- */
/*  3. HP maths                                  */
/* -------------------------------------------- */

console.log("\nHP widget");
const { HpWidget } = await import("../src/ui/hp-widget.js");
const paths = DnD5eAdapter.hpPaths;

const fakeActor = (hp) => {
  const a = { system: { attributes: { hp: { ...hp } } }, updates: null };
  a.update = async (u) => { a.updates = u; };
  return a;
};

await check("damage clamps at zero", async () => {
  const a = fakeActor({ value: 5, max: 29, temp: 0 });
  await HpWidget.applyDelta(a, paths, -50);
  assert.strictEqual(a.updates[paths.value], 0);
});

await check("healing clamps at max", async () => {
  const a = fakeActor({ value: 25, max: 29, temp: 0 });
  await HpWidget.applyDelta(a, paths, 50);
  assert.strictEqual(a.updates[paths.value], 29);
});

await check("temp hp absorbs damage before real hp", async () => {
  const a = fakeActor({ value: 25, max: 29, temp: 5 });
  await HpWidget.applyDelta(a, paths, -8);
  assert.strictEqual(a.updates[paths.temp], 0, "temp not drained");
  assert.strictEqual(a.updates[paths.value], 22, "wrong hp after absorption");
});

await check("temp hp fully absorbs a small hit", async () => {
  const a = fakeActor({ value: 25, max: 29, temp: 10 });
  await HpWidget.applyDelta(a, paths, -4);
  assert.strictEqual(a.updates[paths.temp], 6);
  assert.strictEqual(a.updates[paths.value], undefined, "hp changed when temp should have covered it");
});

/* -------------------------------------------- */
/*  4. Escaping helper                           */
/* -------------------------------------------- */

console.log("\nUtils");

await check("esc neutralises every dangerous character", () => {
  assert.strictEqual(esc(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

await check("esc handles null and undefined", () => {
  assert.strictEqual(esc(null), "");
  assert.strictEqual(esc(undefined), "");
});

await check("signed formats both directions", () => {
  assert.strictEqual(signed(3), "+3");
  assert.strictEqual(signed(-2), "-2");
  assert.strictEqual(signed(0), "+0");
});

/* -------------------------------------------- */
/*  5. Macro slot moves                          */
/* -------------------------------------------- */

console.log("\nMacro hotbar");
const { MacroHotbar } = await import("../src/ui/macro-hotbar.js");

await check("moving to an empty slot clears the source with the -= prefix", async () => {
  let captured = null;
  game.user.update = async (u) => { captured = u; };
  MacroHotbar.renderSlots = () => {};
  await MacroHotbar.moveMacro("macroA", 1, 5);
  assert.deepStrictEqual(captured, { "hotbar.5": "macroA", "hotbar.-=1": null });
});

await check("moving onto an occupied slot swaps both", async () => {
  let captured = null;
  game.user.update = async (u) => { captured = u; };
  await MacroHotbar.moveMacro("macroA", 1, 3);
  assert.deepStrictEqual(captured, { "hotbar.3": "macroA", "hotbar.1": "macroB" });
});

/* -------------------------------------------- */
/*  6. Template placer geometry                  */
/* -------------------------------------------- */

console.log("\nTemplate placer");
const { TemplatePlacer } = await import("../src/touch/template-placer.js");
globalThis.canvas = { dimensions: { size: 100, distance: 5, units: "ft" }, scene: { grid: { units: "ft" } } };

await check("pixel distance converts to scene units", () => {
  assert.strictEqual(TemplatePlacer.pixelsToUnits(300), 15);
});

await check("distance readout matches the demo format", () => {
  assert.strictEqual(TemplatePlacer.formatDistance(21.3567), "21.36 ft");
});

/* -------------------------------------------- */
/*  7. Memory diagnostics                        */
/* -------------------------------------------- */

console.log("\nMemory diagnostics");
const { MemoryDiagnostics } = await import("../src/performance/memory-diagnostics.js");
globalThis.canvas = { ready: false, scene: null };

await check("estimates a v13 single-level scene without inventing APIs", () => {
  const scene = {
    id: "s1",
    background: { src: "bg.webp" },
    foreground: null,
    dimensions: { sceneWidth: 2000, sceneHeight: 1000 },
    tokens: { size: 4 },
    tiles: []
  };
  const mb = MemoryDiagnostics.estimateSceneMemory(scene);
  // 2000*1000*4 bytes background + 4 tokens at 512*512*4
  const expected = Math.round((2000 * 1000 * 4 + 4 * 512 * 512 * 4) / (1024 * 1024));
  assert.strictEqual(mb, expected);
});

await check("measures live GPU textures when the scene is active", () => {
  globalThis.canvas = {
    ready: true,
    scene: { id: "s1" },
    app: { renderer: { texture: { managedTextures: [{ realWidth: 1024, realHeight: 1024, mipmap: false }] } } }
  };
  const mb = MemoryDiagnostics.estimateSceneMemory({ id: "s1" });
  assert.strictEqual(mb, Math.round(1024 * 1024 * 4 / (1024 * 1024)));
});

/* -------------------------------------------- */

console.log(`\n${failures ? `${failures} FAILURE(S)` : "all checks passed"}\n`);
process.exit(failures ? 1 : 0);
