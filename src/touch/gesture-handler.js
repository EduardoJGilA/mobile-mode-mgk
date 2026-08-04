import { SocketUtil } from '../core/socket-util.js';
import { TemplatePlacer } from './template-placer.js';
import { restoreSelect } from '../core/scene-tools.js';
import { t } from '../core/utils.js';

const TAP_SLOP = 12;          // px of travel still considered a tap
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 500;
// How far two fingers must spread before it counts as a zoom rather than a
// two-finger pan. Without it, every pan zooms a little as the fingers drift.
const PINCH_ACTIVATE_PX = 25;
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
    this.hovered = null;
    this.grabOffset = { x: 0, y: 0 };
    this.touchStartPos = { x: 0, y: 0 };

    this.startDist = 0;
    this.startScale = 1;
    this.startWorldMid = null;
    this.prevMid = null;
    this.moved = false;

    /**
     * Fingers currently down, by pointerId, holding the latest client
     * coordinates. Pointer events report one pointer at a time, so the set of
     * active ones has to be tracked by hand — this replaces `event.touches`.
     */
    this.pointers = new Map();

    // Set while another tool (e.g. the template placer) owns single-finger input.
    this.suspended = false;

    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onPointerCancel = this.onPointerCancel.bind(this);
  }

  init() {
    if (!canvas?.ready) return;
    // Every client-to-world conversion is measured against the board element,
    // so without it pan and pinch silently do nothing.
    this._view = canvas.app?.canvas ?? canvas.app?.view ?? document.getElementById("board");
    TouchGestureHandler.patchTokenDrag();
    this.destroy();

    // Capture phase on <body>, deliberately not on window.
    //
    // Capture runs window -> document -> body -> #board, so this sees the event
    // before the canvas does and can stop it from reaching Foundry's interaction
    // manager — that is what ends two layers fighting over one finger. Listening
    // any higher would also cut off the outside-tap handlers that document-level
    // listeners rely on to close the chat stack and the HP widget.
    const opts = { passive: false, capture: true };
    document.body.addEventListener("pointerdown", this._onPointerDown, opts);
    document.body.addEventListener("pointermove", this._onPointerMove, opts);
    document.body.addEventListener("pointerup", this._onPointerUp, opts);
    document.body.addEventListener("pointercancel", this._onPointerCancel, opts);

    this._onSuspend = (state) => { this.suspended = !!state; };
    Hooks.on("mobileModeSuspendGestures", this._onSuspend);
  }

  static patchTokenDrag() {
    const prototypes = new Set([
      globalThis.Token?.prototype,
      foundry?.canvas?.placeables?.Token?.prototype,
      globalThis.Token5e?.prototype,
      CONFIG?.Token?.objectClass?.prototype,
      canvas?.tokens?.placeables?.[0]?.constructor?.prototype
    ].filter(Boolean));

    for (const proto of prototypes) {
      // Own-property check only: a subclass inherits the flag from its patched
      // parent, and skipping it would leave its own override unwrapped.
      if (Object.hasOwn(proto, "_mgkPatched")) continue;
      proto._mgkPatched = true;

      const origFinalize = proto._finalizeDragLeft;
      if (typeof origFinalize !== "function") continue;

      // Kept as a safety net. The cancelled-drag storm this guards against was
      // caused by touch and pointer events both acting on one finger; claiming
      // canvas gestures in the capture phase should now prevent it at the
      // source, but a stuck interaction manager is not a survivable failure.
      proto._finalizeDragLeft = function(event, ...args) {
        // Token#_finalizeDragLeft iterates event.interactionData.contexts, which
        // is only created by _initializeDragLeft. A drag that is cancelled before
        // it ever started - routine on touch, where opening a sheet drawer eats
        // the pointer sequence - leaves it undefined and Object.values() throws.
        //
        // Letting it throw is not survivable: MouseInteractionManager#cancel has
        // no catch, so the exception escapes before it resets the state back to
        // HOVER. The manager stays in DRAG with stale interaction data and every
        // later pointerup throws again, which is why this used to repeat forever.
        const data = event?.interactionData;
        if (data && !data.contexts) {
          console.warn(
            "Mobile Mode MGK | _finalizeDragLeft reached without interactionData.contexts."
            + " The drag was cancelled before _initializeDragLeft ran - look for an earlier"
            + " error in this console, that one is the real trigger.",
            { token: this?.id, event }
          );
          data.contexts = {};
        }
        try {
          return origFinalize.call(this, event, ...args);
        } catch (err) {
          console.warn("Mobile Mode MGK | Safe-guarded _finalizeDragLeft", err);
        }
      };
    }
  }

  /**
   * Light up the token under the finger.
   *
   * Hover is a mouse idea: it comes free from a pointer that is always
   * somewhere. A finger has no "before", so nothing ever highlights unless it
   * is done by hand — and without that, touching a token gives no sign it was
   * the one picked. Foundry drives the visual off this same call.
   */
  setHover(token) {
    if (token === this.hovered) return;

    try {
      const event = new PIXI.FederatedPointerEvent(canvas.app.renderer.events?.rootBoundary);
      this.hovered?._onHoverOut?.(event);
      token?._onHoverIn?.(event, { hoverOutOthers: true });
    } catch (err) {
      // Hover is cosmetic; never let it break a gesture.
      console.warn("Mobile Mode MGK | Hover feedback failed", err);
    }
    this.hovered = token ?? null;
  }

  /** Remove every listener this handler installed. Safe to call twice. */
  destroy() {
    clearTimeout(this.longPressTimer);
    clearTimeout(this.tapTimeout);

    const opts = { capture: true };
    document.body.removeEventListener("pointerdown", this._onPointerDown, opts);
    document.body.removeEventListener("pointermove", this._onPointerMove, opts);
    document.body.removeEventListener("pointerup", this._onPointerUp, opts);
    document.body.removeEventListener("pointercancel", this._onPointerCancel, opts);
    this.pointers.clear();

    if (this._onSuspend) {
      Hooks.off("mobileModeSuspendGestures", this._onSuspend);
      this._onSuspend = null;
    }

    this.mode = null;
    this.draggedToken = null;
    this.hovered = null;
  }

  /* -------------------------------------------- */
  /*  Pointer lifecycle                           */
  /* -------------------------------------------- */

  /** UI that owns its own input; the canvas gestures must keep away from it. */
  static UI_SELECTOR =
    "#mgk-sheet-drawer, #mgk-chat-drawer, .window-app, .dialog, input, textarea, select, button";

  /**
   * Whether this handler drives the given event.
   *
   * Deliberately narrow. Claiming an event stops it dead in the capture phase,
   * so anything outside the board — Foundry's sidebar, scene controls, a module
   * dialog — has to be left alone or it would stop responding entirely.
   *
   * A mouse is also left to Foundry: it already works, and hijacking it would
   * break every desktop GM who turned mobile mode on to test.
   */
  handles(e) {
    if (e.pointerType === "mouse") return false;
    const target = e.target;
    if (!target?.closest) return false;
    if (target.closest(TouchGestureHandler.UI_SELECTOR)) return false;
    return !!target.closest("#board");
  }

  /**
   * Claim the gesture: Foundry's interaction manager never sees this event, so
   * it cannot start a competing drag on the same finger.
   */
  claim(e) {
    e.stopPropagation();
  }

  onPointerDown(e) {
    if (!this.handles(e)) return;

    this.pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Self-heal: if something suspended gestures and then failed to resume
    // them, the player would be stuck unable to move tokens until a reload.
    // The template placer is the only legitimate reason to stay suspended.
    if (this.suspended && !TemplatePlacer.active) this.suspended = false;

    // While suspended only two-finger pan/zoom stays available.
    if (this.suspended && this.pointers.size < 2) return;

    this.claim(e);

    if (this.pointers.size === 1) {
      const touch = { clientX: e.clientX, clientY: e.clientY };
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
      this.moved = false;

      const token = this.getTokenAtPosition(touch.clientX, touch.clientY);
      this.setHover(token);

      this.longPressTimer = setTimeout(() => {
        if (this.moved) return;
        const hit = this.getTokenAtPosition(touch.clientX, touch.clientY);
        if (hit) {
          hit.control({ releaseOthers: true });
          canvas.hud?.token?.bind(hit);
          canvas.hud?.token?.render(true);
        } else {
          // Long-press on empty map space sends a ping to all players
          const world = this.toWorld(touch.clientX, touch.clientY);
          canvas.ping?.(world);
        }
        this.mode = null;
        this.draggedToken = null;
      }, LONG_PRESS_MS);

      const isOwned = token && (token.isOwner || token.document?.isOwner || token.actor?.isOwner || token.canUserModify?.(game.user, "update"));
      if (isOwned) {
        token._dragData = token._dragData || {};
        this.ensureTokenLayer();
        this.mode = "token";
        this.draggedToken = token;
        const world = this.toWorld(touch.clientX, touch.clientY);
        this.grabOffset = { x: world.x - token.document.x, y: world.y - token.document.y };
      } else {
        this.mode = "pan";
        this.prevMid = { x: touch.clientX, y: touch.clientY };
      }
    } else if (this.pointers.size >= 2) {
      clearTimeout(this.longPressTimer);
      this.cancelTokenDrag();
      this.setHover(null);
      this.beginPinch();
    }
  }

  /**
   * Anchor a two-finger gesture.
   *
   * `moved` is set here on purpose: without it, lifting the last finger of a
   * pinch looks exactly like a tap that never travelled, and the map would
   * select or target whatever happened to be under it.
   */
  beginPinch() {
    const [p1, p2] = [...this.pointers.values()];
    const mid = this.getMidpoint(p1, p2);

    this.mode = "pinch";
    this.moved = true;
    this.pinchActive = false;
    this.prevMid = mid;
    this.startDist = this.getDistance(p1, p2);
    this.startScale = canvas.stage.scale.x;
    this.startWorldMid = this.toWorld(mid.x, mid.y);
  }

  onPointerMove(e) {
    // Only fingers already registered by pointerdown matter; anything else is
    // a pointer this handler deliberately let through.
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Mirror the pointerdown guard: while suspended, a single finger belongs to
    // whichever tool took over, so it must reach that tool untouched.
    if (this.suspended && this.pointers.size < 2) return;
    this.claim(e);

    if (this.pointers.size >= 2) {
      clearTimeout(this.longPressTimer);

      const [p1, p2] = [...this.pointers.values()];
      const mid = this.getMidpoint(p1, p2);
      const dist = this.getDistance(p1, p2);

      if (this.mode !== "pinch" || !this.startDist) {
        this.beginPinch();
        return;
      }

      // Two fingers that are only panning still drift apart a little. Hold the
      // zoom until the spread is deliberate, then re-anchor so it does not jump.
      if (!this.pinchActive) {
        if (Math.abs(dist - this.startDist) < PINCH_ACTIVATE_PX) {
          this.anchorTo(this.prevMid, mid, canvas.stage.scale.x);
          this.prevMid = mid;
          return;
        }
        this.pinchActive = true;
        this.startDist = dist;
        this.startScale = canvas.stage.scale.x;
        this.startWorldMid = this.toWorld(mid.x, mid.y);
      }

      const scaleRatio = dist / this.startDist;
      const newScale = this.clamp(this.startScale * scaleRatio, MIN_SCALE, MAX_SCALE);

      const rect = this.viewRect;
      const dx = (mid.x - rect.left) - rect.width / 2;
      const dy = (mid.y - rect.top) - rect.height / 2;

      canvas.pan({
        x: this.startWorldMid.x - dx / newScale,
        y: this.startWorldMid.y - dy / newScale,
        scale: newScale
      });

      this.prevMid = mid;
      return;
    }

    if (this.pointers.size !== 1 || this.suspended) return;
    const touch = { clientX: e.clientX, clientY: e.clientY };

    if (!this.moved) {
      const travel = Math.hypot(touch.clientX - this.touchStartPos.x, touch.clientY - this.touchStartPos.y);
      if (travel <= TAP_SLOP) return;
      this.moved = true;
      clearTimeout(this.longPressTimer);
    }

    if (this.mode === "token" && this.draggedToken) {
      const world = this.toWorld(touch.clientX, touch.clientY);
      // Live preview only — the document is not touched until the finger lifts.
      this.draggedToken.position.set(world.x - this.grabOffset.x, world.y - this.grabOffset.y);
    } else if (this.mode === "pan") {
      const mid = { x: touch.clientX, y: touch.clientY };
      this.anchorTo(this.prevMid, mid, canvas.stage.scale.x);
      this.prevMid = mid;
    }
  }

  onPointerCancel(e) {
    if (!this.pointers.delete(e.pointerId)) return;
    clearTimeout(this.longPressTimer);
    // The system took the gesture away mid-drag; put the token back.
    if (this.pointers.size === 0) {
      this.cancelTokenDrag();
      this.setHover(null);
      this.mode = null;
    }
  }

  async onPointerUp(e) {
    if (!this.pointers.delete(e.pointerId)) return;
    this.claim(e);

    clearTimeout(this.longPressTimer);
    if (this.pointers.size > 0) return;   // fingers still down, wait for the last one
    if (this.suspended) {
      this.mode = null;
      this.draggedToken = null;
      return;
    }

    const wasMode = this.mode;
    const token = this.draggedToken;
    this.mode = null;
    this.draggedToken = null;
    this.setHover(null);

    if (wasMode === "token" && token && this.moved) {
      await this.commitTokenDrag(token);
      return;
    }

    if (!this.moved) this.handleTap({ clientX: e.clientX, clientY: e.clientY });
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
    if (token && !token.controlled) token.control({ releaseOthers: true });
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
      this.ensureTokenLayer();
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
    if (!from || !to) return;
    const world = this.toWorld(from.x, from.y);
    const rect = this.viewRect;
    const dx = (to.x - rect.left) - rect.width / 2;
    const dy = (to.y - rect.top) - rect.height / 2;
    canvas.pan({
      x: world.x - dx / newScale,
      y: world.y - dy / newScale,
      scale: newScale
    });
  }

  /** Bounds of the board element, falling back to the viewport if it is gone. */
  get viewRect() {
    return this._view?.getBoundingClientRect()
      ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  toWorld(clientX, clientY) {
    return canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
  }

  /**
   * A token cannot be selected while the canvas is on another layer, and with
   * the native scene controls hidden the player has no way to switch back. Any
   * tool that strands the canvas elsewhere is corrected here, on the next tap.
   *
   * The template placer is left alone because it owns the templates layer on
   * purpose. The ruler needs no exception: it is a token-layer tool, so the
   * layer is already correct while it is in use.
   */
  ensureTokenLayer() {
    if (TemplatePlacer.active) return;
    if (canvas?.tokens?.active) return;
    restoreSelect();
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
