import './styles/mobile-mode-mgk.css';
import { MODULE_ID } from './core/utils.js';
import { DeviceDetector } from './core/device-detector.js';
import { SocketUtil } from './core/socket-util.js';
import { registerSettings } from './core/settings.js';
import { NotificationFilter } from './core/notification-filter.js';
import { TouchGestureHandler } from './touch/gesture-handler.js';
import { WindowScaler } from './touch/window-scaler.js';
import { QuickControls } from './ui/quick-controls.js';
import { AvatarCarousel } from './ui/avatar-carousel.js';
import { ChatDrawer } from './ui/chat-drawer.js';
import { ChatStack } from './ui/chat-stack.js';
import { MacroHotbar } from './ui/macro-hotbar.js';
import { SheetManager } from './sheets/sheet-manager.js';
import { SheetInterceptor } from './sheets/sheet-interceptor.js';
import { TokenHudControls } from './touch/token-hud-controls.js';
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

  if (!game.settings.get(MODULE_ID, "enableMobile")) return;
  if (!DeviceDetector.isMobileMode()) return;

  api.active = true;
  NotificationFilter.init();
  document.body.classList.add("mobile-mode-mgk");
  if (game.settings.get(MODULE_ID, "hideNativeUI")) document.body.classList.add("mgk-hide-native");
  if (DeviceDetector.isIOS()) document.body.classList.add("mgk-ios");

  applyOrientationClass();
  window.addEventListener("resize", applyOrientationClass);
  window.addEventListener("orientationchange", applyOrientationClass);

  if (!game.settings.get(MODULE_ID, "hideQuickControls")) QuickControls.render();
  if (!game.settings.get(MODULE_ID, "hideAvatarCarousel")) AvatarCarousel.init();

  ChatDrawer.init();
  ChatStack.init();
  MacroHotbar.init();
  SheetManager.init();
  SheetInterceptor.init();
  WindowScaler.init();
  TokenHudControls.init();

  // Sheet-only mode runs without a canvas, so the canvas features stay off.
  SheetOnly.init();
  if (!SheetOnly.enabled) CanvasFreeze.init();
});

Hooks.on("canvasReady", () => {
  if (!api.active) return;

  // Rebuild the handler each scene, but tear the old one down first so its
  // listeners do not accumulate across scene changes.
  api.gestureHandler?.destroy();
  api.gestureHandler = new TouchGestureHandler();
  api.gestureHandler.init();

  MemoryDiagnostics.checkVramAlert();
});

Hooks.on("canvasTearDown", () => {
  TemplatePlacer.cancel();
  api.gestureHandler?.destroy();
  api.gestureHandler = null;
});

function applyOrientationClass() {
  const landscape = window.innerWidth > window.innerHeight;
  document.body.classList.toggle("mgk-landscape", landscape);
  document.body.classList.toggle("mgk-portrait", !landscape);
  document.body.classList.toggle("mgk-tablet", DeviceDetector.isTablet());
}
