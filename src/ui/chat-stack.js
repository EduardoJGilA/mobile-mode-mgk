import { esc, t } from '../core/utils.js';

const HISTORY = 40;

/**
 * A single chat message floating over the map.
 *
 * The newest message takes the card. Chevrons page through recent history, and
 * tapping the counter opens a scrubber for jumping straight to an older entry,
 * so a roll result stays reachable without opening the full drawer.
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
      <div class="mgk-stack-pager" id="mgk-stack-pager">
        <!-- Close sits on the left: the right edge is where the floating dice
             and chat buttons overlap, which made it untappable. -->
        <button type="button" class="mgk-stack-close" data-close="1"
                aria-label="${esc(t("Sheets.Close", "Close"))}"><i class="fas fa-times"></i></button>
        <button type="button" data-step="-1" aria-label="${esc(t("Chat.Older", "Older"))}"><i class="fas fa-chevron-up"></i></button>
        <button type="button" id="mgk-stack-count" class="mgk-stack-count"
                aria-label="${esc(t("Chat.Jump", "Jump to a message"))}">1 / 1</button>
        <button type="button" data-step="1" aria-label="${esc(t("Chat.Newer", "Newer"))}"><i class="fas fa-chevron-down"></i></button>
      </div>
      <div class="mgk-stack-scrub" id="mgk-stack-scrub" hidden>
        <input type="range" id="mgk-stack-range" min="1" max="1" step="1" value="1"
               aria-label="${esc(t("Chat.Jump", "Jump to a message"))}">
        <span id="mgk-stack-scrub-label">1 / 1</span>
        <button type="button" id="mgk-stack-latest">${esc(t("Chat.Latest", "Latest"))}</button>
        <button type="button" id="mgk-stack-scrub-done" aria-label="${esc(t("Sheets.Close", "Close"))}"><i class="fas fa-check"></i></button>
      </div>
    `;

    document.body.appendChild(el);

    el.querySelectorAll("[data-step]").forEach(btn => {
      btn.addEventListener("click", () => this.step(Number(btn.dataset.step)));
    });
    el.querySelector("[data-close]").addEventListener("click", () => this.hide());

    // Tapping the counter turns it into a scrubber, which beats tapping an
    // arrow eighty times to reach an old roll.
    el.querySelector("#mgk-stack-count").addEventListener("click", () => this.toggleScrub(true));
    el.querySelector("#mgk-stack-scrub-done").addEventListener("click", () => this.toggleScrub(false));
    el.querySelector("#mgk-stack-latest").addEventListener("click", () => {
      this.jumpToLatest();
      this.toggleScrub(false);
    });

    const range = el.querySelector("#mgk-stack-range");
    range.addEventListener("input", () => {
      this.index = Number(range.value) - 1;
      this.renderCard();
    });

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

  static toggleScrub(open) {
    const pager = this.el?.querySelector("#mgk-stack-pager");
    const scrub = this.el?.querySelector("#mgk-stack-scrub");
    if (!pager || !scrub) return;
    pager.hidden = open;
    scrub.hidden = !open;
    if (open) this.syncScrub();
  }

  static syncScrub() {
    const range = this.el?.querySelector("#mgk-stack-range");
    const label = this.el?.querySelector("#mgk-stack-scrub-label");
    if (!range) return;
    range.max = String(Math.max(1, this.messages.length));
    range.value = String(this.index + 1);
    if (label) label.textContent = `${this.index + 1} / ${this.messages.length}`;
  }

  static _renderToken = 0;

  static async renderCard() {
    const card = this.el?.querySelector("#mgk-stack-card");
    if (!card) return;

    const message = this.messages[this.index];
    this.el.querySelector("#mgk-stack-count").textContent = `${this.index + 1} / ${this.messages.length}`;
    this.syncScrub();

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
