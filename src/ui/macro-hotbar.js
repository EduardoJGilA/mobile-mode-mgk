/**
 * Touch Macro Hotbar UI
 */
export class MacroHotbar {
  static init() {
    Hooks.on("mobileModeToggleMacros", () => this.toggle());
  }

  static toggle() {
    let panel = document.getElementById("mgk-macro-drawer");
    if (!panel) {
      panel = this.createPanel();
    }

    panel.classList.toggle("open");
  }

  static createPanel() {
    const panel = document.createElement("div");
    panel.id = "mgk-macro-drawer";
    panel.className = "mgk-drawer-panel";

    panel.innerHTML = `
      <div class="mgk-drawer-handle"></div>
      <div class="mgk-drawer-header">
        <h3 style="margin:0; color:#fff;"><i class="fas fa-th-large"></i> Macro Hotbar</h3>
        <button id="mgk-close-macros" style="background:none; border:none; color:#aaa; font-size:1.2rem;"><i class="fas fa-times"></i></button>
      </div>
      <div class="mgk-drawer-body" style="display:grid; grid-template-columns: repeat(5, 1fr); gap:10px;">
        ${this.renderMacroSlots()}
      </div>
    `;

    document.body.appendChild(panel);
    panel.querySelector("#mgk-close-macros").addEventListener("click", () => panel.classList.remove("open"));

    return panel;
  }

  static renderMacroSlots() {
    let html = "";
    const macros = game.user.hotbar || {};

    for (let slot = 1; slot <= 10; slot++) {
      const macroId = macros[slot];
      const macro = macroId ? game.macros.get(macroId) : null;

      html += `
        <div class="mgk-macro-slot" style="aspect-ratio:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:10px; display:flex; align-items:center; justify-content:center; flex-direction:column; cursor:pointer;" onclick="game.macros.get('${macroId || ''}')?.execute()">
          ${macro ? `<img src="${macro.img}" style="width:32px; height:32px; border-radius:6px;">` : `<span style="color:#666;">${slot}</span>`}
        </div>
      `;
    }

    return html;
  }
}
