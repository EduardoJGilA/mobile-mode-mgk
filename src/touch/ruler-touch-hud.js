import { esc, t } from '../core/utils.js';
import { SocketUtil } from '../core/socket-util.js';
import { restoreSelect } from '../core/scene-tools.js';

/**
 * Touch HUD for the Ruler Tool.
 *
 * Appears when measuring distance on touch screens. Allows players to:
 * - 🚩 Add a waypoint along the measured path (no keyboard Space bar needed)
 * - 👣 Move their controlled token to the destination
 * - ❌ Clear the ruler
 */
export class RulerTouchHud {
  static el = null;
  static active = false;

  static init() {
    Hooks.on("drawRuler", () => this.update());
    Hooks.on("destroyRuler", () => this.hide());

    // Listen to mouse/touch move on canvas while measuring
    window.addEventListener("pointermove", () => {
      if (this.isRulerMeasuring()) this.update();
    });
  }

  static getRuler() {
    return canvas.controls?.ruler ?? canvas.grid?.ruler ?? game.user?.ruler ?? null;
  }

  static isRulerMeasuring() {
    const ruler = this.getRuler();
    return !!(ruler && (ruler.active || (ruler.waypoints && ruler.waypoints.length > 0)));
  }

  static update() {
    const ruler = this.getRuler();
    if (!ruler || (!ruler.active && (!ruler.waypoints || !ruler.waypoints.length))) {
      return this.hide();
    }
    this.show();
  }

  static show() {
    if (!this.el) this.el = this.create();
    this.el.classList.add("open");
    this.active = true;
  }

  static hide() {
    if (this.el) this.el.classList.remove("open");
    this.active = false;
  }

  static create() {
    const el = document.createElement("div");
    el.id = "mgk-ruler-hud";
    el.className = "mgk-ruler-hud";
    el.innerHTML = `
      <button type="button" class="mgk-ruler-btn" data-action="waypoint" title="${esc(t("Ruler.Waypoint", "Add Waypoint"))}" aria-label="${esc(t("Ruler.Waypoint", "Add Waypoint"))}">
        <i class="fas fa-flag"></i>
      </button>
      <button type="button" class="mgk-ruler-btn mgk-ruler-walk" data-action="walk" title="${esc(t("Ruler.Walk", "Move Token Here"))}" aria-label="${esc(t("Ruler.Walk", "Move Token Here"))}">
        <i class="fas fa-shoe-prints"></i>
      </button>
      <button type="button" class="mgk-ruler-btn mgk-ruler-clear" data-action="clear" title="${esc(t("Sheets.Close", "Clear"))}" aria-label="${esc(t("Sheets.Close", "Clear"))}">
        <i class="fas fa-times"></i>
      </button>
    `;

    document.body.appendChild(el);

    el.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();

      const action = btn.dataset.action;
      const ruler = this.getRuler();
      const token = canvas.tokens.controlled[0];

      switch (action) {
        case "waypoint": {
          if (ruler) {
            const destination = ruler.destination ?? ruler.waypoints?.[ruler.waypoints.length - 1];
            if (destination) {
              if (typeof ruler.addWaypoint === "function") ruler.addWaypoint(destination);
              else if (typeof ruler._addWaypoint === "function") ruler._addWaypoint(destination);
              else if (Array.isArray(ruler.waypoints)) ruler.waypoints.push(destination);
            }
          }
          break;
        }
        case "walk": {
          if (token && ruler) {
            const dest = ruler.destination ?? ruler.waypoints?.[ruler.waypoints.length - 1];
            if (dest) {
              const w = token.w ?? (token.document.width * canvas.grid.sizeX);
              const h = token.h ?? (token.document.height * canvas.grid.sizeY);
              const center = { x: dest.x, y: dest.y };
              const snapped = canvas.grid.getSnappedPoint(center, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
              const target = { x: snapped.x - w / 2, y: snapped.y - h / 2 };

              const canMove = await SocketUtil.validateTokenMovement(token.id, target);
              if (canMove) {
                await token.document.update(target);
              } else {
                ui.notifications?.warn(t("Notifications.WallBlocked", "Movement blocked by a wall."));
              }
            }
          }
          if (ruler?.clear) ruler.clear();
          this.hide();
          restoreSelect();
          break;
        }
        case "clear": {
          if (ruler?.clear) ruler.clear();
          this.hide();
          restoreSelect();
          break;
        }
      }
    });

    return el;
  }
}
