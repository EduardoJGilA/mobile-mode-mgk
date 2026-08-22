import { MODULE_ID } from './utils.js';

/**
 * Device Detector Utility for Mobile Mode MGK
 */
export class DeviceDetector {
  /** True for real touch hardware. A narrow desktop window is not enough. */
  static isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  /** iPadOS 13+ reports itself as a Mac; the touch point count gives it away. */
  static isIOS() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  }

  static get shortestSide() {
    return Math.min(window.innerWidth, window.innerHeight);
  }

  static isPhone() {
    return this.isTouchDevice() && this.shortestSide <= 500;
  }

  static isTablet() {
    return this.isTouchDevice() && this.shortestSide > 500 && this.shortestSide <= 900;
  }

  /**
   * Whether the mobile UI should take over. The "forceMobile" setting lets a
   * user opt in from a desktop browser (useful for testing and for touch
   * laptops that would otherwise be misdetected).
   */
  static isMobileMode() {
    let forced = "auto";
    try {
      forced = game.settings.get(MODULE_ID, "forceMobile");
    } catch {
      // Settings not registered yet — fall back to detection.
    }
    if (forced === "on") return true;
    if (forced === "off") return false;
    return this.isTouchDevice() && this.shortestSide <= 900;
  }
}
