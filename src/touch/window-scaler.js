import { ChatStack } from '../ui/chat-stack.js';
import { ChatDrawer } from '../ui/chat-drawer.js';
import { SheetManager } from '../sheets/sheet-manager.js';

/**
 * Fits Foundry application windows (journals, handouts, item sheets, settings, dialogs)
 * inside a phone viewport.
 *
 * Foundry v13 renders most windows through ApplicationV2, but plenty of
 * modules and systems still use the v1 Application, so both hooks are wired.
 */
export class WindowScaler {
  static init() {
    for (const hook of ["renderApplicationV2", "renderApplication", "renderDocumentSheet", "renderDialog", "renderRollResolver"]) {
      Hooks.on(hook, (app, html) => this.scaleWindow(app, html));
    }
  }

  static resolveElement(app, html) {
    if (app?.element instanceof HTMLElement) return app.element;
    if (html instanceof HTMLElement) return html;
    return html?.[0] ?? null;
  }

  static scaleWindow(app, html) {
    const element = this.resolveElement(app, html);
    if (!element) return;
    if (element.closest("#mgk-sheet-drawer, .mgk-drawer-panel, .mgk-mobile-settings, .settings-config, #client-settings")) return;
    if (element.classList.contains("settings-config") || element.classList.contains("mgk-mobile-settings") || element.id === "client-settings") return;

    // Elevate dialogs/applications so they float above mobile sheet drawers (z-index 1000)
    const currentZ = parseInt(window.getComputedStyle(element).zIndex) || 100;
    if (currentZ < 1500) {
      element.style.zIndex = "1500";
    }

    // Auto-hide floating chat card, chat drawer, and sheet drawer when a roll dialog or window pops up
    if (ChatStack.visible) {
      ChatStack.hide();
    }
    if (ChatDrawer.isOpen) {
      ChatDrawer.close();
    }
    if (SheetManager.isOpen) {
      SheetManager.close();
    }

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Read after layout so offsetWidth is meaningful for freshly rendered apps.
    requestAnimationFrame(() => {
      const windowWidth = element.offsetWidth;
      const windowHeight = element.offsetHeight;
      if (!windowWidth || !windowHeight) return;

      element.style.maxWidth = `${screenWidth * 0.96}px`;
      element.style.maxHeight = `${screenHeight * 0.9}px`;

      const overflows = windowWidth > screenWidth * 0.96 || windowHeight > screenHeight * 0.9;
      if (!overflows) {
        element.style.transform = "";
        // Center unscaled dialogs on mobile viewport
        if (!element.dataset.mgkPositioned) {
          element.style.left = `${Math.max(0, (screenWidth - windowWidth) / 2)}px`;
          element.style.top = `${Math.max(0, (screenHeight - windowHeight) / 3)}px`;
          element.dataset.mgkPositioned = "1";
        }
        return;
      }

      const scale = Math.min(
        (screenWidth * 0.96) / windowWidth,
        (screenHeight * 0.9) / windowHeight,
        1
      );

      element.style.transformOrigin = "top left";
      element.style.transform = `scale(${scale})`;
      // Re-centre after scaling, since transform does not affect layout size.
      element.style.left = `${Math.max(0, (screenWidth - windowWidth * scale) / 2)}px`;
      element.style.top = `${Math.max(0, (screenHeight - windowHeight * scale) / 3)}px`;
      element.dataset.mgkPositioned = "1";
    });
  }
}
