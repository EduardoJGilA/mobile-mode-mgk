/**
 * DnD5e System Adapter matching 100% Swipe-VTT Sheet Demo Screenshot
 */
export class DnD5eAdapter {
  static getCharacterData(actor) {
    const system = actor.system;

    const hp = system.attributes?.hp || { value: 0, max: 0, temp: 0 };
    const ac = system.attributes?.ac?.value || 10;
    const speed = system.attributes?.movement?.walk || 30;
    const init = system.attributes?.init?.total || 0;
    const hd = system.attributes?.hd || { value: 1, max: 1 };

    let raceName = "Dwarf";
    if (typeof system.details?.race === 'string') raceName = system.details.race;
    else if (system.details?.race?.name) raceName = system.details.race.name;

    const className = Object.values(actor.itemTypes?.class || {}).map(c => `${c.name} ${c.system.levels}`).join(" / ") || "Fighter 2";

    const abilities = system.abilities || {};
    const skills = system.skills || {};
    const currency = system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

    const weapons = actor.items.filter(i => i.type === "weapon");
    const spells = actor.items.filter(i => i.type === "spell");
    const equipment = actor.items.filter(i => ["equipment", "consumable", "loot", "container"].includes(i.type));

    return {
      actor,
      name: actor.name,
      img: actor.img,
      raceName,
      className,
      hp,
      ac,
      speed,
      init,
      hd,
      abilities,
      skills,
      currency,
      weapons,
      spells,
      equipment
    };
  }

  static renderCombatTab(data) {
    return `
      <div class="mgk-sheet-content">
        <!-- Left Column: Ability Scores & Skills -->
        <div class="mgk-col-left">
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:10px;">
            <div class="mgk-stat-box">
              <div class="mgk-ability-label">AC</div>
              <div class="mgk-ability-score">${data.ac}</div>
            </div>
            <div class="mgk-stat-box">
              <div class="mgk-ability-label">SPEED</div>
              <div class="mgk-ability-score">${data.speed}</div>
            </div>
            <div class="mgk-stat-box">
              <div class="mgk-ability-label">HIT DICE</div>
              <div class="mgk-ability-score">${data.hd.value}/${data.hd.max}</div>
            </div>
            <div class="mgk-stat-box">
              <div class="mgk-ability-label">INIT</div>
              <div class="mgk-ability-score">+${data.init}</div>
            </div>
          </div>

          <!-- Ability Grid -->
          <div class="mgk-ability-grid">
            ${Object.entries(data.abilities).map(([key, ab]) => `
              <div class="mgk-ability-card">
                <div class="mgk-ability-label">${key.toUpperCase()}</div>
                <div class="mgk-ability-score">${ab.value || 10}</div>
                <div class="mgk-ability-mod">${ab.mod >= 0 ? '+' : ''}${ab.mod || 0}</div>
                <div class="mgk-save-mod">SAVE ${ab.save >= 0 ? '+' : ''}${ab.save || 0}</div>
              </div>
            `).join('')}
          </div>

          <!-- Skills Section -->
          <h4 style="margin-top:14px; margin-bottom:6px;">Skills</h4>
          <div style="background:var(--mgk-bg-card); border:1px solid var(--mgk-border-glass); border-radius:10px; padding:8px;">
            ${Object.entries(data.skills).slice(0, 10).map(([key, sk]) => `
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="text-transform:capitalize;">${key}</span>
                <span style="font-weight:700;">+${sk.total || 0}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Middle Column: Quick Actions & Spells -->
        <div class="mgk-col-mid">
          <div class="mgk-actions-row">
            <div class="mgk-action-btn"><i class="fas fa-running"></i>Dash</div>
            <div class="mgk-action-btn"><i class="fas fa-shield-alt"></i>Dodge</div>
            <div class="mgk-action-btn"><i class="fas fa-hand-paper"></i>Disengage</div>
            <div class="mgk-action-btn"><i class="fas fa-fist-raised"></i>Grapple</div>
            <div class="mgk-action-btn"><i class="fas fa-user-ninja"></i>Hide</div>
          </div>

          <h4>Weapons & Attacks</h4>
          ${data.weapons.map(w => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:6px; background:var(--mgk-bg-card); border:1px solid var(--mgk-border-glass); border-radius:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <img src="${w.img}" style="width:32px; height:32px; border-radius:4px;">
                <span style="font-size:0.9rem; font-weight:600;">${w.name}</span>
              </div>
              <button style="padding:4px 12px; background:var(--mgk-accent-gradient); border:none; border-radius:6px; color:#fff; font-size:0.8rem; cursor:pointer;" onclick="game.actors.get('${data.actor.id}').items.get('${w.id}').use()">Roll</button>
            </div>
          `).join('')}

          <h4 style="margin-top:14px;">Spells & Cantrips</h4>
          ${data.spells.map(s => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:6px; background:var(--mgk-bg-card); border:1px solid var(--mgk-border-glass); border-radius:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <img src="${s.img}" style="width:32px; height:32px; border-radius:4px;">
                <span style="font-size:0.9rem; font-weight:600;">${s.name}</span>
              </div>
              <button style="padding:4px 12px; background:var(--mgk-accent-gradient); border:none; border-radius:6px; color:#fff; font-size:0.8rem; cursor:pointer;" onclick="game.actors.get('${data.actor.id}').items.get('${s.id}').use()">Cast</button>
            </div>
          `).join('')}
        </div>

        <!-- Right Column: Currency & Inventory -->
        <div class="mgk-col-right">
          <h4>Currency</h4>
          <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:4px; text-align:center; background:var(--mgk-bg-card); padding:8px; border-radius:8px; border:1px solid var(--mgk-border-glass);">
            <div><small style="color:var(--mgk-text-muted);">PP</small><div>${data.currency.pp || 0}</div></div>
            <div><small style="color:var(--mgk-text-muted);">GP</small><div>${data.currency.gp || 0}</div></div>
            <div><small style="color:var(--mgk-text-muted);">EP</small><div>${data.currency.ep || 0}</div></div>
            <div><small style="color:var(--mgk-text-muted);">SP</small><div>${data.currency.sp || 0}</div></div>
            <div><small style="color:var(--mgk-text-muted);">CP</small><div>${data.currency.cp || 0}</div></div>
          </div>

          <h4 style="margin-top:14px;">Equipment (${data.equipment.length})</h4>
          ${data.equipment.map(e => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; margin-bottom:4px; background:var(--mgk-bg-card); border-radius:6px; font-size:0.85rem;">
              <div style="display:flex; align-items:center; gap:6px;">
                <img src="${e.img}" style="width:24px; height:24px; border-radius:4px;">
                <span>${e.name}</span>
              </div>
              <span style="color:var(--mgk-text-muted);">x${e.system.quantity || 1}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}
