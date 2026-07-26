/**
 * Lightweight MiniCanvas 2D Radar View for Low-RAM / Standalone Mode
 */
export class MiniCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.activeToken = null;
  }

  render(scene, token) {
    if (!this.ctx || !scene) return;
    this.activeToken = token;

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear background
    this.ctx.fillStyle = "#0c0d14";
    this.ctx.fillRect(0, 0, width, height);

    if (!token) return;

    const centerX = width / 2;
    const centerY = height / 2;

    // Draw 60ft reveal circle
    const revealRadius = 150; // px on radar
    const grad = this.ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, revealRadius);
    grad.addColorStop(0, "rgba(30, 41, 59, 0.9)");
    grad.addColorStop(1, "rgba(12, 13, 20, 0.95)");

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, revealRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw nearby walls
    if (scene.walls) {
      this.ctx.strokeStyle = "#8b5cf6";
      this.ctx.lineWidth = 2;

      scene.walls.forEach(w => {
        const c = w.c; // [x1, y1, x2, y2]
        const relX1 = centerX + (c[0] - token.x);
        const relY1 = centerY + (c[1] - token.y);
        const relX2 = centerX + (c[2] - token.x);
        const relY2 = centerY + (c[3] - token.y);

        this.ctx.beginPath();
        this.ctx.moveTo(relX1, relY1);
        this.ctx.lineTo(relX2, relY2);
        this.ctx.stroke();
      });
    }

    // Draw active token
    this.ctx.fillStyle = "#10b981";
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }
}
