/**
 * Canvas Performance Freeze on Touch Idle
 */
export class CanvasFreeze {
  static idleTimer = null;
  static isFrozen = false;

  static init() {
    if (!game.settings.get("mobile-mode-mgk", "enableCanvasFreeze")) return;

    window.addEventListener("touchstart", () => this.resetIdleTimer(), { passive: true });
    window.addEventListener("touchmove", () => this.resetIdleTimer(), { passive: true });

    this.resetIdleTimer();
  }

  static resetIdleTimer() {
    if (this.isFrozen) {
      this.unfreezeCanvas();
    }

    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.freezeCanvas(), 15000); // 15s idle
  }

  static freezeCanvas() {
    if (!canvas?.app?.ticker || this.isFrozen) return;
    canvas.app.ticker.stop();
    this.isFrozen = true;
    console.log("Mobile Mode MGK | Canvas frozen for idle performance.");
  }

  static unfreezeCanvas() {
    if (!canvas?.app?.ticker || !this.isFrozen) return;
    canvas.app.ticker.start();
    this.isFrozen = false;
    console.log("Mobile Mode MGK | Canvas unfrozen.");
  }
}
