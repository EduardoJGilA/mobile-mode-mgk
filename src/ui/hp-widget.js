import { esc, t } from '../core/utils.js';

/**
 * Touch HP editor: -/+ stepper, healing/damage application, temp HP and temp max.
 * Mirrors the HP popover in the Swipe-VTT demo.
 */
export class HpWidget {
  static current = null;

  /**
   * @param {Actor} actor
   * @param {object} paths  Dot paths into the actor for value/max/temp/tempmax.
   */
  static open(actor, paths) {
    if (!actor) return;
    this.close();

    const get = (p) => (p ? foundry.utils.getProperty(actor, p) : undefined);
    const value = Number(get(paths.value)) || 0;
    const max = Number(get(paths.max)) || 0;
    const temp = Number(get(paths.temp)) || 0;
    const tempmax = Number(get(paths.tempmax)) || 0;

    const el = document.createElement("div");
    el.id = "mgk-hp-widget";
    el.className = "mgk-hp-widget";
    el.innerHTML = `
      <div class="mgk-hp-total">${esc(value)} / ${esc(max)}</div>
      <div class="mgk-hp-stepper">
        <button type="button" class="mgk-hp-step" data-step="-1" aria-label="-1"><i class="fas fa-minus"></i></button>
        <input type="number" class="mgk-hp-amount" inputmode="numeric" pattern="[0-9]*" value="0">
        <button type="button" class="mgk-hp-step" data-step="1" aria-label="+1"><i class="fas fa-plus"></i></button>
      </div>
      <div class="mgk-hp-actions">
        <button type="button" class="mgk-hp-heal" data-mode="heal"><i class="fas fa-heart"></i> ${esc(t("Sheets.Healing", "Healing"))}</button>
        <button type="button" class="mgk-hp-damage" data-mode="damage"><i class="fas fa-burst"></i> ${esc(t("Sheets.Damage", "Damage"))}</button>
      </div>
      ${paths.temp ? this._rowHtml("temp", t("Sheets.TempHp", "Temp. HP"), temp) : ""}
      ${paths.tempmax ? this._rowHtml("tempmax", t("Sheets.TempMax", "Temp. Max"), tempmax) : ""}
    `;

    document.body.appendChild(el);
    this.current = el;

    const amountInput = el.querySelector(".mgk-hp-amount");

    el.querySelectorAll(".mgk-hp-step").forEach(btn => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.step);
        amountInput.value = String(Math.max(0, (Number(amountInput.value) || 0) + step));
      });
    });

    el.querySelectorAll(".mgk-hp-actions button").forEach(btn => {
      btn.addEventListener("click", async () => {
        const amount = Math.abs(Number(amountInput.value) || 0);
        if (!amount) return this.close();
        const delta = btn.dataset.mode === "heal" ? amount : -amount;
        await this.applyDelta(actor, paths, delta);
        this.close();
      });
    });

    el.querySelectorAll(".mgk-hp-row").forEach(row => {
      const field = row.dataset.field;
      row.querySelector("button").addEventListener("click", async () => {
        const raw = Number(row.querySelector("input").value) || 0;
        await actor.update({ [paths[field]]: raw });
        this.close();
      });
    });

    // Tapping outside dismisses, matching the rest of the mobile UI.
    setTimeout(() => document.addEventListener("pointerdown", this._outsideHandler, true), 0);
  }

  static _rowHtml(field, label, value) {
    return `
      <div class="mgk-hp-row" data-field="${esc(field)}">
        <span>${esc(label)}</span>
        <input type="number" inputmode="numeric" pattern="[0-9]*" value="${esc(value)}">
        <button type="button" aria-label="${esc(label)}"><i class="fas fa-angles-right"></i></button>
      </div>
    `;
  }

  /**
   * Apply a signed HP delta. Damage eats temporary HP first, which is the
   * behaviour every supported system expects.
   */
  static async applyDelta(actor, paths, delta) {
    const get = (p) => (p ? Number(foundry.utils.getProperty(actor, p)) || 0 : 0);
    const value = get(paths.value);
    const max = get(paths.max);
    const temp = get(paths.temp);

    const update = {};

    if (delta < 0 && paths.temp && temp > 0) {
      const absorbed = Math.min(temp, -delta);
      update[paths.temp] = temp - absorbed;
      delta += absorbed;
    }

    if (delta !== 0) {
      const raw = value + delta;
      update[paths.value] = max > 0 ? Math.max(0, Math.min(max, raw)) : Math.max(0, raw);
    }

    if (Object.keys(update).length) await actor.update(update);
  }

  static _outsideHandler = (ev) => {
    const el = HpWidget.current;
    if (el && !el.contains(ev.target)) HpWidget.close();
  };

  static close() {
    document.removeEventListener("pointerdown", this._outsideHandler, true);
    this.current?.remove();
    this.current = null;
  }
}
