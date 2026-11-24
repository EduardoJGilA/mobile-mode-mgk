import { DeviceDetector } from '../core/device-detector.js';
import { MODULE_ID } from '../core/utils.js';

/** Phones that report a 16384px GPU limit still choke well before it, so auto never goes above this. */
const AUTO_CAP = 4096;

/**
 * Big scene images render as a black rectangle when they exceed the GPU's MAX_TEXTURE_SIZE
 * (or the memory budget of a phone). Foundry never downscales them, so shrink the pixels here
 * and keep the logical size, which means the grid, walls and tokens still line up.
 */
export class TextureLimiter {
  static #gpuMax = null;

  static init() {
    if (!DeviceDetector.isMobileMode()) return;
    const loader = foundry.canvas?.TextureLoader?.loader;
    if (!loader || loader._mgkLimited) return;

    const original = loader.loadTexture.bind(loader);
    loader._mgkLimited = true;
    loader.loadTexture = async (src) => {
      const base = await original(src);
      try {
        const small = base && !(base instanceof PIXI.Spritesheet) ? await this.shrink(base) : null;
        if (!small) return base;
        // getTexture() reads PIXI.Assets.cache, not the loader's own bookkeeping: swap the entry there.
        const keys = new Set([src, foundry.utils.getCacheBustURL(src)].filter(k => k && PIXI.Assets.cache.has(k)));
        for (const key of keys) {
          PIXI.Assets.cache.remove(key);
          PIXI.Assets.cache.set(key, new PIXI.Texture(small));
        }
        loader.setCache(src, small);
        base.destroy();
        return small;
      } catch (err) {
        console.warn(`Mobile Mode MGK | Could not downscale ${src}:`, err);
        return base;
      }
    };
  }

  /** Effective pixel limit: the setting, or min(GPU limit, AUTO_CAP) when set to 0. */
  static maxSize() {
    const set = Number(game.settings.get(MODULE_ID, "maxTextureSize")) || 0;
    return set > 0 ? set : Math.min(this.gpuMax(), AUTO_CAP);
  }

  static gpuMax() {
    if (this.#gpuMax) return this.#gpuMax;
    const gl = canvas?.app?.renderer?.gl
      ?? document.createElement("canvas").getContext("webgl2")
      ?? document.createElement("canvas").getContext("webgl");
    this.#gpuMax = gl?.getParameter(gl.MAX_TEXTURE_SIZE) || AUTO_CAP;
    return this.#gpuMax;
  }

  /**
   * @param {PIXI.BaseTexture} base
   * @returns {Promise<PIXI.BaseTexture|null>} A smaller copy with the same logical size, or null if it already fits.
   */
  static async shrink(base) {
    const limit = this.maxSize();
    const w = base.realWidth, h = base.realHeight;
    const source = base.resource?.source;
    if (!source || Math.max(w, h) <= limit) return null;

    const k = limit / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const canvasEl = document.createElement("canvas");
    canvasEl.width = cw;
    canvasEl.height = ch;
    const ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, cw, ch);

    const small = PIXI.BaseTexture.from(canvasEl, { scaleMode: base.scaleMode, mipmap: base.mipmap, alphaMode: base.alphaMode });
    // Logical size stays w×h: width = realWidth / resolution.
    small.setRealSize(cw, ch, cw / w);
    console.log(`Mobile Mode MGK | Downscaled texture ${w}×${h} → ${cw}×${ch} (limit ${limit}px)`);
    return small;
  }
}
