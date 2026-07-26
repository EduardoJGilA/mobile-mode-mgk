import { MODULE_ID, t } from '../core/utils.js';

const BYTES_PER_PIXEL = 4;   // RGBA
const MB = 1024 * 1024;

/**
 * Texture memory diagnostics.
 *
 * For the scene that is actually rendered we measure the real GPU textures the
 * renderer is holding, which is far more accurate than guessing from document
 * fields. For any other scene we fall back to an estimate from its dimensions.
 */
export class MemoryDiagnostics {
  /** Measured VRAM of everything the renderer currently has uploaded, in MB. */
  static measureLiveTextures() {
    const managed = canvas?.app?.renderer?.texture?.managedTextures;
    if (!managed?.length) return null;

    let bytes = 0;
    for (const texture of managed) {
      const width = texture.realWidth ?? texture.width ?? 0;
      const height = texture.realHeight ?? texture.height ?? 0;
      if (!width || !height) continue;
      // Mipmaps add roughly a third on top of the base level.
      const mipFactor = texture.mipmap ? 4 / 3 : 1;
      bytes += width * height * BYTES_PER_PIXEL * mipFactor;
    }
    return Math.round(bytes / MB);
  }

  /** Static estimate for a scene document, used when it is not the active one. */
  static estimateSceneMemory(scene) {
    if (!scene) return 0;
    if (canvas?.ready && canvas.scene?.id === scene.id) {
      const live = this.measureLiveTextures();
      if (live !== null) return live;
    }

    let bytes = 0;
    for (const level of this.getLevels(scene)) {
      if (level.background?.src) bytes += this.estimateLayerBytes(scene);
      if (level.foreground?.src) bytes += this.estimateLayerBytes(scene);
    }

    // Tokens: assume a 512px square texture each, which is the common case.
    bytes += (scene.tokens?.size ?? 0) * 512 * 512 * BYTES_PER_PIXEL;

    // Tiles are unbounded in size; use the scene grid footprint as a proxy.
    for (const tile of scene.tiles ?? []) {
      bytes += (tile.width || 0) * (tile.height || 0) * BYTES_PER_PIXEL;
    }

    return Math.round(bytes / MB);
  }

  /**
   * V14 splits a scene into levels; V13 keeps a single background/foreground
   * pair on the scene itself. Only read `levels` if the document actually has
   * it, so this stays correct on both.
   */
  static getLevels(scene) {
    const levels = scene.levels;
    if (levels && typeof levels[Symbol.iterator] === "function") return Array.from(levels);
    return [{ background: scene.background, foreground: { src: scene.foreground } }];
  }

  /** Background textures are drawn at scene resolution, padding included. */
  static estimateLayerBytes(scene) {
    const width = scene.dimensions?.sceneWidth ?? scene.width ?? 4096;
    const height = scene.dimensions?.sceneHeight ?? scene.height ?? 4096;
    return width * height * BYTES_PER_PIXEL;
  }

  static checkVramAlert() {
    if (!canvas?.scene) return;
    const estimatedMB = this.estimateSceneMemory(canvas.scene);
    const limit = game.settings.get(MODULE_ID, "vramLimitWarning") || 400;
    if (estimatedMB <= limit) return;

    const template = t("Notifications.HighVram", "High texture memory: ~{mb}MB (limit {limit}MB). Mobile devices may reload.");
    ui.notifications?.warn(template.replace("{mb}", estimatedMB).replace("{limit}", limit));
  }

  /** Per-scene report used by the image optimizer dialog. */
  static report() {
    return game.scenes.map(scene => ({
      id: scene.id,
      name: scene.name,
      mb: this.estimateSceneMemory(scene),
      active: scene.id === canvas?.scene?.id
    })).sort((a, b) => b.mb - a.mb);
  }
}
