import { MODULE_ID, t } from '../core/utils.js';
import { MiniCanvas } from './mini-canvas.js';

/**
 * Sheet-only mode for memory-constrained devices (notably iOS, which reloads
 * a tab that grows past roughly 400MB).
 *
 * The PIXI canvas is the single largest consumer, so this mode leans on
 * Foundry's own "Disable Canvas" client setting and replaces the map with a
 * static background plus an optional lightweight radar. Everything else — the
 * character sheet, chat, carousel — keeps working, since none of it needs the
 * canvas.
 */
export class SheetOnly {
  static radar = null;
  static radarEl = null;

  static get enabled() {
    return game.settings.get(MODULE_ID, "sheetOnlyMode");
  }

  /** Foundry only honours noCanvas at load, so changing it requires a reload. */
  static async syncCoreSetting() {
    const wanted = this.enabled;
    if (game.settings.get("core", "noCanvas") === wanted) return false;
    await game.settings.set("core", "noCanvas", wanted);
    return true;
  }

  static init() {
    if (!this.enabled) return;

    document.body.classList.add("mgk-sheet-only");
    this.renderBackground();
    this.renderRadarToggle();
  }

  /** A plain CSS background costs a fraction of a PIXI scene texture. */
  static renderBackground() {
    const scene = game.scenes?.active ?? game.scenes?.current;
    const src = scene?.background?.src;

    let el = document.getElementById("mgk-static-bg");
    if (!el) {
      el = document.createElement("div");
      el.id = "mgk-static-bg";
      document.body.prepend(el);
    }

    // Escape quotes and backslashes so a path cannot break out of url("…").
    const safe = src ? src.replace(/["\\]/g, "\\$&") : "";
    el.style.backgroundImage = safe ? `url("${safe}")` : "";
    el.classList.toggle("empty", !src);
  }

  static renderRadarToggle() {
    const controls = document.getElementById("mgk-right-controls");
    if (!controls || document.getElementById("mgk-btn-radar")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mgk-floating-btn";
    button.id = "mgk-btn-radar";
    button.title = t("Standalone.Radar", "Radar");
    button.innerHTML = `<i class="fas fa-location-crosshairs"></i>`;
    button.addEventListener("click", () => this.toggleRadar(button));
    controls.prepend(button);
  }

  static toggleRadar(button) {
    if (this.radarEl) {
      this.radarEl.remove();
      this.radarEl = null;
      this.radar = null;
      button?.classList.remove("active");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "mgk-radar";
    wrapper.className = "mgk-radar";
    wrapper.innerHTML = `<canvas width="280" height="280"></canvas>`;
    document.body.appendChild(wrapper);

    this.radarEl = wrapper;
    this.radar = new MiniCanvas(wrapper.querySelector("canvas"));
    button?.classList.add("active");

    this.drawRadar();
    Hooks.on("updateToken", this._onTokenUpdate ??= () => this.drawRadar());
  }

  static drawRadar() {
    if (!this.radar) return;
    const scene = game.scenes?.active ?? game.scenes?.current;
    const token = this.activeToken(scene);
    this.radar.render(scene, token);
  }

  /** The token belonging to whichever owned actor the carousel has focused. */
  static activeToken(scene) {
    if (!scene) return null;
    const owned = scene.tokens.filter(tokenDoc => tokenDoc.actor?.isOwner);
    return owned[0] ?? null;
  }

  static destroy() {
    if (this._onTokenUpdate) Hooks.off("updateToken", this._onTokenUpdate);
    this._onTokenUpdate = null;
    this.radarEl?.remove();
    this.radarEl = null;
    this.radar = null;
    document.getElementById("mgk-static-bg")?.remove();
    document.body.classList.remove("mgk-sheet-only");
  }
}
