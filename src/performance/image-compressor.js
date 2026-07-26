import { MODULE_ID, t } from '../core/utils.js';

const OUTPUT_DIR = "mobile-mode-mgk-optimized";

/**
 * Downscales and re-encodes scene images to WebP so phones can load them.
 *
 * The original file is never touched: a resized copy is written into a
 * dedicated upload folder and the scene is re-pointed at it, so the change is
 * always reversible by editing the scene back.
 */
export class ImageCompressor {
  /**
   * @param {Scene} scene
   * @param {object} [options]
   * @param {number} [options.maxSize]  Longest edge in pixels.
   * @param {number} [options.quality]  WebP quality, 0-1.
   * @returns {Promise<{changed: boolean, from?: number, to?: number, path?: string, reason?: string}>}
   */
  static async compressScene(scene, { maxSize, quality = 0.85 } = {}) {
    if (!game.user.isGM) return { changed: false, reason: "not-gm" };

    const limit = maxSize ?? game.settings.get(MODULE_ID, "imageOptimizerThreshold") ?? 2048;
    const src = scene.background?.src;
    if (!src) return { changed: false, reason: "no-background" };
    if (this.isVideo(src)) return { changed: false, reason: "video" };

    const image = await this.loadImage(src);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (longest <= limit) return { changed: false, reason: "already-small", from: longest };

    const scale = limit / longest;
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);

    const blob = await this.resizeToBlob(image, width, height, quality);
    if (!blob) return { changed: false, reason: "encode-failed" };

    const path = await this.upload(blob, scene, width);
    if (!path) return { changed: false, reason: "upload-failed" };

    await scene.update({ "background.src": path });
    return { changed: true, from: longest, to: limit, path };
  }

  static isVideo(src) {
    return /\.(webm|mp4|m4v|ogv)(\?|$)/i.test(src);
  }

  static loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      // Foundry serves world assets same-origin; this keeps the canvas untainted
      // for the S3/CDN case where CORS headers are present.
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = foundry.utils.getRoute?.(src) ?? src;
    });
  }

  static async resizeToBlob(image, width, height, quality) {
    const canvasEl = document.createElement("canvas");
    canvasEl.width = width;
    canvasEl.height = height;

    const ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);

    return new Promise(resolve => canvasEl.toBlob(resolve, "image/webp", quality));
  }

  static async upload(blob, scene, width) {
    const FilePickerClass = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    const source = game.data.files?.s3 ? "s3" : "data";

    try {
      await FilePickerClass.createDirectory(source, OUTPUT_DIR, {}).catch(() => {});
      const name = `${scene.id}-${width}.webp`;
      const file = new File([blob], name, { type: "image/webp" });
      const result = await FilePickerClass.upload(source, OUTPUT_DIR, file, {}, { notify: false });
      return result?.path ?? null;
    } catch (err) {
      console.error("Mobile Mode MGK | Image upload failed", err);
      ui.notifications?.error(t("Optimizer.UploadFailed", "Could not write the optimized image."));
      return null;
    }
  }

  /** Run over every scene, reporting what changed. */
  static async compressAll(options = {}) {
    const results = [];
    for (const scene of game.scenes) {
      try {
        const result = await this.compressScene(scene, options);
        results.push({ name: scene.name, ...result });
      } catch (err) {
        console.error(`Mobile Mode MGK | Failed to optimize "${scene.name}"`, err);
        results.push({ name: scene.name, changed: false, reason: "error" });
      }
    }
    return results;
  }
}
