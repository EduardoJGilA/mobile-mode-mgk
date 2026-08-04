/**
 * Redirects desktop actor sheets to the mobile drawer.
 *
 * Catches render hooks for ActorSheet windows only, preventing unwanted native
 * desktop actor windows from covering the mobile layout while allowing item sheets,
 * roll dialogs, and HUD applications to function normally.
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
    if (this.bypass || !app) return;

    // Must strictly be an ActorSheet instance, not an ItemSheet, RollDialog, or HUD
    const name = app?.constructor?.name?.toLowerCase() ?? "";
    // v13 moved ActorSheet under foundry.appv1; touching the global logs a
    // deprecation warning on every sheet render.
    const ActorSheetClass = foundry.appv1?.sheets?.ActorSheet ?? globalThis.ActorSheet;
    const isActorSheet = app instanceof (ActorSheetClass ?? class {})
      || name.includes("actorsheet")
      || (app?.document?.documentName === "Actor" && (name.includes("sheet") || app?.options?.classes?.includes("sheet")));

    if (!isActorSheet) return;

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
      await actor.sheet?.render(true);
    } finally {
      setTimeout(() => { this.bypass = false; }, 1000);
    }
  }
}
