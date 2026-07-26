import { MemoryDiagnostics } from './memory-diagnostics.js';
import { ImageCompressor } from './image-compressor.js';
import { MODULE_ID, esc, t } from '../core/utils.js';

/**
 * GM-facing report of which scenes are too heavy for phones, and which images
 * exceed the configured resolution threshold.
 */
export class ImageOptimizer {
  static async openDialog() {
    if (!game.user.isGM) {
      return ui.notifications?.warn(t("Optimizer.GmOnly", "Only the GM can run the image optimizer."));
    }

    const limit = game.settings.get(MODULE_ID, "vramLimitWarning") || 400;
    const threshold = game.settings.get(MODULE_ID, "imageOptimizerThreshold") || 2048;
    const report = MemoryDiagnostics.report();

    const rows = report.map(row => `
      <tr class="${row.mb > limit ? "mgk-over" : ""}">
        <td>${esc(row.name)}${row.active ? " ★" : ""}</td>
        <td style="text-align:right">${esc(row.mb)} MB</td>
      </tr>
    `).join("");

    const oversized = this.findOversizedScenes(threshold);

    const content = `
      <p>${esc(t("Optimizer.Intro", "Estimated texture memory per scene. iOS Safari reloads the tab past roughly 400MB."))}</p>
      <table style="width:100%">
        <thead><tr><th style="text-align:left">${esc(t("Optimizer.Scene", "Scene"))}</th><th style="text-align:right">VRAM</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <hr>
      <p><strong>${esc(t("Optimizer.Threshold", "Resolution threshold"))}:</strong> ${esc(threshold)} px</p>
      ${oversized.length
        ? `<p>${esc(t("Optimizer.Oversized", "Scenes wider or taller than the threshold:"))}</p><ul>${
            oversized.map(s => `<li>${esc(s.name)} — ${esc(s.width)}×${esc(s.height)}</li>`).join("")
          }</ul>`
        : `<p>${esc(t("Optimizer.AllGood", "No scene exceeds the resolution threshold."))}</p>`}
      <p><em>${esc(t("Optimizer.Advice", "Re-export oversized backgrounds as WebP at or below the threshold, then re-point the scene at the new file."))}</em></p>
      <style>.mgk-over td { color: #ef4444; font-weight: 700; }</style>
    `;

    const DialogV2 = foundry.applications?.api?.DialogV2;
    const title = t("Optimizer.Title", "Mobile Image Optimizer");
    const optimizeLabel = t("Optimizer.Optimize", "Optimize oversized scenes");

    if (DialogV2) {
      return DialogV2.wait({
        window: { title },
        content,
        buttons: [
          { action: "optimize", icon: "fas fa-compress", label: optimizeLabel, callback: () => this.runCompression(oversized) },
          { action: "close", icon: "fas fa-times", label: t("Optimizer.Close", "Close"), default: true }
        ]
      });
    }

    return new Dialog({
      title,
      content,
      buttons: {
        optimize: { icon: '<i class="fas fa-compress"></i>', label: optimizeLabel, callback: () => this.runCompression(oversized) },
        close: { icon: '<i class="fas fa-times"></i>', label: t("Optimizer.Close", "Close") }
      },
      default: "close"
    }).render(true);
  }

  /**
   * Rewrites scene backgrounds. Originals are left on disk and the scene can be
   * pointed back at them, but this still edits world documents — so confirm
   * explicitly and name what will change.
   */
  static async runCompression(oversized) {
    if (!oversized.length) {
      return ui.notifications?.info(t("Optimizer.AllGood", "No scene exceeds the resolution threshold."));
    }

    const threshold = game.settings.get(MODULE_ID, "imageOptimizerThreshold") || 2048;
    const names = oversized.map(s => `<li>${esc(s.name)}</li>`).join("");
    const warning = `
      <p>${esc(t("Optimizer.ConfirmIntro", "A resized WebP copy will be written and these scenes re-pointed at it:"))}</p>
      <ul>${names}</ul>
      <p>${esc(t("Optimizer.ConfirmDetail", "Original files are kept. The longest edge becomes:"))} <strong>${esc(threshold)} px</strong>.</p>
    `;

    const DialogV2 = foundry.applications?.api?.DialogV2;
    const confirmed = DialogV2
      ? await DialogV2.confirm({ window: { title: t("Optimizer.Title", "Mobile Image Optimizer") }, content: warning })
      : await Dialog.confirm({ title: t("Optimizer.Title", "Mobile Image Optimizer"), content: warning });

    if (!confirmed) return;

    ui.notifications?.info(t("Optimizer.Working", "Optimizing scene images…"));
    const results = await ImageCompressor.compressAll({ maxSize: threshold });
    const changed = results.filter(r => r.changed);

    const summary = t("Optimizer.Done", "Optimized {n} of {total} scenes.")
      .replace("{n}", changed.length)
      .replace("{total}", results.length);
    ui.notifications?.info(summary);

    for (const failure of results.filter(r => r.reason === "error" || r.reason === "upload-failed")) {
      console.warn(`Mobile Mode MGK | "${failure.name}" was not optimized (${failure.reason})`);
    }
  }

  static findOversizedScenes(threshold) {
    return game.scenes
      .filter(scene => (scene.width ?? 0) > threshold || (scene.height ?? 0) > threshold)
      .map(scene => ({ name: scene.name, width: scene.width, height: scene.height }));
  }
}
