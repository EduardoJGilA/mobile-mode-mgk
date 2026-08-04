import './styles/mobile-mode-mgk.css';
import { MODULE_ID, t } from './core/utils.js';
import { DeviceDetector } from './core/device-detector.js';
import { SocketUtil } from './core/socket-util.js';
import { registerSettings } from './core/settings.js';
import { NotificationFilter } from './core/notification-filter.js';
import { WakeLock } from './core/wake-lock.js';
import { TouchGestureHandler } from './touch/gesture-handler.js';
import { TapFeedback } from './touch/tap-feedback.js';
import { KeyboardInset } from './touch/keyboard-inset.js';
import { WindowScaler } from './touch/window-scaler.js';
import { QuickControls } from './ui/quick-controls.js';
import { AvatarCarousel } from './ui/avatar-carousel.js';
import { ChatDrawer } from './ui/chat-drawer.js';
import { ChatStack } from './ui/chat-stack.js';
import { MacroHotbar } from './ui/macro-hotbar.js';
import { SheetManager } from './sheets/sheet-manager.js';
import { SheetInterceptor } from './sheets/sheet-interceptor.js';
import { TokenHudControls } from './touch/token-hud-controls.js';
import { RulerTouchHud } from './touch/ruler-touch-hud.js';
import { TemplatePlacer } from './touch/template-placer.js';
import { SheetOnly } from './standalone/sheet-only.js';
import { CanvasFreeze } from './performance/canvas-freeze.js';
import { MemoryDiagnostics } from './performance/memory-diagnostics.js';
import { ImageOptimizer } from './performance/image-optimizer.js';
import { ImageCompressor } from './performance/image-compressor.js';

const api = {
  gestureHandler: null,
  active: false,
  ImageOptimizer,
  ImageCompressor,
  MemoryDiagnostics,
  SheetManager,
  AvatarCarousel,
  ChatStack,
  TemplatePlacer,
  SheetOnly
};

console.log("Mobile Mode MGK | Loading module...");

Hooks.once("init", () => {
  registerSettings();
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = api;
});

Hooks.once("ready", () => {
  SocketUtil.init();

  if (!game.settings.get(MODULE_ID, "enableMobile")) {
    console.log("Mobile Mode MGK | Inactive: the 'enableMobile' setting is off.");
    return;
  }
  if (!DeviceDetector.isMobileMode()) {
    console.log(
      `Mobile Mode MGK | Inactive: not detected as a mobile device (touch=${DeviceDetector.isTouchDevice()}, `
      + `shortestSide=${DeviceDetector.shortestSide}px). Set "forceMobile" to "on" to override.`
    );
    return;
  }

  api.active = true;
  NotificationFilter.init();
  enableSafeAreaInsets();
  warnAboutInputConflicts();
  if (game.settings.get(MODULE_ID, "touchFeedback")) TapFeedback.init();
  if (game.settings.get(MODULE_ID, "keepScreenAwake")) WakeLock.init();
  KeyboardInset.init();
  document.body.classList.add("mobile-mode-mgk");
  if (game.settings.get(MODULE_ID, "hideNativeUI")) document.body.classList.add("mgk-hide-native");
  if (DeviceDetector.isIOS()) document.body.classList.add("mgk-ios");

  applyOrientationClass();
  window.addEventListener("resize", applyOrientationClass);
  window.addEventListener("orientationchange", applyOrientationClass);

  if (!game.settings.get(MODULE_ID, "hideQuickControls")) QuickControls.render();
  if (!game.settings.get(MODULE_ID, "hideAvatarCarousel")) AvatarCarousel.init();

  ChatStack.init();
  ChatDrawer.init();
  MacroHotbar.init();
  SheetManager.init();
  SheetInterceptor.init();
  WindowScaler.init();
  TokenHudControls.init();
  RulerTouchHud.init();

  // Sheet-only mode runs without a canvas, so the canvas features stay off.
  SheetOnly.init();
  if (!SheetOnly.enabled) CanvasFreeze.init();

  // On a fresh page load Foundry awaits the canvas *before* it fires "ready",
  // so the canvasReady hook below already ran while api.active was still false.
  // Without this the gesture handler would only exist after a scene change.
  if (canvas?.ready) initCanvasFeatures();
});

Hooks.on("canvasReady", () => {
  if (!api.active) return;
  initCanvasFeatures();
});

function initCanvasFeatures() {
  TouchGestureHandler.patchTokenDrag();

  // Rebuild the handler each scene, but tear the old one down first so its
  // listeners do not accumulate across scene changes.
  api.gestureHandler?.destroy();
  api.gestureHandler = new TouchGestureHandler();
  api.gestureHandler.init();

  MemoryDiagnostics.checkVramAlert();
}

Hooks.on("canvasTearDown", () => {
  TemplatePlacer.cancel();
  api.gestureHandler?.destroy();
  api.gestureHandler = null;
});

/**
 * Warn about modules that also take over canvas touch input.
 *
 * They intercept pointer events higher up and stop them dead, so this module's
 * gestures never fire and the canvas silently stops responding to the gestures
 * configured here. Nothing is disabled automatically — which module should win
 * is the user's call — but the reason has to be visible.
 */
function warnAboutInputConflicts() {
  const rivals = ["touch-vtt"].filter(id => game.modules.get(id)?.active);
  if (!rivals.length) return;

  const names = rivals.map(id => game.modules.get(id)?.title ?? id).join(", ");
  console.warn(
    `Mobile Mode MGK | ${names} also handles canvas touch input and intercepts it first. `
    + "The canvas gestures in this module will not run while it is active. Disable one of them."
  );
  ui.notifications?.warn(`${names}: ${t("Notifications.InputConflict", "another module is handling touch on the canvas.")}`);
}

/**
 * Let the page reach under the notch and the gesture bar.
 *
 * Foundry ships a viewport meta without `viewport-fit=cover`, and without that
 * every `env(safe-area-inset-*)` resolves to 0 — which silently disables all
 * the --mgk-safe-* padding in the stylesheet.
 */
function enableSafeAreaInsets() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || /viewport-fit/.test(meta.content)) return;
  meta.content = `${meta.content}, viewport-fit=cover`;
}

function applyOrientationClass() {
  const landscape = window.innerWidth > window.innerHeight;
  document.body.classList.toggle("mgk-landscape", landscape);
  document.body.classList.toggle("mgk-portrait", !landscape);
  document.body.classList.toggle("mgk-tablet", DeviceDetector.isTablet());
}
