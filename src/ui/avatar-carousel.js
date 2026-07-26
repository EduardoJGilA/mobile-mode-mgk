/**
 * Swipeable Avatar Carousel UI matching 100% Swipe-VTT Demo
 */
export class AvatarCarousel {
  static render() {
    let container = document.getElementById("mgk-avatar-carousel");
    if (!container) {
      container = document.createElement("div");
      container.id = "mgk-avatar-carousel";
      document.body.appendChild(container);
    }

    container.innerHTML = "";

    const ownedActors = game.actors.filter(a => a.isOwner && a.type === "character");
    if (ownedActors.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";

    ownedActors.forEach((actor, index) => {
      const bubble = document.createElement("div");
      bubble.className = `mgk-avatar-bubble ${index === 0 ? 'active' : ''}`;
      bubble.title = actor.name;
      bubble.innerHTML = `<img src="${actor.img}" alt="${actor.name}">`;

      bubble.addEventListener("click", () => {
        document.querySelectorAll(".mgk-avatar-bubble").forEach(b => b.classList.remove("active"));
        bubble.classList.add("active");

        const token = actor.getActiveTokens()[0];
        if (token) {
          canvas.pan({ x: token.x, y: token.y });
          token.control({ releaseOthers: true });
        }

        Hooks.callAll("mobileModeOpenSheet", actor);
      });

      container.appendChild(bubble);
    });
  }
}
