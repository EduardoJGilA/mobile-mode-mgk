/**
 * Window Scaler & Touch Header Dragging for Application Windows
 */
export class WindowScaler {
  static init() {
    Hooks.on("renderApplication", (app, html) => {
      this.scaleWindow(app, html);
    });

    Hooks.on("renderDocumentSheet", (app, html) => {
      this.scaleWindow(app, html);
    });
  }

  static scaleWindow(app, html) {
    if (window.innerWidth > 1024) return;

    const element = html[0] || html;
    if (!element || !(element instanceof HTMLElement)) return;

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const windowWidth = element.offsetWidth || 400;
    const windowHeight = element.offsetHeight || 500;

    if (windowWidth > screenWidth * 0.95 || windowHeight > screenHeight * 0.9) {
      const scaleX = (screenWidth * 0.92) / windowWidth;
      const scaleY = (screenHeight * 0.85) / windowHeight;
      const scale = Math.min(scaleX, scaleY, 1.0);

      element.style.transformOrigin = "top left";
      element.style.transform = `scale(${scale})`;
      element.style.maxWidth = `${screenWidth * 0.95}px`;
    }
  }
}
