/**
 * Lightweight 2D radar for sheet-only mode.
 *
 * Draws from scene *documents* rather than the PIXI canvas, so it works when
 * Foundry's canvas is disabled. Everything within `viewRadiusSquares` grid
 * squares of the focused token is projected onto the small canvas.
 */
export class MiniCanvas {
  constructor(canvasEl, { viewRadiusSquares = 12 } = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.viewRadiusSquares = viewRadiusSquares;
  }

  render(scene, token) {
    const ctx = this.ctx;
    if (!ctx || !scene) return;

    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0c0d14";
    ctx.fillRect(0, 0, width, height);

    if (!token) return this.drawMessage("No token");

    const gridSize = scene.grid?.size || 100;
    const viewRadiusPx = this.viewRadiusSquares * gridSize;
    const radius = Math.min(width, height) / 2 - 6;
    // Scene pixels -> radar pixels.
    const scale = radius / viewRadiusPx;

    const cx = width / 2;
    const cy = height / 2;
    const origin = this.tokenCenter(token, gridSize);

    const toRadar = (x, y) => ({
      x: cx + (x - origin.x) * scale,
      y: cy + (y - origin.y) * scale
    });

    // Clip everything to the radar disc.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
    gradient.addColorStop(0, "rgba(30, 41, 59, 0.9)");
    gradient.addColorStop(1, "rgba(12, 13, 20, 0.95)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    this.drawGrid(ctx, origin, gridSize, scale, cx, cy, radius);
    this.drawWalls(ctx, scene, origin, viewRadiusPx, toRadar);
    this.drawTokens(ctx, scene, token, gridSize, origin, viewRadiusPx, toRadar);

    ctx.restore();

    // Radar rim and the focused token on top of the clip.
    ctx.strokeStyle = "rgba(139, 92, 246, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    this.drawDot(ctx, cx, cy, 7, "#10b981", "#ffffff");
  }

  tokenCenter(token, gridSize) {
    return {
      x: token.x + (token.width ?? 1) * gridSize / 2,
      y: token.y + (token.height ?? 1) * gridSize / 2
    };
  }

  drawGrid(ctx, origin, gridSize, scale, cx, cy, radius) {
    const step = gridSize * scale;
    if (step < 6) return;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Offset so radar grid lines stay aligned with the scene grid.
    const offsetX = ((origin.x % gridSize) * scale);
    const offsetY = ((origin.y % gridSize) * scale);

    for (let x = cx - offsetX - Math.ceil(radius / step) * step; x <= cx + radius; x += step) {
      ctx.moveTo(x, cy - radius);
      ctx.lineTo(x, cy + radius);
    }
    for (let y = cy - offsetY - Math.ceil(radius / step) * step; y <= cy + radius; y += step) {
      ctx.moveTo(cx - radius, y);
      ctx.lineTo(cx + radius, y);
    }
    ctx.stroke();
  }

  drawWalls(ctx, scene, origin, viewRadiusPx, toRadar) {
    if (!scene.walls?.size) return;

    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (const wall of scene.walls) {
      const [x1, y1, x2, y2] = wall.c;
      // Cheap reject: skip walls whose midpoint is well outside the view.
      const midDistance = Math.hypot((x1 + x2) / 2 - origin.x, (y1 + y2) / 2 - origin.y);
      if (midDistance > viewRadiusPx * 1.5) continue;

      const a = toRadar(x1, y1);
      const b = toRadar(x2, y2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  drawTokens(ctx, scene, self, gridSize, origin, viewRadiusPx, toRadar) {
    for (const other of scene.tokens) {
      if (other.id === self.id) continue;
      if (other.hidden && !game.user.isGM) continue;

      const center = this.tokenCenter(other, gridSize);
      if (Math.hypot(center.x - origin.x, center.y - origin.y) > viewRadiusPx) continue;

      const point = toRadar(center.x, center.y);
      const friendly = other.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      this.drawDot(ctx, point.x, point.y, 5, friendly ? "#3b82f6" : "#ef4444");
    }
  }

  drawDot(ctx, x, y, size, fill, stroke = null) {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (!stroke) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawMessage(text) {
    const ctx = this.ctx;
    ctx.fillStyle = "#9ca3af";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
  }
}
