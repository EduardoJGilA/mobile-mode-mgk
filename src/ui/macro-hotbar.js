import { esc, t } from '../core/utils.js';

const SLOTS_PER_PAGE = 10;
const PAGES = 5;
const LONG_PRESS_MS = 500;

/**
 * Touch macro hotbar: paged 5x2 grid, tap to execute, long-press to edit.
 */
export class MacroHotbar {
  static panel = null;
  static page = 1;

  static init() {
    Hooks.on("mobileModeToggleMacros", () => this.toggle());
    Hooks.on("updateUser", (user) => {
      if (user.id === game.user.id && this.panel) this.renderSlots();
    });
  }

  static toggle() {
    if (!this.panel) this.panel = this.createPanel();
    const open = this.panel.classList.toggle("open");
    if (open) this.renderSlots();
  }

  static createPanel() {
    const panel = document.createElement("div");
    panel.id = "mgk-macro-drawer";
    panel.className = "mgk-drawer-panel";
    panel.innerHTML = `
      <div class="mgk-drawer-grab"></div>
      <div class="mgk-drawer-header">
        <h3><i class="fas fa-th-large"></i> ${esc(t("Macros.Title", "Macro Hotbar"))}</h3>
        <button type="button" class="mgk-icon-btn" id="mgk-close-macros" aria-label="${esc(t("Sheets.Close", "Close"))}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="mgk-drawer-body"><div class="mgk-macro-grid" id="mgk-macro-grid"></div></div>
      <div class="mgk-macro-pager">
        <button type="button" data-page="-1" aria-label="${esc(t("Macros.Prev", "Previous page"))}"><i class="fas fa-chevron-left"></i></button>
        <span id="mgk-macro-page">1 / ${PAGES}</span>
        <button type="button" data-page="1" aria-label="${esc(t("Macros.Next", "Next page"))}"><i class="fas fa-chevron-right"></i></button>
      </div>
    `;

    document.body.appendChild(panel);
    panel.querySelector("#mgk-close-macros").addEventListener("click", () => panel.classList.remove("open"));

    panel.querySelectorAll(".mgk-macro-pager button").forEach(btn => {
      btn.addEventListener("click", () => {
        const next = this.page + Number(btn.dataset.page);
        this.page = ((next - 1 + PAGES) % PAGES) + 1;
        this.renderSlots();
      });
    });

    const grid = panel.querySelector("#mgk-macro-grid");
    this.attachSlotHandlers(grid);
    return panel;
  }

  /**
   * Tap executes, long press picks the macro up. While held, moving over
   * another slot and releasing moves the macro there — HTML5 drag and drop
   * does not fire on touch, so this is pointer-driven.
   */
  static attachSlotHandlers(grid) {
    let timer = null;
    let dragging = null;
    let longPressed = false;

    const clearHighlight = () => grid.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));

    const start = (ev) => {
      const slot = ev.target.closest(".mgk-macro-slot");
      if (!slot) return;
      longPressed = false;
      dragging = null;

      timer = setTimeout(() => {
        longPressed = true;
        if (!slot.dataset.macroId) return this.editSlot(Number(slot.dataset.slot));
        dragging = { from: Number(slot.dataset.slot), macroId: slot.dataset.macroId };
        slot.classList.add("dragging");
        if (navigator.vibrate) navigator.vibrate(15);
      }, LONG_PRESS_MS);
    };

    const move = (ev) => {
      if (!dragging) return clearTimeout(timer);
      ev.preventDefault();
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".mgk-macro-slot");
      clearHighlight();
      if (target && Number(target.dataset.slot) !== dragging.from) target.classList.add("drop-target");
    };

    const end = async (ev) => {
      clearTimeout(timer);
      if (!dragging) return;

      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".mgk-macro-slot");
      const from = dragging.from;
      const macroId = dragging.macroId;
      dragging = null;
      grid.querySelectorAll(".dragging").forEach(el => el.classList.remove("dragging"));
      clearHighlight();

      const to = target ? Number(target.dataset.slot) : null;
      if (to === null || to === from) return;
      await this.moveMacro(macroId, from, to);
    };

    grid.addEventListener("pointerdown", start);
    grid.addEventListener("pointermove", move);
    grid.addEventListener("pointerup", end);
    grid.addEventListener("pointercancel", () => {
      clearTimeout(timer);
      dragging = null;
      grid.querySelectorAll(".dragging").forEach(el => el.classList.remove("dragging"));
      clearHighlight();
    });

    grid.addEventListener("click", (ev) => {
      const slot = ev.target.closest(".mgk-macro-slot");
      if (!slot || longPressed) return;
      const macro = game.macros.get(slot.dataset.macroId);
      if (macro) macro.execute();
      else this.editSlot(Number(slot.dataset.slot));
    });
  }

  /**
   * Swap the two slots in a single user update so the UI never flickers.
   * Foundry merges object fields, so clearing a slot needs the `-=` prefix
   * rather than simply omitting the key.
   */
  static async moveMacro(macroId, from, to) {
    const displaced = game.user.hotbar?.[to];

    const update = { [`hotbar.${to}`]: macroId };
    if (displaced) update[`hotbar.${from}`] = displaced;
    else update[`hotbar.-=${from}`] = null;

    await game.user.update(update);
    this.renderSlots();
  }

  static renderSlots() {
    const grid = this.panel?.querySelector("#mgk-macro-grid");
    if (!grid) return;

    const hotbar = game.user.hotbar ?? {};
    const first = (this.page - 1) * SLOTS_PER_PAGE + 1;

    let html = "";
    for (let i = 0; i < SLOTS_PER_PAGE; i++) {
      const slot = first + i;
      const macro = game.macros.get(hotbar[slot]);
      html += `
        <button type="button" class="mgk-macro-slot" data-slot="${esc(slot)}" data-macro-id="${esc(macro?.id ?? "")}"
                title="${esc(macro?.name ?? "")}">
          ${macro ? `<img src="${esc(macro.img)}" alt="${esc(macro.name)}">` : `<span>${esc(slot)}</span>`}
        </button>
      `;
    }

    grid.innerHTML = html;
    this.panel.querySelector("#mgk-macro-page").textContent = `${this.page} / ${PAGES}`;
  }

  static editSlot(slot) {
    const macro = game.macros.get(game.user.hotbar?.[slot]);
    if (macro) return macro.sheet.render(true);
    ui.notifications?.info(t("Macros.EmptySlot", "Empty slot — drag a macro here from the desktop hotbar."));
  }
}
