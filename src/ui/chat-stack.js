import { esc, t } from '../core/utils.js';

const HISTORY = 40;

/**
 * The bottom card stack from the Swipe-VTT demo.
 *
 * The newest chat message floats over the canvas as a card. Chevrons page
 * backwards and forwards through recent history and the counter shows the
 * position, so a roll result stays reachable without opening the full drawer.
 */
export class ChatStack {
  static el = null;
  static messages = [];
  static index = 0;

  static init() {
    Hooks.on("createChatMessage", (message) => this.push(message));
    Hooks.on("deleteChatMessage", (message) => {
      this.messages = this.messages.filter(m => m.id !== message.id);
      if (!this.messages.length) return this.hide();
      this.index = Math.min(this.index, this.messages.length - 1);
      this.renderCard();
    });
    Hooks.on("mobileModeCloseStack", () => this.hide());
  }

  static get visible() {
    return !!this.el?.classList.contains("open");
  }

  static push(message) {
    if (!message.visible) return;
    this.messages.push(message);
    while (this.messages.length > HISTORY) this.messages.shift();
    this.index = this.messages.length - 1;
    this.show();
  }

  /** Seed from existing history the first time the stack is opened manually. */
  static seed() {
    if (this.messages.length) return;
    this.messages = game.messages.contents.filter(m => m.visible).slice(-HISTORY);
    this.index = this.messages.length - 1;
  }

  static show() {
    if (!this.el) this.el = this.create();
    this.renderCard();
    this.el.classList.add("open");
    document.body.classList.add("mgk-stack-open");
  }

  static hide() {
    this.el?.classList.remove("open");
    document.body.classList.remove("mgk-stack-open");
  }

  static toggle() {
    if (this.visible) return this.hide();
    this.seed();
    if (!this.messages.length) return ui.notifications?.info(t("Chat.Empty", "No messages yet."));
    this.show();
  }

  static create() {
    const el = document.createElement("div");
    el.id = "mgk-chat-stack";
    el.className = "mgk-chat-stack";
    el.innerHTML = `
      <div class="mgk-drawer-grab"></div>
      <div class="mgk-stack-card" id="mgk-stack-card"></div>
      <div class="mgk-stack-pager">
        <button type="button" data-step="-1" aria-label="${esc(t("Chat.Older", "Older"))}"><i class="fas fa-chevron-up"></i></button>
        <span id="mgk-stack-count">1 / 1</span>
        <button type="button" data-step="1" aria-label="${esc(t("Chat.Newer", "Newer"))}"><i class="fas fa-chevron-down"></i></button>
        <button type="button" data-close="1" aria-label="${esc(t("Sheets.Close", "Close"))}"><i class="fas fa-times"></i></button>
      </div>
    `;

    document.body.appendChild(el);

    el.querySelectorAll("[data-step]").forEach(btn => {
      btn.addEventListener("click", () => this.step(Number(btn.dataset.step)));
    });
    el.querySelector("[data-close]").addEventListener("click", () => this.hide());

    // Swipe up/down on the card pages through history too.
    let startY = 0;
    el.addEventListener("touchstart", (ev) => { startY = ev.touches[0]?.clientY ?? 0; }, { passive: true });
    el.addEventListener("touchend", (ev) => {
      const dy = (ev.changedTouches[0]?.clientY ?? 0) - startY;
      if (Math.abs(dy) < 50) return;
      if (dy > 0 && this.index === this.messages.length - 1) return this.hide();
      this.step(dy > 0 ? 1 : -1);
    }, { passive: true });

    return el;
  }

  static step(direction) {
    const next = this.index + direction;
    if (next < 0 || next >= this.messages.length) return;
    this.index = next;
    this.renderCard();
  }

  static async renderCard() {
    const card = this.el?.querySelector("#mgk-stack-card");
    if (!card) return;

    const message = this.messages[this.index];
    this.el.querySelector("#mgk-stack-count").textContent = `${this.index + 1} / ${this.messages.length}`;
    if (!message) return (card.innerHTML = "");

    const html = await (message.renderHTML?.() ?? message.getHTML?.());
    const element = html instanceof HTMLElement ? html : html?.[0];

    card.innerHTML = "";
    if (element) card.appendChild(element);
    card.scrollTop = 0;
  }
}
