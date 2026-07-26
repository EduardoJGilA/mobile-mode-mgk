import { SocketUtil } from '../core/socket-util.js';

/**
 * Touch Gesture Handler for Foundry Canvas
 */
export class TouchGestureHandler {
  constructor() {
    this.lastTapTime = 0;
    this.tapTimeout = null;
    this.longPressTimer = null;
    this.initialPinchDist = 0;
    this.isDraggingToken = false;
    this.draggedToken = null;
    this.touchStartPos = { x: 0, y: 0 };
  }

  init() {
    if (!canvas?.ready) return;
    const view = canvas.app?.view || document.getElementById("board");
    if (!view) return;

    view.addEventListener("touchstart", this.onTouchStart.bind(this), { passive: false });
    view.addEventListener("touchmove", this.onTouchMove.bind(this), { passive: false });
    view.addEventListener("touchend", this.onTouchEnd.bind(this), { passive: false });
    view.addEventListener("touchcancel", this.onTouchEnd.bind(this), { passive: false });
  }

  onTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };

      // Long press detection for Token HUD
      this.longPressTimer = setTimeout(() => {
        const token = this.getTokenAtPosition(touch.clientX, touch.clientY);
        if (token) {
          token.control();
          token.sheet?.render(true);
        }
      }, 500);

      // Check token drag candidate
      const token = this.getTokenAtPosition(touch.clientX, touch.clientY);
      if (token && token.isOwner) {
        this.isDraggingToken = true;
        this.draggedToken = token;
      }
    } else if (e.touches.length === 2) {
      // 2-finger pan & pinch zoom initialization
      clearTimeout(this.longPressTimer);
      this.initialPinchDist = this.getDistance(e.touches[0], e.touches[1]);
    }
  }

  onTouchMove(e) {
    clearTimeout(this.longPressTimer);

    if (e.touches.length === 2) {
      // Pinch Zoom & Pan
      e.preventDefault();
      const currentDist = this.getDistance(e.touches[0], e.touches[1]);
      const scaleDelta = currentDist / (this.initialPinchDist || currentDist);

      if (Math.abs(scaleDelta - 1) > 0.02) {
        const newScale = Math.max(0.2, Math.min(3.0, canvas.stage.scale.x * scaleDelta));
        canvas.pan({ scale: newScale });
        this.initialPinchDist = currentDist;
      }
    } else if (e.touches.length === 1 && this.isDraggingToken && this.draggedToken) {
      e.preventDefault();
    }
  }

  async onTouchEnd(e) {
    clearTimeout(this.longPressTimer);

    if (this.isDraggingToken && this.draggedToken && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const moveDist = Math.hypot(touch.clientX - this.touchStartPos.x, touch.clientY - this.touchStartPos.y);

      if (moveDist > 20) {
        // Handle token drag commit
        const canvasCoords = canvas.canvasCoordinatesFromClient({ x: touch.clientX, y: touch.clientY });
        const gridSnap = canvas.grid.getSnappedPoint(canvasCoords, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

        const canMove = await SocketUtil.validateTokenMovement(this.draggedToken.id, gridSnap);
        if (canMove) {
          await this.draggedToken.document.update({ x: gridSnap.x, y: gridSnap.y });
        } else {
          ui.notifications?.warn("Movement blocked by wall.");
        }
      } else {
        // Single / Double tap handling
        this.handleTap(touch);
      }
    } else if (e.changedTouches.length === 1) {
      this.handleTap(e.changedTouches[0]);
    }

    this.isDraggingToken = false;
    this.draggedToken = null;
  }

  handleTap(touch) {
    const now = Date.now();
    const timeDiff = now - this.lastTapTime;
    const token = this.getTokenAtPosition(touch.clientX, touch.clientY);

    if (timeDiff < 300 && timeDiff > 0) {
      // Double tap -> Open Character Sheet / Mobile Sheet
      clearTimeout(this.tapTimeout);
      if (token) {
        Hooks.callAll("mobileModeOpenSheet", token.actor);
      }
      this.lastTapTime = 0;
    } else {
      // Single tap -> Select / Target
      this.lastTapTime = now;
      this.tapTimeout = setTimeout(() => {
        if (token) {
          if (token.controlled) {
            token.setTarget(!token.isTargeted);
          } else {
            token.control({ releaseOthers: true });
          }
        }
      }, 300);
    }
  }

  getTokenAtPosition(clientX, clientY) {
    if (!canvas?.ready) return null;
    const pos = canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
    return canvas.tokens.placeables.find(t => t.bounds.contains(pos.x, pos.y));
  }

  getDistance(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }
}
