import { esc, t } from '../core/utils.js';
import { TemplatePlacer } from '../touch/template-placer.js';

/**
 * Floating control stacks.
 *
 * Left: an expandable tool column (ruler, templates, targets, volume, journal,
 * A/V, logout) plus settings. Right: quick dice and the chat drawer toggle.
 */
export class QuickControls {
  static render() {
    this.renderLeftControls();
    this.renderRightControls();
  }

  static button(id, icon, labelKey, fallback) {
    return `
      <button type="button" class="mgk-floating-btn" id="${esc(id)}"
              title="${esc(t(labelKey, fallback))}" aria-label="${esc(t(labelKey, fallback))}">
        <i class="fas ${esc(icon)}"></i>
      </button>
    `;
  }

  static renderLeftControls() {
    if (document.getElementById("mgk-left-controls")) return;

    const container = document.createElement("div");
    container.id = "mgk-left-controls";
    container.innerHTML = `
      <div class="mgk-tool-stack" id="mgk-tool-stack">
        ${this.button("mgk-btn-logout", "fa-right-from-bracket", "QuickControls.Logout", "Log Out")}
        ${this.button("mgk-btn-av", "fa-video", "QuickControls.Camera", "Camera & Audio")}
        ${this.button("mgk-btn-journal", "fa-book-open", "QuickControls.Journals", "Journals & Notes")}
        ${this.button("mgk-btn-volume", "fa-volume-high", "QuickControls.Volume", "Volume Control")}
        ${this.button("mgk-btn-clear-targets", "fa-crosshairs", "QuickControls.ClearTargets", "Clear Targets")}
        ${this.button("mgk-btn-template", "fa-draw-polygon", "QuickControls.Templates", "Place Template")}
        ${this.button("mgk-btn-ruler", "fa-ruler", "QuickControls.Ruler", "Measure Distance")}
      </div>
      ${this.button("mgk-btn-tools", "fa-chevron-up", "QuickControls.Tools", "Tools")}
      ${this.button("mgk-btn-settings", "fa-cog", "QuickControls.Settings", "Settings")}
    `;
    document.body.appendChild(container);

    const stack = container.querySelector("#mgk-tool-stack");
    const toolsBtn = container.querySelector("#mgk-btn-tools");
    toolsBtn.addEventListener("click", () => {
      const open = stack.classList.toggle("open");
      toolsBtn.querySelector("i").className = `fas ${open ? "fa-chevron-down" : "fa-chevron-up"}`;
    });

    const on = (id, fn) => container.querySelector(`#${id}`).addEventListener("click", fn);

    on("mgk-btn-settings", () => game.settings.sheet.render(true));
    on("mgk-btn-ruler", () => this.activateTool(["tokens", "token"], "ruler"));
    on("mgk-btn-template", () => {
      const button = container.querySelector("#mgk-btn-template");
      TemplatePlacer.toggle();
      button.classList.toggle("active", TemplatePlacer.active);
      stack.classList.remove("open");
      toolsBtn.querySelector("i").className = "fas fa-chevron-up";
    });
    on("mgk-btn-clear-targets", () => {
      game.user.updateTokenTargets([]);
      ui.notifications?.info(t("QuickControls.TargetsCleared", "Targets cleared."));
    });
    on("mgk-btn-journal", () => ui.journal?.render(true));
    on("mgk-btn-volume", () => this.toggleMute(container.querySelector("#mgk-btn-volume")));
    on("mgk-btn-av", () => this.toggleAV(container.querySelector("#mgk-btn-av")));
    on("mgk-btn-logout", async () => {
      const ok = await this.confirm(t("QuickControls.LogoutConfirm", "Log out of this world?"));
      if (ok) game.logOut();
    });
  }

  static renderRightControls() {
    if (document.getElementById("mgk-right-controls")) return;

    const container = document.createElement("div");
    container.id = "mgk-right-controls";
    container.innerHTML = `
      ${this.button("mgk-btn-dice", "fa-dice-d20", "QuickControls.Dice", "Quick Roll")}
      ${this.button("mgk-btn-chat", "fa-comment-alt", "QuickControls.Chat", "Chat")}
    `;
    document.body.appendChild(container);

    container.querySelector("#mgk-btn-dice").addEventListener("click", () => this.quickRoll());
    container.querySelector("#mgk-btn-chat").addEventListener("click", () => Hooks.callAll("mobileModeToggleChat"));
  }

  /* -------------------------------------------- */

  /**
   * Scene control names were renamed between v12 and v13 ("token" -> "tokens"),
   * so try each candidate and fall back to activating the layer directly.
   */
  static activateTool(controls, tool) {
    const candidates = Array.isArray(controls) ? controls : [controls];

    for (const control of candidates) {
      try {
        if (!ui.controls?.controls?.[control] && !ui.controls?.control) continue;
        ui.controls.activate({ control, tool });
        return true;
      } catch (err) {
        // Try the next candidate name.
      }
    }

    for (const control of candidates) {
      try {
        if (canvas[control]?.activate) {
          canvas[control].activate();
          return true;
        }
      } catch (err) {
        // Nothing else to try for this name.
      }
    }

    console.warn("Mobile Mode MGK | Could not activate tool", candidates, tool);
    ui.notifications?.warn(t("QuickControls.ToolUnavailable", "That tool is not available in this Foundry version."));
    return false;
  }

  static _volumeBefore = {};

  static toggleMute(button) {
    const muted = !button.classList.contains("active");
    button.classList.toggle("active", muted);
    button.querySelector("i").className = `fas ${muted ? "fa-volume-xmark" : "fa-volume-high"}`;

    for (const channel of ["globalInterfaceVolume", "globalAmbientVolume", "globalPlaylistVolume"]) {
      if (muted) {
        this._volumeBefore[channel] = game.settings.get("core", channel) ?? 1;
        game.settings.set("core", channel, 0);
      } else {
        game.settings.set("core", channel, this._volumeBefore[channel] ?? 1);
      }
    }
  }

  static toggleAV(button) {
    const camera = document.getElementById("camera-views");
    if (!camera) return ui.notifications?.warn(t("QuickControls.NoAV", "Audio/Video is not enabled."));
    const hidden = camera.style.display === "none";
    camera.style.display = hidden ? "" : "none";
    button.classList.toggle("active", hidden);
  }

  static async quickRoll() {
    const formula = await this.prompt(t("QuickControls.DiceFormula", "Roll formula"), "1d20");
    if (!formula) return;
    try {
      const roll = await new Roll(formula).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker() });
    } catch (err) {
      ui.notifications?.error(t("QuickControls.BadFormula", "Invalid roll formula."));
    }
  }

  /* -------------------------------------------- */
  /*  Dialog helpers (v13 DialogV2, v12 fallback) */
  /* -------------------------------------------- */

  static get DialogV2() {
    return foundry.applications?.api?.DialogV2 ?? null;
  }

  static async confirm(message) {
    if (this.DialogV2) return this.DialogV2.confirm({ content: `<p>${esc(message)}</p>` });
    return Dialog.confirm({ content: `<p>${esc(message)}</p>` });
  }

  static async prompt(label, initial) {
    const content = `<input type="text" name="formula" value="${esc(initial)}" style="width:100%">`;
    if (this.DialogV2) {
      return this.DialogV2.prompt({
        window: { title: label },
        content,
        ok: { callback: (_ev, button) => button.form.elements.formula.value }
      });
    }
    return new Promise(resolve => {
      new Dialog({
        title: label,
        content,
        buttons: {
          ok: { label: "OK", callback: (html) => resolve(html[0].querySelector("[name=formula]").value) }
        },
        close: () => resolve(null)
      }).render(true);
    });
  }
}
