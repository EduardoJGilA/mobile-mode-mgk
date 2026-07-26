/**
 * Redirects the desktop character sheet to the mobile drawer.
 *
 * Double-tapping a token makes Foundry open its own sheet as well as firing our
 * gesture, so the player got the cramped desktop window on top of the drawer.
 * Rather than trying to suppress every path that can open a sheet (token
 * double-click, Token HUD, carousel, macros, chat portraits), this catches the
 * render itself and swaps in the drawer.
 */
export class SheetInterceptor {
  /** Set while deliberately opening the real sheet, e.g. "Open full sheet". */
  static bypass = false;

  static init() {
    for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderApplicationV2", "renderApplication"]) {
      Hooks.on(hook, (app) => this.onRender(app));
    }
  }

  static onRender(app) {
    if (this.bypass) return;

    const actor = app?.actor ?? (app?.document?.documentName === "Actor" ? app.document : null);
    if (!actor || actor.documentName !== "Actor") return;
    if (typeof actor.isOwner === "boolean" && !actor.isOwner) return;

    Promise.resolve().then(() => {
      app.close?.({ animate: false });
      Hooks.callAll("mobileModeOpenSheet", actor);
    });
  }

  /** Open the genuine Foundry sheet, bypassing this interceptor once. */
  static async openNative(actor) {
    if (!actor) return;
    this.bypass = true;
    try {
      await actor.sheet.render(true);
    } finally {
      // Give the render hooks a frame to run before arming again.
      setTimeout(() => { this.bypass = false; }, 1000);
    }
  }
}
