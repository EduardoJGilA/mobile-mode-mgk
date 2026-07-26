/**
 * System Agnostic Adapter for Mobile Character Sheet Drawer
 */
export class AgnosticAdapter {
  static getCharacterData(actor) {
    const hp = actor.system.hp || actor.system.attributes?.hp || { value: 10, max: 10 };
    return {
      actor,
      name: actor.name,
      img: actor.img,
      hp,
      items: actor.items.contents
    };
  }

  static renderCombatTab(data) {
    let html = `<div style="padding:10px; background:rgba(255,255,255,0.05); border-radius:10px; margin-bottom:12px;">
      <div><strong>HP:</strong> ${data.hp.value || 0} / ${data.hp.max || 0}</div>
    </div>`;

    html += `<h4>Items & Abilities</h4>`;
    data.items.slice(0, 15).forEach(item => {
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.04); border-radius:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${item.img}" style="width:32px; height:32px; border-radius:4px;">
            <span>${item.name}</span>
          </div>
          <button style="padding:4px 10px; background:var(--mgk-accent-gradient); border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="game.actors.get('${data.actor.id}').items.get('${item.id}').sheet.render(true)">View</button>
        </div>
      `;
    });

    return html;
  }
}
