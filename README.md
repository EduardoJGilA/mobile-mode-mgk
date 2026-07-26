# Mobile Mode MGK

A mobile interface for [Foundry VTT](https://foundryvtt.com/): touch gestures on the canvas, a drawer character sheet, a floating chat card, and performance tools for phones and tablets.

## Features

- **Canvas touch controls** — tap to select, tap again to target, double tap to open the mobile sheet, one-finger drag to move a token (wall collision checked by the GM via `socketlib`), long press for the Token HUD, one-finger pan on empty map, two-finger pan and pinch-zoom anchored at the finger midpoint.
- **Clean screen** — the desktop Foundry chrome (sidebar, scene navigation, hotbar, player list) is hidden so the map fills the display. Toggleable in settings.
- **Floating controls** — expandable tool column (ruler, templates, clear targets, volume mute, journals, A/V, log out) plus settings, quick roll and chat.
- **Avatar carousel** — every owned character with a live HP bar and combat highlight. Tap to focus the token, tap again to open the sheet.
- **Mobile character sheets** — full-screen drawer on phones, side drawer on tablets and in landscape. Swipe left/right to change tab, swipe down to close.
  - **D&D 5e** (4.x and 5.x): Abilities, Combat, Inventory, Features, Spells, Effects, Other.
  - **Pathfinder 2e**: Abilities, Combat (strikes and actions), Inventory, Feats, Spells, Effects, Other.
  - **System agnostic**: Items, Effects, Other — works in any system.
- **HP widget** — stepper, healing/damage application (temporary HP absorbs damage first), temp HP and temp max.
- **Chat drawer** — live message log with unread badge, message input, and working chat card buttons.
- **Chat card stack** — the newest message floats over the map as a card with a pager, so a roll result is readable without opening the drawer. Swipe to page, swipe down to dismiss.
- **Template placer** — touch-first measured templates: pick circle / cone / square / ray, tap to drop, drag to size and aim, rotation slider, live distance readout, confirm or cancel. Nothing is written to the scene until confirmed.
- **Macro hotbar** — paged 5x2 touch grid, tap to execute, long press to pick up and drag between slots.
- **Performance** — canvas freeze on idle (configurable delay), texture VRAM measured from the real GPU textures, and a GM image optimizer that can downscale oversized scene backgrounds to WebP (originals are kept).
- **Sheet-only mode** — disables the map canvas entirely for memory-constrained devices, replacing it with a static background and an optional lightweight radar. This is the fallback when iOS keeps reloading the tab.

## Requirements

- Foundry VTT v13+
- [socketlib](https://foundryvtt.com/packages/socketlib)
- For system sheets: D&D 5e 4.0+ or Pathfinder 2e. Any other system falls back to the agnostic sheet.

## Installation

Use this manifest URL in Foundry VTT:

```
https://raw.githubusercontent.com/EduardoJGilA/mobile-mode-mgk/master/module.json
```

## Touch gestures

| Gesture | Action |
|---|---|
| Single tap | Select token, tap again to target |
| Double tap | Open mobile character sheet |
| One-finger drag on a token | Move the token |
| One-finger drag on the map | Pan |
| Long press | Token HUD |
| Two-finger drag | Pan |
| Pinch | Zoom |
| Swipe left/right in a sheet | Change tab |
| Swipe down in a sheet | Close |

## Development

```bash
npm install
npm run build     # outputs dist/mobile-mode-mgk.js and .css
npm run check     # lint, smoke tests, build
```

### Releasing

Bump `version` in `module.json`, commit, and push to `master`. The release
workflow reads that field, publishes `v<version>` with `module.json` and
`module.zip` attached, and players get the update in Foundry. A version that
already has a release is skipped, so ordinary pushes are safe.

The module API is exposed at `game.modules.get("mobile-mode-mgk").api`.

## License

See [LICENSE](LICENSE).
