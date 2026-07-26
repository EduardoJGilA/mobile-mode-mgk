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
    // A new roll always wins: show it rather than whatever was being read.
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
    this.updateHeightVar();
  }

  static hide() {
    this.el?.classList.remove("open");
    document.body.classList.remove("mgk-stack-open");
    document.documentElement.style.setProperty("--mgk-stack-height", "0px");
  }

  /**
   * Publish the card's real height so the floating controls can sit above it.
   * The card is centred at the bottom and used to cover the dice and chat
   * buttons, making it impossible to roll while a message was on screen.
   */
  static updateHeightVar() {
    requestAnimationFrame(() => {
      const height = this.el?.offsetHeight ?? 0;
      document.documentElement.style.setProperty("--mgk-stack-height", `${height}px`);
    });
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

    // Swipe is bound to the grab handle only. Binding it to the whole panel
    // meant scrolling a long message paged the stack instead, which walked the
    // reader back to the oldest entry with no way to return.
    const grab = el.querySelector(".mgk-drawer-grab");
    let startY = 0;
    grab.addEventListener("touchstart", (ev) => { startY = ev.touches[0]?.clientY ?? 0; }, { passive: true });
    grab.addEventListener("touchend", (ev) => {
      const dy = (ev.changedTouches[0]?.clientY ?? 0) - startY;
      if (Math.abs(dy) < 50) return;
      if (dy > 0) return this.hide();
      this.step(1);
    }, { passive: true });

    return el;
  }

  static step(direction) {
    const next = this.index + direction;
    if (next < 0 || next >= this.messages.length) return;
    this.index = next;
    this.renderCard();
  }

  /** Jump straight to the newest entry, e.g. after rolling. */
  static jumpToLatest() {
    this.index = Math.max(0, this.messages.length - 1);
    this.renderCard();
  }

  static _renderToken = 0;

  static async renderCard() {
    const card = this.el?.querySelector("#mgk-stack-card");
    if (!card) return;

    const message = this.messages[this.index];
    this.el.querySelector("#mgk-stack-count").textContent = `${this.index + 1} / ${this.messages.length}`;

    // Disabled arrows make the ends of the history obvious.
    const older = this.el.querySelector('[data-step="-1"]');
    const newer = this.el.querySelector('[data-step="1"]');
    if (older) older.disabled = this.index <= 0;
    if (newer) newer.disabled = this.index >= this.messages.length - 1;

    if (!message) return (card.innerHTML = "");

    // Rendering is async, so a fast tapper can have several in flight at once.
    // Only the newest one is allowed to write into the card.
    const token = ++this._renderToken;
    const html = await (message.renderHTML?.() ?? message.getHTML?.());
    if (token !== this._renderToken) return;

    const element = html instanceof HTMLElement ? html : html?.[0];
    card.innerHTML = "";
    if (element) card.appendChild(element);
    card.scrollTop = 0;
  }
}
