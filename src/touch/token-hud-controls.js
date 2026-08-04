/**
 * Token HUD Directional Controls (TouchVTT style).
 *
 * Surrounds the token HUD with 8 directional arrows (N, NE, E, SE, S, SW, W, NW)
 * for effortless 360° token facing rotation on touch screens.
 */
export class TokenHudControls {
  /** Breathing room between an arrow and the native column beside it. */
  static RING_MARGIN = 12;

  /**
   * Size the ring from what is actually on screen.
   *
   * A fixed gap cannot work: the HUD scales with the canvas zoom, the token may
   * be 1x1 or 4x4, and Foundry's own columns are as wide as their buttons. The
   * arrows sit at the ring's edge, so an arrow clears the column beside it only
   * when the gap covers both widths:
   *
   *     gap >= arrow width + column width + margin
   *
   * Measured with offsetWidth, which reports the HUD's own coordinates and so
   * ignores the zoom transform — the same space the CSS variable lives in.
   */
  static fitRing(hud, ring) {
    const column = hud.querySelector(".col.left") ?? hud.querySelector(".col.right");
    const arrow = ring.querySelector(".mgk-hud-dir-btn");
    const needed = (arrow?.offsetWidth || 36) + (column?.offsetWidth || 40) + this.RING_MARGIN;

    // Never reach past the screen edge: an arrow out there cannot be tapped.
    const rect = hud.getBoundingClientRect();
    const scale = (hud.offsetWidth ? rect.width / hud.offsetWidth : 1) || 1;
    const room = Math.min(rect.left, window.innerWidth - rect.right) / scale;
    const gap = Math.max(0, Math.min(needed, room - this.RING_MARGIN));

    ring.style.setProperty("--mgk-dir-gap", `${Math.round(gap)}px`);
    // Too cramped to place a full ring — better to drop it than to bury the HUD.
    ring.classList.toggle("mgk-dir-cramped", gap < needed);
  }

  static init() {
    Hooks.on("renderTokenHUD", (hud, html) => this.enhanceHUD(hud, html));
  }

  static enhanceHUD(hud, html) {
    const el = html instanceof HTMLElement ? html : html?.[0];
    if (!el) return;

    const token = hud.object;
    if (!token) return;

    const isOwner = token.isOwner || token.document?.isOwner || token.actor?.isOwner || token.canUserModify?.(game.user, "update");
    if (!isOwner) return;

    if (el.querySelector(".mgk-hud-dir-ring")) return;

    const directions = [
      { angle: 0,   class: "mgk-dir-n",  icon: "fa-chevron-up", label: "North (0°)" },
      { angle: 45,  class: "mgk-dir-ne", symbol: "↗", label: "North-East (45°)" },
      { angle: 90,  class: "mgk-dir-e",  icon: "fa-chevron-right", label: "East (90°)" },
      { angle: 135, class: "mgk-dir-se", symbol: "↘", label: "South-East (135°)" },
      { angle: 180, class: "mgk-dir-s",  icon: "fa-chevron-down", label: "South (180°)" },
      { angle: 225, class: "mgk-dir-sw", symbol: "↙", label: "South-West (225°)" },
      { angle: 270, class: "mgk-dir-w",  icon: "fa-chevron-left", label: "West (270°)" },
      { angle: 315, class: "mgk-dir-nw", symbol: "↖", label: "North-West (315°)" }
    ];

    const ring = document.createElement("div");
    ring.className = "mgk-hud-dir-ring";

    const currentRot = token.document?.rotation ?? token.rotation ?? 0;

    for (const dir of directions) {
      const btn = document.createElement("button");
      btn.type = "button";
      const isActive = Math.abs(currentRot - dir.angle) < 22.5 || (dir.angle === 0 && currentRot >= 337.5);
      btn.className = `mgk-hud-dir-btn ${dir.class}${isActive ? " active" : ""}`;
      btn.dataset.angle = String(dir.angle);
      btn.setAttribute("title", dir.label);
      btn.setAttribute("aria-label", dir.label);

      if (dir.symbol) {
        btn.innerHTML = `<span class="mgk-dir-sym">${dir.symbol}</span>`;
      } else {
        btn.innerHTML = `<i class="fas ${dir.icon}"></i>`;
      }

      ring.appendChild(btn);
    }

    el.appendChild(ring);
    this.fitRing(el, ring);

    ring.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-angle]");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();

      const angle = Number(btn.dataset.angle);
      await token.document.update({ rotation: angle });

      ring.querySelectorAll(".mgk-hud-dir-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  }
}
