/**
 * Keeps the on-screen keyboard from covering what is being typed.
 *
 * A soft keyboard shrinks the *visual* viewport but leaves the layout viewport
 * at full height, so a `position: fixed; inset: 0` drawer keeps its size and
 * the bottom half of it ends up behind the keys. This publishes the keyboard's
 * height as `--mgk-kb` and flags the body, letting the stylesheet pull the
 * drawers up; the focused field is then scrolled into what is still visible.
 */

// Below this a viewport change is the URL bar collapsing, not a keyboard.
const KEYBOARD_MIN_PX = 80;

export class KeyboardInset {
  static active = false;

  static init() {
    if (this.active || !window.visualViewport) return;
    this.active = true;

    this._onViewport = () => this.measure();
    this._onFocusIn = (event) => this.onFocusIn(event);

    window.visualViewport.addEventListener("resize", this._onViewport);
    window.visualViewport.addEventListener("scroll", this._onViewport);
    document.addEventListener("focusin", this._onFocusIn);
    this.measure();
  }

  static destroy() {
    if (!this.active) return;
    this.active = false;

    window.visualViewport.removeEventListener("resize", this._onViewport);
    window.visualViewport.removeEventListener("scroll", this._onViewport);
    document.removeEventListener("focusin", this._onFocusIn);

    document.body.classList.remove("mgk-keyboard-open");
    document.documentElement.style.removeProperty("--mgk-kb");
  }

  static measure() {
    const vv = window.visualViewport;
    const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const open = inset >= KEYBOARD_MIN_PX;

    document.documentElement.style.setProperty("--mgk-kb", `${open ? inset : 0}px`);
    document.body.classList.toggle("mgk-keyboard-open", open);
    return open;
  }

  static onFocusIn(event) {
    const field = event.target;
    if (!field?.matches?.("input, textarea, select, [contenteditable]")) return;

    // The keyboard animates in, so the viewport is still full-height right now.
    // Re-measure on the next viewport change and scroll once it has settled.
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => {
      if (!this.measure()) return;
      if (document.activeElement !== field) return;
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }
}
