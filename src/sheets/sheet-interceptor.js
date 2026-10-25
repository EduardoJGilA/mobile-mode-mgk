/**
 * Redirects desktop actor sheets to the mobile drawer.
 *
 * Catches render hooks for ActorSheet windows only, preventing unwanted native
 * desktop actor windows from covering the mobile layout while allowing item sheets,
 * roll dialogs, and HUD applications to function normally.
 */
export class SheetInterceptor {
  /** Sheets deliberately opened via "Open full sheet"; left alone until closed. */
  static native = new WeakSet();

  static init() {
    for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderApplicationV2", "renderApplication"]) {
      Hooks.on(hook, (app) => this.onRender(app));
    }
    // Every edit re-renders the sheet, so the exemption must outlive the first render.
    for (const hook of ["closeApplicationV2", "closeApplication"]) {
      Hooks.on(hook, (app) => this.native.delete(app));
    }
  }

  static onRender(app) {
    if (!app || this.native.has(app)) return;

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
    // Only the actor's own sheet; importer/builder windows (e.g. Plutonium) pass through.
    if (app !== actor.sheet) return;
    if (typeof actor.isOwner === "boolean" && !actor.isOwner) return;

    Promise.resolve().then(() => {
      app.close?.({ animate: false });
      Hooks.callAll("mobileModeOpenSheet", actor);
    });
  }

  /** Open the genuine Foundry sheet and keep it open while the user edits. */
  static async openNative(actor) {
    const sheet = actor?.sheet;
    if (!sheet) return;
    this.native.add(sheet);
    await sheet.render(true);
  }
}
