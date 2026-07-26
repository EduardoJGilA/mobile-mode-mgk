/**
 * Memory Diagnostics for Texture VRAM Estimation (Foundry V13 & V14)
 */
export class MemoryDiagnostics {
  static estimateSceneMemory(scene) {
    if (!scene) return 0;
    let totalBytes = 0;

    // V14 multi-level support check
    if (scene.firstLevel) {
      let level = scene.firstLevel;
      while (level) {
        if (level.background?.src) totalBytes += this.estimateImageBytes(level.background);
        if (level.foreground?.src) totalBytes += this.estimateImageBytes(level.foreground);
        level = level.next;
      }
    } else {
      // V13 legacy accessors
      if (scene.background?.src) totalBytes += this.estimateImageBytes(scene.background);
      if (scene.foreground?.src) totalBytes += this.estimateImageBytes(scene.foreground);
    }

    // Token texture estimations
    if (scene.tokens) {
      scene.tokens.forEach(t => {
        if (t.texture?.src) totalBytes += 512 * 512 * 4; // Average 512px token
      });
    }

    return Math.round(totalBytes / (1024 * 1024)); // Return in MB
  }

  static estimateImageBytes(bg) {
    const width = bg.width || 4096;
    const height = bg.height || 4096;
    return width * height * 4; // 4 bytes per RGBA pixel
  }

  static checkVramAlert() {
    if (!canvas?.scene) return;
    const estimatedMB = this.estimateSceneMemory(canvas.scene);
    const limit = game.settings.get("mobile-mode-mgk", "vramLimitWarning") || 400;

    if (estimatedMB > limit) {
      ui.notifications?.warn(`High Texture Memory: ~${estimatedMB}MB VRAM (Limit ${limit}MB). Mobile devices may reload.`);
    }
  }
}
