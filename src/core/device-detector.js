/**
 * Device Detector Utility for Mobile Mode MGK
 */
export class DeviceDetector {
  static isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024);
  }

  static isPhone() {
    return this.isTouchDevice() && window.innerWidth <= 640;
  }

  static isTablet() {
    return this.isTouchDevice() && window.innerWidth > 640 && window.innerWidth <= 1024;
  }

  static isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
}
