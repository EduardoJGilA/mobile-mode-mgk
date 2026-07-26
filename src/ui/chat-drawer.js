import { esc, t } from '../core/utils.js';
import { ChatStack } from './chat-stack.js';

const MAX_MESSAGES = 60;

/**
 * Slide-out chat drawer.
 *
 * Renders Foundry chat messages itself rather than cloning the sidebar, so the
 * log stays live, stays scrolled to the newest entry, and keeps a badge of
 * unread messages on the toggle button while closed.
 */
export class ChatDrawer {
  static panel = null;
  static unread = 0;

  static init() {
    Hooks.on("mobileModeToggleChat", () => this.toggle());
    Hooks.on("createChatMessage", (message) => this.onMessage(message));
    Hooks.on("deleteChatMessage", () => this.isOpen && this.renderMessages());
  }

  static get isOpen() {
    return !!this.panel?.classList.contains("open");
  }

  static toggle() {
    if (!this.panel) this.panel = this.createPanel();
    const open = this.panel.classList.toggle("open");
    if (open) {
      this.unread = 0;
      this.updateBadge();
      this.renderMessages();
    }
  }

  static close() {
    this.panel?.classList.remove("open");
  }

  static createPanel() {
    const panel = document.createElement("div");
    panel.id = "mgk-chat-drawer";
    panel.className = "mgk-drawer-panel";
    panel.innerHTML = `
      <div class="mgk-drawer-grab"></div>
      <div class="mgk-drawer-header">
        <h3><i class="fas fa-comments"></i> ${esc(t("Chat.Title", "Chat Log"))}</h3>
        <button type="button" class="mgk-icon-btn" id="mgk-close-chat" aria-label="${esc(t("Sheets.Close", "Close"))}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="mgk-drawer-body" id="mgk-chat-content"></div>
      <form class="mgk-chat-form" id="mgk-chat-form">
        <input type="text" id="mgk-chat-input" autocomplete="off"
               placeholder="${esc(t("Chat.Placeholder", "Say something…"))}">
        <button type="submit" aria-label="${esc(t("Chat.Send", "Send"))}"><i class="fas fa-paper-plane"></i></button>
      </form>
    `;

    document.body.appendChild(panel);
    panel.querySelector("#mgk-close-chat").addEventListener("click", () => this.close());
    panel.querySelector("#mgk-chat-form").addEventListener("submit", (ev) => this.onSubmit(ev));

    // Chat cards contain real Foundry buttons; let the system handle them.
    panel.querySelector("#mgk-chat-content").addEventListener("click", (ev) => {
      const button = ev.target.closest("button[data-action], .card-buttons button, a.inline-roll, .roll-button");
      if (!button) return;
      setTimeout(() => {
        if (this.isOpen) this.close();
      }, 80);
      const messageEl = ev.target.closest("[data-message-id]");
      const message = game.messages.get(messageEl?.dataset.messageId);
      if (message) Hooks.call("mgkChatCardAction", message, button, ev);
    });

    return panel;
  }

  static async onSubmit(ev) {
    ev.preventDefault();
    const input = this.panel.querySelector("#mgk-chat-input");
    const content = input.value.trim();
    if (!content) return;
    input.value = "";
    // processMessage lives on the ChatLog *instance*, which Foundry exposes as ui.chat.
    await ui.chat?.processMessage(content);
  }

  static onMessage(message) {
    if (this.isOpen) return void this.appendMessage(message);
    // The floating card stack already surfaced it, so it is not unread.
    if (ChatStack.visible) return;
    this.unread += 1;
    this.updateBadge();
  }

  static updateBadge() {
    const button = document.getElementById("mgk-btn-chat");
    if (!button) return;
    let badge = button.querySelector(".mgk-badge");
    if (!this.unread) return badge?.remove();
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "mgk-badge";
      button.appendChild(badge);
    }
    badge.textContent = this.unread > 99 ? "99+" : String(this.unread);
  }

  static async renderMessages() {
    const content = this.panel?.querySelector("#mgk-chat-content");
    if (!content) return;
    content.innerHTML = "";
    const messages = game.messages.contents.slice(-MAX_MESSAGES);
    for (const message of messages) await this.appendMessage(message, false);
    this.scrollToBottom();
  }

  static async appendMessage(message, scroll = true) {
    const content = this.panel?.querySelector("#mgk-chat-content");
    if (!content || !message.visible) return;

    const html = await message.renderHTML?.() ?? await message.getHTML?.();
    const element = html instanceof HTMLElement ? html : html?.[0];
    if (!element) return;

    content.appendChild(element);
    while (content.children.length > MAX_MESSAGES) content.firstElementChild.remove();
    if (scroll) this.scrollToBottom();
  }

  static scrollToBottom() {
    const content = this.panel?.querySelector("#mgk-chat-content");
    if (content) content.scrollTop = content.scrollHeight;
  }
}
