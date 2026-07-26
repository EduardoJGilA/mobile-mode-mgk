import { DnD5eAdapter } from './adapters/dnd5e-adapter.js';
import { PF2eAdapter } from './adapters/pf2e-adapter.js';
import { AgnosticAdapter } from './adapters/agnostic-adapter.js';

/**
 * Full Mobile Sheet Drawer Manager matching 100% Swipe-VTT Demo
 */
export class SheetManager {
  static currentActor = null;
  static currentTab = "Combat";

  static init() {
    Hooks.on("mobileModeOpenSheet", (actor) => this.openSheet(actor));
  }

  static openSheet(actor) {
    if (!actor) return;
    this.currentActor = actor;

    let panel = document.getElementById("mgk-sheet-drawer");
    if (!panel) {
      panel = this.createPanel();
    }

    this.renderContent(panel);
    panel.classList.add("open");
  }

  static createPanel() {
    const panel = document.createElement("div");
    panel.id = "mgk-sheet-drawer";
    panel.className = "mgk-sheet-drawer";

    panel.innerHTML = `
      <div class="mgk-sheet-header">
        <div class="mgk-header-left">
          <img id="mgk-sheet-avatar" class="mgk-header-avatar" src="">
          <div>
            <h3 id="mgk-sheet-name" class="mgk-header-name">Character Name</h3>
            <div id="mgk-sheet-sub" class="mgk-header-sub">Class & Race</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <div id="mgk-sheet-hp" class="mgk-header-hp">29 / 29 <span style="color:#ef4444;">❤️</span></div>
          <button id="mgk-close-sheet" style="background:none; border:none; color:#aaa; font-size:1.4rem; cursor:pointer;"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="mgk-sheet-nav">
        <button class="mgk-nav-item" data-tab="Abilities">Abilities</button>
        <button class="mgk-nav-item active" data-tab="Combat">Combat</button>
        <button class="mgk-nav-item" data-tab="Inventory">Inventory</button>
        <button class="mgk-nav-item" data-tab="Features">Features</button>
        <button class="mgk-nav-item" data-tab="Spells">Spells</button>
        <button class="mgk-nav-item" data-tab="Effects">Effects</button>
        <button class="mgk-nav-item" data-tab="Other">Other</button>
      </div>
      <div id="mgk-sheet-body" style="flex:1; overflow-y:auto;"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#mgk-close-sheet").addEventListener("click", () => panel.classList.remove("open"));

    panel.querySelectorAll(".mgk-nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".mgk-nav-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentTab = btn.dataset.tab;
        this.renderContent(panel);
      });
    });

    return panel;
  }

  static renderContent(panel) {
    if (!this.currentActor) return;

    let adapter = AgnosticAdapter;
    if (game.system.id === "dnd5e") adapter = DnD5eAdapter;
    else if (game.system.id === "pf2e") adapter = PF2eAdapter;

    const data = adapter.getCharacterData(this.currentActor);

    panel.querySelector("#mgk-sheet-name").textContent = data.name;
    panel.querySelector("#mgk-sheet-sub").textContent = `${data.className || ''} • ${data.raceName || ''}`;
    panel.querySelector("#mgk-sheet-avatar").src = data.img;

    const hp = data.hp || { value: 0, max: 0 };
    panel.querySelector("#mgk-sheet-hp").innerHTML = `${hp.value} / ${hp.max} <span style="color:#ef4444;">❤️</span>`;

    const body = panel.querySelector("#mgk-sheet-body");
    body.innerHTML = adapter.renderCombatTab(data);
  }
}
