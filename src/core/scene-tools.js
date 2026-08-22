import { t } from './utils.js';

/**
 * Switching Foundry's active scene control from a phone.
 *
 * The scene control names were renamed between v12 and v13 ("token" ->
 * "tokens"), so every call tries each candidate before falling back to
 * activating the layer object directly.
 *
 * This lives on its own rather than inside QuickControls because the template
 * placer needs it too, and importing QuickControls there would be circular.
 */
export const TOKEN_CONTROLS = ["tokens", "token"];

export function activateTool(controls, tool) {
  const candidates = Array.isArray(controls) ? controls : [controls];

  for (const control of candidates) {
    try {
      if (!ui.controls?.activate) break;
      ui.controls.activate({ control, tool });
      return true;
    } catch {
      // Wrong name for this version; try the next.
    }
  }

  for (const control of candidates) {
    try {
      if (canvas[control]?.activate) {
        canvas[control].activate();
        return true;
      }
    } catch {
      // Nothing else to try for this name.
    }
  }

  console.warn("Mobile Mode MGK | Could not activate tool", candidates, tool);
  return false;
}

/**
 * Put the player back on the token layer with the select tool.
 *
 * Any tool that leaves the canvas on another layer has to call this on the way
 * out. Without it the player is stranded: tokens stop responding and, with the
 * native scene controls hidden, there is no way back except a reload.
 */
export function restoreSelect() {
  const ok = activateTool(TOKEN_CONTROLS, "select");
  if (!ok) canvas?.tokens?.activate?.();
  return ok;
}

export function toolUnavailable() {
  ui.notifications?.warn(t("QuickControls.ToolUnavailable", "That tool is not available in this Foundry version."));
}
