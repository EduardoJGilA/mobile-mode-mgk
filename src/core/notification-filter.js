/**
 * Silences Foundry's "your window is too small" warning.
 *
 * That warning exists to tell a desktop user to resize. On a phone the
 * resolution is never going to change, so it is pure noise: it fires on load,
 * again on every rotation, and it is marked permanent so it sits on screen
 * until dismissed by hand.
 *
 * Only this one message is filtered. Everything else Foundry wants to say
 * still gets through.
 */

/**
 * Keys Foundry has used for the low-resolution warning across versions.
 *
 * v13 splits it into three cases (small screen, browser zoom, small window)
 * and passes the key itself to `notify`, localizing it only afterwards — so
 * the raw key is what the filter sees for those.
 */
const RESOLUTION_KEYS = [
  "ERROR.RESOLUTION.Screen",
  "ERROR.RESOLUTION.Scale",
  "ERROR.RESOLUTION.Window",
  "ERROR.LowResolution",
  "ERROR.ResolutionTooLow",
  "WARNING.LowResolution"
];

/** Fallback for translations whose key we do not know. */
const RESOLUTION_PATTERNS = [
  /minimum supported resolution/i,
  /window is too small/i,
  /requires (a screen resolution|usable window dimensions|a usable window)/i,
  /resoluci[oó]n m[ií]nima/i,
  /ventana es demasiado peque/i,
  /requiere (una resoluci[oó]n|unas dimensiones)/i
];

export class NotificationFilter {
  static init() {
    if (!ui.notifications) return;

    const phrases = RESOLUTION_KEYS
      .map(key => game.i18n.localize(key))
      // localize() echoes the key back when it is missing, so drop those.
      .filter(text => text && !RESOLUTION_KEYS.includes(text));

    const isResolutionWarning = (message) => {
      if (typeof message !== "string") return false;
      // v13 hands `notify` the untranslated key, so match that first.
      if (RESOLUTION_KEYS.includes(message)) return true;
      if (phrases.some(phrase => message.includes(phrase))) return true;
      return RESOLUTION_PATTERNS.some(pattern => pattern.test(message));
    };

    const original = ui.notifications.notify.bind(ui.notifications);
    ui.notifications.notify = function (message, type, options) {
      if (isResolutionWarning(message)) return;
      return original(message, type, options);
    };

    // One may already be on screen from before this ran.
    this.sweepExisting(isResolutionWarning);
  }

  static sweepExisting(isResolutionWarning) {
    const clear = () => {
      document.querySelectorAll("#notifications .notification").forEach(el => {
        if (isResolutionWarning(el.textContent ?? "")) el.remove();
      });
    };
    clear();
    // Foundry re-issues it shortly after load on some versions.
    setTimeout(clear, 2000);
  }
}
