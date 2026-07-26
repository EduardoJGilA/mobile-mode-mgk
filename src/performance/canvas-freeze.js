import { MODULE_ID } from '../core/utils.js';

const WAKE_EVENTS = ["pointerdown", "pointermove", "touchstart", "wheel", "keydown"];

/**
 * Stops canvas rendering while the player is idle. On phones this is the single
 * biggest win for battery life and thermal throttling.
 */
export class CanvasFreeze {
  static idleTimer = null;
  static isFrozen = false;
  static _wake = null;

  static init() {
    if (!game.settings.get(MODULE_ID, "enableCanvasFreeze")) return;

    this._wake = () => this.resetIdleTimer();
    for (const event of WAKE_EVENTS) {
      window.addEventListener(event, this._wake, { passive: true });
    }

    // Foundry's own activity should also count as "not idle".
    Hooks.on("canvasPan", this._wake);
    Hooks.on("createChatMessage", this._wake);

    this.resetIdleTimer();
  }

  static get delayMs() {
    return (game.settings.get(MODULE_ID, "canvasFreezeDelay") || 15) * 1000;
  }

  static resetIdleTimer() {
    if (this.isFrozen) this.unfreezeCanvas();
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.freezeCanvas(), this.delayMs);
  }

  static freezeCanvas() {
    const ticker = canvas?.app?.ticker;
    if (!ticker || this.isFrozen) return;
    // Render one last frame so the frozen image is current, then stop.
    canvas.app.render();
    ticker.stop();
    this.isFrozen = true;
    document.body.classList.add("mgk-frozen");
  }

  static unfreezeCanvas() {
    const ticker = canvas?.app?.ticker;
    if (!ticker || !this.isFrozen) return;
    ticker.start();
    this.isFrozen = false;
    document.body.classList.remove("mgk-frozen");
  }

  static destroy() {
    clearTimeout(this.idleTimer);
    if (!this._wake) return;
    for (const event of WAKE_EVENTS) window.removeEventListener(event, this._wake);
    Hooks.off("canvasPan", this._wake);
    Hooks.off("createChatMessage", this._wake);
    this._wake = null;
  }
}
