import { esc, t } from '../core/utils.js';

/**
 * Token HUD Touch Controls.
 *
 * Adds touch-friendly token rotation (↺ ↻ 45°) and flipping (Horizontal / Vertical mirror)
 * directly into the Foundry Token HUD when long-pressing or right-clicking a token.
 */
export class TokenHudControls {
  static init() {
    Hooks.on("renderTokenHUD", (hud, html, data) => this.enhanceHUD(hud, html, data));
  }

  static enhanceHUD(hud, html, data) {
    const el = html instanceof HTMLElement ? html : html?.[0];
    if (!el) return;

    const token = hud.object;
    if (!token?.isOwner) return;

    if (el.querySelector(".mgk-hud-controls")) return;

    const controls = document.createElement("div");
    controls.className = "mgk-hud-controls";
    controls.innerHTML = `
      <button type="button" class="mgk-hud-btn" data-action="rotate-left" title="${esc(t("HUD.RotateLeft", "Rotate Left 45°"))}" aria-label="${esc(t("HUD.RotateLeft", "Rotate Left 45°"))}">
        <i class="fas fa-undo"></i>
      </button>
      <button type="button" class="mgk-hud-btn${token.document.mirrorX ? " active" : ""}" data-action="flip-x" title="${esc(t("HUD.FlipX", "Flip Horizontal"))}" aria-label="${esc(t("HUD.FlipX", "Flip Horizontal"))}">
        <i class="fas fa-arrows-left-right"></i>
      </button>
      <button type="button" class="mgk-hud-btn${token.document.mirrorY ? " active" : ""}" data-action="flip-y" title="${esc(t("HUD.FlipY", "Flip Vertical"))}" aria-label="${esc(t("HUD.FlipY", "Flip Vertical"))}">
        <i class="fas fa-arrows-up-down"></i>
      </button>
      <button type="button" class="mgk-hud-btn" data-action="rotate-right" title="${esc(t("HUD.RotateRight", "Rotate Right 45°"))}" aria-label="${esc(t("HUD.RotateRight", "Rotate Right 45°"))}">
        <i class="fas fa-redo"></i>
      </button>
    `;

    const colRight = el.querySelector(".col.right") ?? el;
    colRight.appendChild(controls);

    controls.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();

      const action = btn.dataset.action;
      const currentRot = token.document.rotation ?? 0;

      switch (action) {
        case "rotate-left": {
          const newRot = (currentRot - 45 + 360) % 360;
          await token.document.update({ rotation: newRot });
          break;
        }
        case "rotate-right": {
          const newRot = (currentRot + 45) % 360;
          await token.document.update({ rotation: newRot });
          break;
        }
        case "flip-x": {
          const mirrorX = !token.document.mirrorX;
          await token.document.update({ mirrorX });
          btn.classList.toggle("active", mirrorX);
          break;
        }
        case "flip-y": {
          const mirrorY = !token.document.mirrorY;
          await token.document.update({ mirrorY });
          btn.classList.toggle("active", mirrorY);
          break;
        }
      }
    });
  }
}
