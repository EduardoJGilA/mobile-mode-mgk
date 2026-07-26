import { esc } from '../core/utils.js';

/**
 * Swipeable avatar carousel for every actor the user owns.
 * Shows a live HP bar and highlights whoever is in combat.
 */
export class AvatarCarousel {
  static container = null;
  static activeActorId = null;

  static init() {
    this.render();

    // Keep the strip in sync with the world.
    for (const hook of ["createActor", "deleteActor", "updateUser"]) {
      Hooks.on(hook, () => this.render());
    }
    Hooks.on("updateActor", (actor) => this.updateActor(actor));
    Hooks.on("updateCombat", () => this.render());
    Hooks.on("deleteCombat", () => this.render());
    Hooks.on("controlToken", (token, controlled) => {
      if (controlled) this.setActive(token.actor?.id);
    });
  }

  static getActors() {
    return game.actors.filter(a => a.isOwner && a.hasPlayerOwner && a.type !== "vehicle");
  }

  static render() {
    let container = document.getElementById("mgk-avatar-carousel");
    if (!container) {
      container = document.createElement("div");
      container.id = "mgk-avatar-carousel";
      document.body.appendChild(container);
      container.addEventListener("click", (ev) => this.onClick(ev));
    }
    this.container = container;

    const actors = this.getActors();
    if (!actors.length) {
      container.style.display = "none";
      return;
    }
    container.style.display = "flex";

    if (!actors.some(a => a.id === this.activeActorId)) this.activeActorId = actors[0].id;

    container.innerHTML = actors.map(actor => this.bubbleHtml(actor)).join("");
  }

  static bubbleHtml(actor) {
    const hp = this.getHp(actor);
    const pct = hp.max > 0 ? Math.max(0, Math.min(100, (hp.value / hp.max) * 100)) : 100;
    const inCombat = !!game.combat?.combatants?.some(c => c.actorId === actor.id);

    return `
      <div class="mgk-avatar-bubble${actor.id === this.activeActorId ? " active" : ""}${inCombat ? " in-combat" : ""}"
           data-actor-id="${esc(actor.id)}" title="${esc(actor.name)}">
        <img src="${esc(actor.img)}" alt="${esc(actor.name)}">
        <div class="mgk-avatar-hp${pct <= 33 ? " low" : ""}"><span style="width:${esc(pct)}%"></span></div>
      </div>
    `;
  }

  static getHp(actor) {
    const hp = actor.system?.attributes?.hp ?? actor.system?.hp ?? {};
    return { value: Number(hp.value) || 0, max: Number(hp.max) || 0 };
  }

  /** Cheap partial update so an HP change does not rebuild the whole strip. */
  static updateActor(actor) {
    const bubble = this.container?.querySelector(`[data-actor-id="${CSS.escape(actor.id)}"]`);
    if (!bubble) return;
    const hp = this.getHp(actor);
    const pct = hp.max > 0 ? Math.max(0, Math.min(100, (hp.value / hp.max) * 100)) : 100;
    const bar = bubble.querySelector(".mgk-avatar-hp");
    bar.classList.toggle("low", pct <= 33);
    bar.querySelector("span").style.width = `${pct}%`;
  }

  static setActive(actorId) {
    if (!actorId || !this.container) return;
    this.activeActorId = actorId;
    this.container.querySelectorAll(".mgk-avatar-bubble").forEach(b => {
      b.classList.toggle("active", b.dataset.actorId === actorId);
    });
  }

  static onClick(ev) {
    const bubble = ev.target.closest(".mgk-avatar-bubble");
    if (!bubble) return;
    const actor = game.actors.get(bubble.dataset.actorId);
    if (!actor) return;

    // First tap focuses the token; tapping the already-active one opens the sheet.
    const wasActive = this.activeActorId === actor.id;
    this.setActive(actor.id);

    const token = actor.getActiveTokens()[0];
    if (token && canvas?.ready) {
      canvas.animatePan({ x: token.center.x, y: token.center.y });
      token.control({ releaseOthers: true });
    }

    if (wasActive || !token) Hooks.callAll("mobileModeOpenSheet", actor);
  }
}
