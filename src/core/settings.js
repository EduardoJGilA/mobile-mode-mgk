/**
 * Settings Registration for Mobile Mode MGK
 */
export function registerSettings() {
  game.settings.register("mobile-mode-mgk", "enableMobile", {
    name: game.i18n.localize("MOBILE_MODE_MGK.Settings.EnableMobile"),
    hint: game.i18n.localize("MOBILE_MODE_MGK.Settings.EnableMobileHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => window.location.reload()
  });

  game.settings.register("mobile-mode-mgk", "hideQuickControls", {
    name: game.i18n.localize("MOBILE_MODE_MGK.Settings.HideQuickControls"),
    hint: game.i18n.localize("MOBILE_MODE_MGK.Settings.HideQuickControlsHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (val) => {
      const el = document.getElementById("mgk-quick-controls");
      if (el) el.style.display = val ? "none" : "flex";
    }
  });

  game.settings.register("mobile-mode-mgk", "hideAvatarCarousel", {
    name: game.i18n.localize("MOBILE_MODE_MGK.Settings.HideAvatarCarousel"),
    hint: game.i18n.localize("MOBILE_MODE_MGK.Settings.HideAvatarCarouselHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (val) => {
      const el = document.getElementById("mgk-avatar-carousel");
      if (el) el.style.display = val ? "none" : "flex";
    }
  });

  game.settings.register("mobile-mode-mgk", "enableCanvasFreeze", {
    name: game.i18n.localize("MOBILE_MODE_MGK.Settings.EnableCanvasFreeze"),
    hint: game.i18n.localize("MOBILE_MODE_MGK.Settings.EnableCanvasFreezeHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("mobile-mode-mgk", "vramLimitWarning", {
    name: game.i18n.localize("MOBILE_MODE_MGK.Settings.VramLimitWarning"),
    hint: game.i18n.localize("MOBILE_MODE_MGK.Settings.VramLimitWarningHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 400
  });
}
