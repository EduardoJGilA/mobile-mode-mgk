import './styles/mobile-mode-mgk.css';
import { DeviceDetector } from './core/device-detector.js';
import { SocketUtil } from './core/socket-util.js';
import { registerSettings } from './core/settings.js';
import { TouchGestureHandler } from './touch/gesture-handler.js';
import { WindowScaler } from './touch/window-scaler.js';
import { QuickControls } from './ui/quick-controls.js';
import { AvatarCarousel } from './ui/avatar-carousel.js';
import { ChatDrawer } from './ui/chat-drawer.js';
import { MacroHotbar } from './ui/macro-hotbar.js';
import { SheetManager } from './sheets/sheet-manager.js';
import { CanvasFreeze } from './performance/canvas-freeze.js';
import { MemoryDiagnostics } from './performance/memory-diagnostics.js';

console.log("Mobile Mode MGK | Loading module...");

Hooks.once("init", () => {
  console.log("Mobile Mode MGK | Initializing...");
  registerSettings();
});

Hooks.once("ready", () => {
  console.log("Mobile Mode MGK | Ready hook...");
  SocketUtil.init();

  if (!game.settings.get("mobile-mode-mgk", "enableMobile")) return;

  const isTouch = DeviceDetector.isTouchDevice();
  if (isTouch) {
    document.body.classList.add("mobile-mode-mgk");

    // Initialize UI components
    if (!game.settings.get("mobile-mode-mgk", "hideQuickControls")) {
      QuickControls.render();
    }
    if (!game.settings.get("mobile-mode-mgk", "hideAvatarCarousel")) {
      AvatarCarousel.render();
    }

    ChatDrawer.init();
    MacroHotbar.init();
    SheetManager.init();
    WindowScaler.init();
    CanvasFreeze.init();
  }
});

Hooks.on("canvasReady", () => {
  if (document.body.classList.contains("mobile-mode-mgk")) {
    const gestureHandler = new TouchGestureHandler();
    gestureHandler.init();

    // Check VRAM memory diagnostic threshold
    MemoryDiagnostics.checkVramAlert();
  }
});
