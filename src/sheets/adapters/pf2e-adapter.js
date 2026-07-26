/**
 * PF2e System Adapter for Mobile Character Sheet Drawer
 */
export class PF2eAdapter {
  static getCharacterData(actor) {
    const system = actor.system;
    const hp = system.attributes?.hp || { value: 0, max: 0, temp: 0 };
    const ac = system.attributes?.ac?.value || 10;

    const strikes = system.actions?.filter(a => a.type === "strike") || [];
    const inventory = actor.items.filter(i => ["physical", "weapon", "armor", "equipment", "consumable"].includes(i.type));

    return {
      actor,
      name: actor.name,
      img: actor.img,
      hp,
      ac,
      strikes,
      inventory
    };
  }

  static renderCombatTab(data) {
    let html = `<div style="display:flex; gap:12px; margin-bottom:14px; background:rgba(255,255,255,0.05); padding:10px; border-radius:10px;">
      <div><strong>AC:</strong> ${data.ac}</div>
    </div>`;

    html += `<h4>Strikes & Actions</h4>`;
    data.strikes.forEach(s => {
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.04); border-radius:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${s.img || data.img}" style="width:32px; height:32px; border-radius:4px;">
            <span>${s.name}</span>
          </div>
          <button style="padding:4px 10px; background:var(--mgk-accent-gradient); border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="game.actors.get('${data.actor.id}').system.actions[${data.strikes.indexOf(s)}].variants[0]?.roll()">Strike</button>
        </div>
      `;
    });

    return html;
  }
}
