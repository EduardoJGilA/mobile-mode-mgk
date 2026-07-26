import { esc, t } from '../core/utils.js';

const SHAPES = [
  { id: "circle", icon: "fa-circle", defaults: { distance: 10 } },
  { id: "cone", icon: "fa-play", defaults: { distance: 15, angle: 53, direction: 0 } },
  { id: "rect", icon: "fa-square", defaults: { distance: 15, direction: 45 } },
  { id: "ray", icon: "fa-arrows-left-right", defaults: { distance: 30, width: 1, direction: 0 } }
];

/**
 * Touch-friendly measured template placement.
 *
 * Tap a shape, tap the map to drop a live preview, then drag to size it and use
 * the rotation slider to aim. Nothing is written to the scene until the check
 * button is pressed.
 */
export class TemplatePlacer {
  static active = false;
  static shape = "circle";
  static preview = null;
  static toolbar = null;
  static origin = null;
  static _onTouch = null;
  static _onMove = null;

  static toggle() {
    if (this.active) this.cancel();
    else this.start();
  }

  static start() {
    if (!canvas?.ready) return;
    this.active = true;
    document.body.classList.add("mgk-placing-template");
    Hooks.callAll("mobileModeSuspendGestures", true);

    canvas.templates?.activate?.();
    this.renderToolbar();
    this.bindCanvas();
    ui.notifications?.info(t("Templates.TapToPlace", "Tap the map to place the template."));
  }

  static cancel() {
    this.active = false;
    document.body.classList.remove("mgk-placing-template");
    Hooks.callAll("mobileModeSuspendGestures", false);

    this.destroyPreview();
    this.toolbar?.remove();
    this.toolbar = null;
    this.unbindCanvas();
    this.origin = null;
  }

  /* -------------------------------------------- */
  /*  Toolbar                                     */
  /* -------------------------------------------- */

  static renderToolbar() {
    this.toolbar?.remove();

    const el = document.createElement("div");
    el.id = "mgk-template-toolbar";
    el.className = "mgk-template-toolbar";
    el.innerHTML = `
      <div class="mgk-template-shapes">
        ${SHAPES.map(s => `
          <button type="button" class="mgk-template-shape${s.id === this.shape ? " active" : ""}"
                  data-shape="${esc(s.id)}" aria-label="${esc(t(`Templates.${s.id}`, s.id))}">
            <i class="fas ${esc(s.icon)}"></i>
          </button>
        `).join("")}
        <button type="button" class="mgk-template-shape" data-clear="1"
                aria-label="${esc(t("Templates.ClearAll", "Remove my templates"))}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="mgk-template-readout">
        <span id="mgk-template-distance">—</span>
      </div>
      <div class="mgk-template-rotate">
        <i class="fas fa-rotate"></i>
        <input type="range" id="mgk-template-direction" min="0" max="359" step="1" value="0">
      </div>
      <div class="mgk-template-confirm">
        <button type="button" class="mgk-template-cancel" data-cancel="1" aria-label="${esc(t("Templates.Cancel", "Cancel"))}">
          <i class="fas fa-times"></i>
        </button>
        <button type="button" class="mgk-template-ok" data-confirm="1" aria-label="${esc(t("Templates.Confirm", "Place"))}">
          <i class="fas fa-check"></i>
        </button>
      </div>
    `;

    document.body.appendChild(el);
    this.toolbar = el;

    el.querySelectorAll("[data-shape]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.shape = btn.dataset.shape;
        el.querySelectorAll("[data-shape]").forEach(b => b.classList.toggle("active", b === btn));
        if (this.preview) this.rebuildPreview();
      });
    });

    el.querySelector("[data-clear]").addEventListener("click", () => this.clearOwnTemplates());
    el.querySelector("[data-cancel]").addEventListener("click", () => this.cancel());
    el.querySelector("[data-confirm]").addEventListener("click", () => this.confirm());

    el.querySelector("#mgk-template-direction").addEventListener("input", (ev) => {
      this.updatePreview({ direction: Number(ev.target.value) });
    });
  }

  static setReadout(text) {
    const el = document.getElementById("mgk-template-distance");
    if (el) el.textContent = text;
  }

  /* -------------------------------------------- */
  /*  Canvas interaction                          */
  /* -------------------------------------------- */

  static bindCanvas() {
    const view = canvas.app?.view;
    if (!view) return;

    const pointOf = (ev) => {
      const touch = ev.touches?.[0] ?? ev.changedTouches?.[0];
      if (!touch) return null;
      return canvas.canvasCoordinatesFromClient({ x: touch.clientX, y: touch.clientY });
    };

    // A new tap (re)positions the origin; dragging from it sets size and facing.
    this._onTouch = (ev) => {
      if (ev.touches?.length > 1) return;              // let two-finger pan through
      const point = pointOf(ev);
      if (!point) return;
      ev.preventDefault();
      this.destroyPreview();
      this.createPreview(point);
    };

    this._onMove = (ev) => {
      if (ev.touches?.length > 1 || !this.preview) return;
      const point = pointOf(ev);
      if (!point) return;
      ev.preventDefault();
      this.dragTo(point);
    };

    view.addEventListener("touchstart", this._onTouch, { passive: false });
    view.addEventListener("touchmove", this._onMove, { passive: false });
  }

  static unbindCanvas() {
    const view = canvas?.app?.view;
    if (view) {
      if (this._onTouch) view.removeEventListener("touchstart", this._onTouch);
      if (this._onMove) view.removeEventListener("touchmove", this._onMove);
    }
    this._onTouch = null;
    this._onMove = null;
  }

  /* -------------------------------------------- */
  /*  Preview lifecycle                           */
  /* -------------------------------------------- */

  static get shapeConfig() {
    return SHAPES.find(s => s.id === this.shape) ?? SHAPES[0];
  }

  static baseData(point) {
    return {
      t: this.shape,
      user: game.user.id,
      x: point.x,
      y: point.y,
      direction: 0,
      angle: 0,
      width: 1,
      fillColor: game.user.color?.css ?? game.user.color ?? "#8b5cf6",
      ...this.shapeConfig.defaults
    };
  }

  static async createPreview(point) {
    this.origin = point;
    const snapped = canvas.grid.getSnappedPoint(point, { mode: CONST.GRID_SNAPPING_MODES.VERTEX });

    const documentClass = CONFIG.MeasuredTemplate.documentClass;
    const objectClass = CONFIG.MeasuredTemplate.objectClass;

    const doc = new documentClass(this.baseData(snapped), { parent: canvas.scene });
    const object = new objectClass(doc);
    doc._object = object;

    canvas.templates.preview.addChild(object);
    await object.draw();

    this.preview = object;
    this.origin = snapped;
    this.setReadout(this.formatDistance(doc.distance));
  }

  static async rebuildPreview() {
    const origin = this.origin;
    this.destroyPreview();
    if (origin) await this.createPreview(origin);
  }

  /** Dragging away from the origin sets both distance and facing. */
  static dragTo(point) {
    if (!this.preview || !this.origin) return;

    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    const distance = this.pixelsToUnits(Math.hypot(dx, dy));
    const direction = Math.round((Math.toDegrees?.(Math.atan2(dy, dx)) ?? (Math.atan2(dy, dx) * 180 / Math.PI)) + 360) % 360;

    const update = { distance: Math.max(this.gridUnit, distance) };
    // Circles have no facing, so dragging only changes the radius.
    if (this.shape !== "circle") update.direction = direction;

    this.updatePreview(update);

    const slider = document.getElementById("mgk-template-direction");
    if (slider && update.direction !== undefined) slider.value = String(update.direction);
  }

  static updatePreview(changes) {
    const object = this.preview;
    if (!object) return;

    object.document.updateSource(changes);
    if (object.renderFlags?.set) object.renderFlags.set({ refreshShape: true, refreshPosition: true });
    else object.refresh?.();

    this.setReadout(this.formatDistance(object.document.distance));
  }

  static destroyPreview() {
    if (!this.preview) return;
    this.preview.destroy?.({ children: true });
    if (canvas?.templates?.preview) canvas.templates.preview.removeChildren();
    this.preview = null;
  }

  /* -------------------------------------------- */
  /*  Commit                                      */
  /* -------------------------------------------- */

  /**
   * Always run cancel(), even when the create fails. Leaving this method early
   * used to strand `mobileModeSuspendGestures` in the suspended state, which
   * killed token dragging until the page was reloaded.
   */
  static async confirm() {
    if (!this.preview) return this.cancel();
    try {
      const data = this.preview.document.toObject();
      this.destroyPreview();
      await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
    } catch (err) {
      console.error("Mobile Mode MGK | Could not place template", err);
      ui.notifications?.error(t("Templates.PlaceFailed", "Could not place the template."));
    } finally {
      this.cancel();
    }
  }

  static async clearOwnTemplates() {
    try {
      const mine = canvas.scene.templates.filter(tpl => tpl.author?.id === game.user.id || tpl.user === game.user.id);
      if (!mine.length) return ui.notifications?.info(t("Templates.NoneToRemove", "You have no templates here."));
      await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", mine.map(tpl => tpl.id));
    } catch (err) {
      console.error("Mobile Mode MGK | Could not remove templates", err);
      ui.notifications?.error(t("Templates.RemoveFailed", "Could not remove the templates."));
    }
  }

  /* -------------------------------------------- */
  /*  Units                                       */
  /* -------------------------------------------- */

  static get gridUnit() {
    return canvas.dimensions?.distance ?? 5;
  }

  static pixelsToUnits(pixels) {
    const size = canvas.dimensions?.size || 100;
    return (pixels / size) * this.gridUnit;
  }

  static formatDistance(distance) {
    const units = canvas.scene?.grid?.units ?? canvas.dimensions?.units ?? "";
    return `${(Number(distance) || 0).toFixed(2)} ${units}`.trim();
  }
}
