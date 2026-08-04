import { esc, t } from '../core/utils.js';
import { SocketUtil } from '../core/socket-util.js';
import { restoreSelect } from '../core/scene-tools.js';

/**
 * Touch HUD for the Ruler Tool (TouchVTT style).
 *
 * Floats right next to the ruler endpoint while measuring distance on touch screens.
 * Provides 2 instant touch buttons:
 * - 👣 Move Token: Walks the controlled token along the measured path
 * - 🚩 Add Waypoint: Adds a waypoint node to measure around corners without a keyboard
 */
export class RulerTouchHud {
  static el = null;
  static active = false;

  static init() {
    // Patch Ruler prototype if present so every measurement frame updates our HUD
    const RulerClass = globalThis.Ruler;
    if (typeof RulerClass !== "undefined" && RulerClass.prototype) {
      const origMeasure = RulerClass.prototype.measure;
      const self = this;
      RulerClass.prototype.measure = function(...args) {
        const res = origMeasure.apply(this, args);
        self.update();
        return res;
      };

      const origClear = RulerClass.prototype.clear;
      RulerClass.prototype.clear = function(...args) {
        const res = origClear.apply(this, args);
        self.hide();
        return res;
      };
    }

    Hooks.on("drawRuler", () => this.update());
    Hooks.on("destroyRuler", () => this.hide());

    // Capture, because the gesture handler stops canvas pointer events at
    // <body> and a bubbling listener would never see a finger on the map.
    window.addEventListener("pointermove", () => {
      if (this.isRulerMeasuring()) this.update();
    }, { capture: true, passive: true });
    window.addEventListener("touchmove", () => {
      if (this.isRulerMeasuring()) this.update();
    }, { passive: true });
  }

  static getRuler() {
    return canvas.controls?.rulers?.get(game.user.id)
      ?? canvas.controls?.ruler
      ?? canvas.grid?.ruler
      ?? game.user?.ruler
      ?? null;
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

    const dest = ruler.destination ?? ruler.waypoints?.[ruler.waypoints.length - 1];
    if (!dest) return this.hide();

    const client = typeof canvas.clientCoordinatesFromCanvas === "function"
      ? canvas.clientCoordinatesFromCanvas(dest)
      : this.worldToClientFallback(dest);

    if (!this.el) this.el = this.create();

    // Position floating buttons near the tip of the measurement line
    this.el.style.left = `${Math.min(window.innerWidth - 60, Math.max(10, client.x + 20))}px`;
    this.el.style.top = `${Math.min(window.innerHeight - 100, Math.max(10, client.y - 80))}px`;

    this.show();
  }

  static worldToClientFallback(point) {
    const view = canvas.app?.canvas || canvas.app?.view || document.getElementById("board");
    const rect = view?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const scale = canvas.stage?.scale?.x ?? 1;
    return {
      x: rect.left + (point.x - (canvas.stage?.pivot?.x ?? 0)) * scale + rect.width / 2,
      y: rect.top + (point.y - (canvas.stage?.pivot?.y ?? 0)) * scale + rect.height / 2
    };
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
      <button type="button" class="mgk-ruler-btn mgk-ruler-walk" data-action="walk" title="${esc(t("Ruler.Walk", "Move Token Here"))}" aria-label="${esc(t("Ruler.Walk", "Move Token Here"))}">
        <i class="fas fa-shoe-prints"></i>
      </button>
      <button type="button" class="mgk-ruler-btn" data-action="waypoint" title="${esc(t("Ruler.Waypoint", "Add Waypoint"))}" aria-label="${esc(t("Ruler.Waypoint", "Add Waypoint"))}">
        <i class="fas fa-flag"></i>
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
      const token = canvas.tokens.controlled[0] ?? game.user.character?.getActiveTokens()[0];

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
      }
    });

    return el;
  }
}
