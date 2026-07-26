/**
 * Fits Foundry application windows (journals, handouts, item sheets, settings)
 * inside a phone viewport.
 *
 * Foundry v13 renders most windows through ApplicationV2, but plenty of
 * modules and systems still use the v1 Application, so both hooks are wired.
 */
export class WindowScaler {
  static init() {
    for (const hook of ["renderApplicationV2", "renderApplication", "renderDocumentSheet"]) {
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
    if (element.closest("#mgk-sheet-drawer, .mgk-drawer-panel")) return;

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
      element.style.top = `${Math.max(0, (screenHeight - windowHeight * scale) / 2)}px`;
    });
  }
}
