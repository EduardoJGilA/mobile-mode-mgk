import { MODULE_ID } from './utils.js';

/**
 * Keeps the screen awake while the game is on screen.
 *
 * A phone dims and locks after half a minute of not being touched, which on a
 * table means the screen is dark for most of someone else's turn. The lock is
 * dropped automatically whenever the tab is hidden — the browser revokes it on
 * its own, and holding one for a backgrounded tab would only cost battery.
 */
export class WakeLock {
  static sentinel = null;
  static active = false;

  static init() {
    if (this.active) return;
    if (!("wakeLock" in navigator)) {
      console.log("Mobile Mode MGK | Screen Wake Lock is not available in this browser.");
      return;
    }
    this.active = true;

    this._onVisibility = () => {
      if (document.visibilityState === "visible") this.request();
      else this.sentinel = null;   // already released by the browser
    };
    document.addEventListener("visibilitychange", this._onVisibility);
    this.request();
  }

  static async request() {
    if (!this.active || this.sentinel || document.visibilityState !== "visible") return;
    if (!game.settings.get(MODULE_ID, "keepScreenAwake")) return;

    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      // Fires when the browser reclaims it, e.g. on low battery.
      this.sentinel.addEventListener("release", () => { this.sentinel = null; });
    } catch (err) {
      // Denied by the browser (battery saver, no user gesture yet). Not fatal.
      console.log("Mobile Mode MGK | Screen Wake Lock refused:", err?.message ?? err);
      this.sentinel = null;
      this.retryAfterGesture();
    }
  }

  /**
   * Some browsers only grant the lock once the page has been interacted with,
   * and "ready" fires long before anyone touches anything. Try once more on the
   * first touch, then stop bothering.
   */
  static retryAfterGesture() {
    if (this._retryQueued) return;
    this._retryQueued = true;
    const retry = () => {
      this._retryQueued = false;
      this.request();
    };
    window.addEventListener("pointerdown", retry, { once: true, passive: true });
  }

  static async release() {
    const sentinel = this.sentinel;
    this.sentinel = null;
    try {
      await sentinel?.release();
    } catch {
      // Already gone; nothing to do.
    }
  }

  static destroy() {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener("visibilitychange", this._onVisibility);
    this.release();
  }
}
