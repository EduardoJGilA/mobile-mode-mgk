import { esc, t } from '../core/utils.js';

/**
 * Shared markup builders for the mobile sheet tabs.
 * Everything here escapes its inputs and emits `data-action` hooks only —
 * SheetManager owns the listeners.
 */

/** Collapsible titled section. */
export function section(title, contentHtml, { count = null, open = true } = {}) {
  if (!contentHtml) return "";
  return `
    <details class="mgk-section"${open ? " open" : ""}>
      <summary class="mgk-section-title">
        <span>${esc(title)}${count !== null ? ` <span class="mgk-count">(${esc(count)})</span>` : ""}</span>
        <i class="fas fa-chevron-down"></i>
      </summary>
      <div class="mgk-section-body">${contentHtml}</div>
    </details>
  `;
}

/**
 * A tappable list row: icon, name, optional meta chips and a primary action.
 * `id` is emitted as data-item-id so the delegated handler can resolve it.
 */
export function itemRow({ id, img, name, subtitle = "", chips = [], action = "use-item", actionLabel = "", expandable = true }) {
  const chipHtml = chips.filter(Boolean).map(c => `<span class="mgk-chip">${esc(c)}</span>`).join("");
  return `
    <div class="mgk-row" data-item-id="${esc(id)}">
      <div class="mgk-row-main" data-action="${expandable ? "expand" : action}" data-item-id="${esc(id)}">
        <img class="mgk-row-img" src="${esc(img)}" alt="" loading="lazy">
        <div class="mgk-row-text">
          <span class="mgk-row-name">${esc(name)}</span>
          ${subtitle ? `<span class="mgk-row-sub">${esc(subtitle)}</span>` : ""}
        </div>
        <div class="mgk-row-chips">${chipHtml}</div>
      </div>
      <button type="button" class="mgk-row-action" data-action="${esc(action)}" data-item-id="${esc(id)}">
        ${actionLabel ? esc(actionLabel) : '<i class="fas fa-dice-d20"></i>'}
      </button>
      ${expandable ? `<div class="mgk-row-detail"></div>` : ""}
    </div>
  `;
}

/** Small labelled statistic tile. */
export function statBox(label, value, { action = null, key = null } = {}) {
  const attrs = action ? ` data-action="${esc(action)}"${key ? ` data-ability="${esc(key)}"` : ""}` : "";
  return `
    <div class="mgk-stat-box${action ? " tappable" : ""}"${attrs}>
      <div class="mgk-ability-label">${esc(label)}</div>
      <div class="mgk-ability-score">${esc(value)}</div>
    </div>
  `;
}

/** Horizontal pill selector, e.g. Action / Bonus / Reaction / Other. */
export function pills(items, activeId) {
  return `
    <div class="mgk-pills">
      ${items.map(i => `
        <button type="button" class="mgk-pill${i.id === activeId ? " active" : ""}" data-pill="${esc(i.id)}">
          ${esc(i.label)}
        </button>
      `).join("")}
    </div>
  `;
}

/** Slot pips, e.g. spell slots remaining out of maximum. */
export function pips(value, max) {
  if (!max) return "";
  let html = "";
  for (let i = 0; i < max; i++) html += `<span class="mgk-pip${i < value ? " filled" : ""}"></span>`;
  return `<span class="mgk-pips">${html}</span>`;
}

export function empty(message) {
  return `<div class="mgk-empty">${esc(message ?? t("Sheets.Empty", "Nothing here."))}</div>`;
}
