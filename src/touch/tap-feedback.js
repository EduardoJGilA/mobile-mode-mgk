import { MODULE_ID } from '../core/utils.js';

const TAP_SLOP = 10;          // px of travel still considered a tap
const SUPPRESS_MS = 700;      // window in which the trailing native click is dropped
const HAPTIC_MS = 8;
// Past this the press belongs to a long-press handler (hotbar slots, Token HUD),
// so the tap must not fire on top of whatever that already did.
const LONG_PRESS_MS = 500;

/**
 * Makes the module's own UI respond to the finger instead of to the mouse.
 *
 * A `click` listener only fires once the browser has decided the gesture was
 * not a scroll, which lands well after the finger is already gone. That delay
 * is what makes a touch UI feel like a mouse UI. This handler watches the
 * pointer stream instead: it marks the element pressed the instant it is
 * touched, and fires the action on lift-off, then swallows the native click
 * that arrives afterwards so nothing runs twice.
 *
 * Every existing `click` listener keeps working untouched — the synthetic
 * click dispatched here is what reaches them, just sooner.
 */
export class TapFeedback {
  /** Tappable things this module draws. */
  static TARGETS = "button, [data-action], .mgk-nav-item, .mgk-pill, .mgk-status, .mgk-slot";

  /**
   * Controls that need the browser's own click: focusing a field, following a
   * link, or toggling a form control cannot be replayed by a synthetic one.
   */
  static EXEMPT = "input, textarea, select, option, label, a[href], [contenteditable], .mgk-bio-rich";

  static active = false;

  static init() {
    if (this.active) return;
    this.active = true;

    this.press = null;
    this.suppressTarget = null;
    this.suppressUntil = 0;

    this._onDown = this.onPointerDown.bind(this);
    this._onMove = this.onPointerMove.bind(this);
    this._onUp = this.onPointerUp.bind(this);
    this._onCancel = this.onPointerCancel.bind(this);
    this._onClick = this.onClick.bind(this);

    document.addEventListener("pointerdown", this._onDown, true);
    document.addEventListener("pointermove", this._onMove, true);
    document.addEventListener("pointerup", this._onUp, true);
    document.addEventListener("pointercancel", this._onCancel, true);
    // Capture, so the trailing native click is stopped before any handler sees it.
    document.addEventListener("click", this._onClick, true);
  }

  static destroy() {
    if (!this.active) return;
    this.active = false;
    this.clearPress();

    document.removeEventListener("pointerdown", this._onDown, true);
    document.removeEventListener("pointermove", this._onMove, true);
    document.removeEventListener("pointerup", this._onUp, true);
    document.removeEventListener("pointercancel", this._onCancel, true);
    document.removeEventListener("click", this._onClick, true);
  }

  static enabled(key) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch {
      // Settings not registered yet — behave as if switched on.
      return true;
    }
  }

  /** The element a touch should act on, or null if this module must not handle it. */
  static resolve(event) {
    if (event.pointerType === "mouse") return null;
    const target = event.target?.closest?.(this.TARGETS);
    if (!target || target.disabled) return null;
    if (target.closest(this.EXEMPT)) return null;
    // Only this module's own chrome; Foundry's UI and the canvas are left alone.
    if (!target.closest('[id^="mgk-"], [class*="mgk-"]')) return null;
    return target;
  }

  static haptic(ms = HAPTIC_MS) {
    if (this.enabled("touchHaptics") && navigator.vibrate) navigator.vibrate(ms);
  }

  static onPointerDown(event) {
    if (!this.enabled("touchFeedback")) return;
    const target = this.resolve(event);
    if (!target) return;

    this.clearPress();
    this.press = { target, id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now() };
    target.classList.add("mgk-pressed");
    this.haptic();
  }

  static onPointerMove(event) {
    const press = this.press;
    if (!press || event.pointerId !== press.id) return;

    // Travelled too far: this is a scroll or a drag, not a tap.
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP) this.clearPress();
  }

  static onPointerUp(event) {
    const press = this.press;
    if (!press || event.pointerId !== press.id) return;
    this.clearPress();

    // A long-press has its own handler and has already acted; stay out of it
    // and let the native click land (or not) as it always did.
    if (Date.now() - press.at > LONG_PRESS_MS) return;

    // The finger must lift over the element it pressed.
    const over = document.elementFromPoint(event.clientX, event.clientY);
    if (!over || (over !== press.target && !press.target.contains(over))) return;

    // Act now rather than waiting for the browser's click, and remember to drop
    // that click when it arrives.
    this.suppressTarget = press.target;
    this.suppressUntil = Date.now() + SUPPRESS_MS;
    press.target.click();
  }

  static onPointerCancel(event) {
    if (this.press && event.pointerId === this.press.id) this.clearPress();
  }

  /** Drop the browser's own click once the synthetic one already ran. */
  static onClick(event) {
    if (!event.isTrusted || !this.suppressTarget) return;
    if (Date.now() > this.suppressUntil) {
      this.suppressTarget = null;
      return;
    }
    const target = this.suppressTarget;
    if (event.target !== target && !target.contains(event.target)) return;

    this.suppressTarget = null;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  static clearPress() {
    this.press?.target.classList.remove("mgk-pressed");
    this.press = null;
  }
}
