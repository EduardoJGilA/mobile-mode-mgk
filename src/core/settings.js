import { MODULE_ID, t } from './utils.js';

/**
 * Settings Registration for Mobile Mode MGK
 */
export function registerSettings() {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: t(`Settings.${key}`, key),
    hint: t(`Settings.${key}Hint`, ""),
    scope: "client",
    config: true,
    ...data
  });

  reg("enableMobile", {
    type: Boolean,
    default: true,
    onChange: () => window.location.reload()
  });

  reg("forceMobile", {
    type: String,
    default: "auto",
    choices: {
      auto: t("Settings.forceMobileAuto", "Auto-detect"),
      on: t("Settings.forceMobileOn", "Always on"),
      off: t("Settings.forceMobileOff", "Always off")
    },
    onChange: () => window.location.reload()
  });

  reg("hideNativeUI", {
    type: Boolean,
    default: true,
    onChange: (val) => document.body.classList.toggle("mgk-hide-native", val)
  });

  reg("hideQuickControls", {
    type: Boolean,
    default: false,
    onChange: (val) => {
      const display = val ? "none" : "flex";
      document.getElementById("mgk-left-controls")?.style.setProperty("display", display);
      document.getElementById("mgk-right-controls")?.style.setProperty("display", display);
    }
  });

  reg("hideAvatarCarousel", {
    type: Boolean,
    default: false,
    onChange: (val) => {
      const el = document.getElementById("mgk-avatar-carousel");
      if (el) el.style.display = val ? "none" : "flex";
    }
  });

  reg("sheetOnlyMode", {
    type: Boolean,
    default: false,
    onChange: async (val) => {
      // Foundry only reads noCanvas at load, so mirror it and reload.
      if (game.settings.get("core", "noCanvas") !== val) await game.settings.set("core", "noCanvas", val);
      window.location.reload();
    }
  });

  reg("enableCanvasFreeze", {
    type: Boolean,
    default: true
  });

  reg("canvasFreezeDelay", {
    type: Number,
    default: 15,
    range: { min: 5, max: 120, step: 5 }
  });

  reg("vramLimitWarning", {
    scope: "world",
    type: Number,
    default: 400
  });

  reg("imageOptimizerThreshold", {
    scope: "world",
    type: Number,
    default: 2048,
    range: { min: 1024, max: 8192, step: 256 }
  });
}
