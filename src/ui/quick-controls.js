/**
 * Floating Controls Stacks matching 100% Swipe-VTT Demo
 */
export class QuickControls {
  static render() {
    this.renderLeftControls();
    this.renderRightControls();
  }

  static renderLeftControls() {
    if (document.getElementById("mgk-left-controls")) return;

    const container = document.createElement("div");
    container.id = "mgk-left-controls";

    container.innerHTML = `
      <button class="mgk-floating-btn" id="mgk-btn-macro-toggle" title="Macro Bar">
        <i class="fas fa-chevron-up"></i>
      </button>
      <button class="mgk-floating-btn" id="mgk-btn-settings" title="Settings">
        <i class="fas fa-cog"></i>
      </button>
    `;

    document.body.appendChild(container);

    container.querySelector("#mgk-btn-macro-toggle").addEventListener("click", () => Hooks.callAll("mobileModeToggleMacros"));
    container.querySelector("#mgk-btn-settings").addEventListener("click", () => game.settings.sheet.render(true));
  }

  static renderRightControls() {
    if (document.getElementById("mgk-right-controls")) return;

    const container = document.createElement("div");
    container.id = "mgk-right-controls";

    container.innerHTML = `
      <button class="mgk-floating-btn" id="mgk-btn-dice" title="Quick Dice">
        <i class="fas fa-dice-d20"></i>
      </button>
      <button class="mgk-floating-btn" id="mgk-btn-chat" title="Chat Drawer">
        <i class="fas fa-comment-alt"></i>
      </button>
    `;

    document.body.appendChild(container);

    container.querySelector("#mgk-btn-dice").addEventListener("click", () => {
      new Roll("1d20").toMessage({ speaker: ChatMessage.getSpeaker() });
    });
    container.querySelector("#mgk-btn-chat").addEventListener("click", () => Hooks.callAll("mobileModeToggleChat"));
  }
}
