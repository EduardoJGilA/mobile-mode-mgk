/**
 * Slide-out Mobile Chat Drawer UI
 */
export class ChatDrawer {
  static init() {
    Hooks.on("mobileModeToggleChat", () => this.toggle());
  }

  static toggle() {
    let panel = document.getElementById("mgk-chat-drawer");
    if (!panel) {
      panel = this.createPanel();
    }

    panel.classList.toggle("open");
  }

  static createPanel() {
    const panel = document.createElement("div");
    panel.id = "mgk-chat-drawer";
    panel.className = "mgk-drawer-panel";

    panel.innerHTML = `
      <div class="mgk-drawer-handle"></div>
      <div class="mgk-drawer-header">
        <h3 style="margin:0; color:#fff;"><i class="fas fa-comments"></i> Chat Log</h3>
        <button id="mgk-close-chat" style="background:none; border:none; color:#aaa; font-size:1.2rem;"><i class="fas fa-times"></i></button>
      </div>
      <div class="mgk-drawer-body" id="mgk-chat-content"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#mgk-close-chat").addEventListener("click", () => panel.classList.remove("open"));

    // Sync content from Foundry chat log
    const chatLog = document.getElementById("chat-log");
    if (chatLog) {
      const content = panel.querySelector("#mgk-chat-content");
      content.appendChild(chatLog.cloneNode(true));
    }

    return panel;
  }
}
