import { SocketUtil } from '../core/socket-util.js';
import { TemplatePlacer } from './template-placer.js';
import { t } from '../core/utils.js';

const TAP_SLOP = 12;          // px of travel still considered a tap
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 500;
const MIN_SCALE = 0.1;
const MAX_SCALE = 3.0;

/**
 * Touch Gesture Handler for Foundry Canvas
 *
 * 1 finger on a token  -> drag the token (live preview, wall-checked commit)
 * 1 finger on the map  -> pan the canvas
 * 2 fingers            -> pan + pinch-zoom anchored at the finger midpoint
 * tap                  -> select, tap again -> target
 * double tap           -> open the mobile sheet
 * long press           -> Token HUD
 */
export class TouchGestureHandler {
  constructor() {
    this.lastTapTime = 0;
    this.tapTimeout = null;
    this.longPressTimer = null;

    this.mode = null;              // "token" | "pan" | "pinch"
    this.draggedToken = null;
    this.grabOffset = { x: 0, y: 0 };
    this.touchStartPos = { x: 0, y: 0 };
    this.prevMid = null;
    this.prevDist = 0;
    this.moved = false;

    // Set while another tool (e.g. the template placer) owns single-finger input.
    this.suspended = false;

    this._view = null;
    this._onTouchStart = this.onTouchStart.bind(this);
    this._onTouchMove = this.onTouchMove.bind(this);
    this._onTouchEnd = this.onTouchEnd.bind(this);
  }

  init() {
    if (!canvas?.ready) return;
    const view = canvas.app?.view || document.getElementById("board");
    if (!view) return;

    this.destroy();
    this._view = view;

    view.addEventListener("touchstart", this._onTouchStart, { passive: false });
    view.addEventListener("touchmove", this._onTouchMove, { passive: false });
    view.addEventListener("touchend", this._onTouchEnd, { passive: false });
    view.addEventListener("touchcancel", this._onTouchEnd, { passive: false });

    this._onSuspend = (state) => { this.suspended = !!state; };
    Hooks.on("mobileModeSuspendGestures", this._onSuspend);
  }

  /** Remove every listener this handler installed. Safe to call twice. */
  destroy() {
    clearTimeout(this.longPressTimer);
    clearTimeout(this.tapTimeout);

    if (this._view) {
      this._view.removeEventListener("touchstart", this._onTouchStart);
      this._view.removeEventListener("touchmove", this._onTouchMove);
      this._view.removeEventListener("touchend", this._onTouchEnd);
      this._view.removeEventListener("touchcancel", this._onTouchEnd);
      this._view = null;
    }

    if (this._onSuspend) {
      Hooks.off("mobileModeSuspendGestures", this._onSuspend);
      this._onSuspend = null;
    }

    this.mode = null;
    this.draggedToken = null;
  }

  /* -------------------------------------------- */
  /*  Touch lifecycle                             */
  /* -------------------------------------------- */

  onTouchStart(e) {
    // Self-heal: if something suspended gestures and then failed to resume
    // them, the player would be stuck unable to move tokens until a reload.
    // The template placer is the only legitimate reason to stay suspended.
    if (this.suspended && !TemplatePlacer.active) this.suspended = false;

    // While suspended only two-finger pan/zoom stays available.
    if (this.suspended && e.touches.length < 2) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
      this.moved = false;

      const token = this.getTokenAtPosition(touch.clientX, touch.clientY);

      this.longPressTimer = setTimeout(() => {
        if (this.moved) return;
        const hit = this.getTokenAtPosition(touch.clientX, touch.clientY);
        if (!hit) return;
        hit.control({ releaseOthers: true });
        canvas.hud?.token?.bind(hit);
        this.mode = null;
        this.draggedToken = null;
      }, LONG_PRESS_MS);

      if (token?.isOwner) {
        this.mode = "token";
        this.draggedToken = token;
        const world = this.toWorld(touch.clientX, touch.clientY);
        this.grabOffset = { x: world.x - token.document.x, y: world.y - token.document.y };
      } else {
        this.mode = "pan";
        this.prevMid = { x: touch.clientX, y: touch.clientY };
      }
    } else if (e.touches.length === 2) {
      clearTimeout(this.longPressTimer);
      this.cancelTokenDrag();
      this.mode = "pinch";
      this.prevMid = this.getMidpoint(e.touches[0], e.touches[1]);
      this.prevDist = this.getDistance(e.touches[0], e.touches[1]);
    }
  }

  onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      clearTimeout(this.longPressTimer);
      if (this.mode !== "pinch") {
        this.mode = "pinch";
        this.prevMid = this.getMidpoint(e.touches[0], e.touches[1]);
        this.prevDist = this.getDistance(e.touches[0], e.touches[1]);
        return;
      }

      const mid = this.getMidpoint(e.touches[0], e.touches[1]);
      const dist = this.getDistance(e.touches[0], e.touches[1]);
      const factor = this.prevDist > 0 ? dist / this.prevDist : 1;
      const newScale = this.clamp(canvas.stage.scale.x * factor, MIN_SCALE, MAX_SCALE);

      // Keep the world point that was under the previous midpoint under the new one.
      this.anchorTo(this.prevMid, mid, newScale);

      this.prevMid = mid;
      this.prevDist = dist;
      return;
    }

    if (e.touches.length !== 1 || this.suspended) return;
    const touch = e.touches[0];

    if (!this.moved) {
      const travel = Math.hypot(touch.clientX - this.touchStartPos.x, touch.clientY - this.touchStartPos.y);
      if (travel <= TAP_SLOP) return;
      this.moved = true;
      clearTimeout(this.longPressTimer);
    }

    if (this.mode === "token" && this.draggedToken) {
      e.preventDefault();
      const world = this.toWorld(touch.clientX, touch.clientY);
      // Live preview only — the document is not touched until touchend.
      this.draggedToken.position.set(world.x - this.grabOffset.x, world.y - this.grabOffset.y);
    } else if (this.mode === "pan") {
      e.preventDefault();
      const mid = { x: touch.clientX, y: touch.clientY };
      this.anchorTo(this.prevMid, mid, canvas.stage.scale.x);
      this.prevMid = mid;
    }
  }

  async onTouchEnd(e) {
    clearTimeout(this.longPressTimer);
    if (e.touches.length > 0) return;   // fingers still down, wait for the last one
    if (this.suspended) {
      this.mode = null;
      this.draggedToken = null;
      return;
    }

    const wasMode = this.mode;
    const token = this.draggedToken;
    this.mode = null;
    this.draggedToken = null;

    if (wasMode === "token" && token && this.moved) {
      await this.commitTokenDrag(token);
      return;
    }

    if (!this.moved && e.changedTouches.length > 0) {
      this.handleTap(e.changedTouches[0]);
    }
  }

  /* -------------------------------------------- */
  /*  Token dragging                              */
  /* -------------------------------------------- */

  /** Token#w/h are not guaranteed across versions; derive from the document. */
  static sizeOf(token) {
    const w = token.w ?? (token.document.width * canvas.grid.sizeX);
    const h = token.h ?? (token.document.height * canvas.grid.sizeY);
    return { w, h };
  }

  async commitTokenDrag(token) {
    const { w, h } = TouchGestureHandler.sizeOf(token);
    const center = {
      x: token.position.x + w / 2,
      y: token.position.y + h / 2
    };
    const snappedCenter = canvas.grid.getSnappedPoint(center, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
    // getSnappedPoint returns a centre point; token.x/y are the top-left corner.
    const target = {
      x: snappedCenter.x - w / 2,
      y: snappedCenter.y - h / 2
    };

    const canMove = await SocketUtil.validateTokenMovement(token.id, target);
    if (canMove) {
      await token.document.update(target);
    } else {
      ui.notifications?.warn(t("Notifications.WallBlocked", "Movement blocked by a wall."));
      this.resetTokenPosition(token);
    }
  }

  cancelTokenDrag() {
    if (this.mode === "token" && this.draggedToken) this.resetTokenPosition(this.draggedToken);
    this.draggedToken = null;
  }

  resetTokenPosition(token) {
    if (!token?.document) return;
    token.position.set(token.document.x, token.document.y);
    token.renderFlags?.set({ refreshPosition: true });
  }

  /* -------------------------------------------- */
  /*  Taps                                        */
  /* -------------------------------------------- */

  handleTap(touch) {
    const now = Date.now();
    const timeDiff = now - this.lastTapTime;
    const token = this.getTokenAtPosition(touch.clientX, touch.clientY);

    if (timeDiff < DOUBLE_TAP_MS && timeDiff > 0) {
      clearTimeout(this.tapTimeout);
      this.lastTapTime = 0;
      if (token) Hooks.callAll("mobileModeOpenSheet", token.actor);
      return;
    }

    this.lastTapTime = now;
    this.tapTimeout = setTimeout(() => {
      if (!token) return;
      if (token.controlled) {
        // Already selected -> toggle targeting for *this* user only.
        const isMine = token.targeted.has(game.user);
        token.setTarget(!isMine, { releaseOthers: false });
      } else {
        token.control({ releaseOthers: true });
      }
    }, DOUBLE_TAP_MS);
  }

  /* -------------------------------------------- */
  /*  Geometry                                    */
  /* -------------------------------------------- */

  /**
   * Pan/zoom so the world point currently under `from` ends up under `to`.
   * Passing the unchanged scale makes this a pure pan.
   */
  anchorTo(from, to, newScale) {
    if (!from || !to || !this._view) return;
    const world = this.toWorld(from.x, from.y);
    const rect = this._view.getBoundingClientRect();
    const dx = (to.x - rect.left) - rect.width / 2;
    const dy = (to.y - rect.top) - rect.height / 2;
    canvas.pan({
      x: world.x - dx / newScale,
      y: world.y - dy / newScale,
      scale: newScale
    });
  }

  toWorld(clientX, clientY) {
    return canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
  }

  getTokenAtPosition(clientX, clientY) {
    if (!canvas?.ready) return null;
    const pos = this.toWorld(clientX, clientY);
    // Topmost token wins when several overlap.
    const hits = canvas.tokens.placeables.filter(tk => tk.visible && tk.bounds.contains(pos.x, pos.y));
    return hits.sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0] ?? null;
  }

  getMidpoint(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  getDistance(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
}
