import { MODULE_ID } from './utils.js';

/**
 * SocketUtil Wrapper for Socketlib Integration
 */
export class SocketUtil {
  static socket = null;

  static init() {
    if (typeof socketlib === 'undefined') {
      console.warn("Mobile Mode MGK | socketlib module not found. Socket communications disabled.");
      return;
    }

    this.socket = socketlib.registerModule(MODULE_ID);

    // Register socket functions
    this.socket.register("validateTokenMovement", this._onValidateTokenMovement.bind(this));
    this.socket.register("requestVramDiagnostics", this._onRequestVramDiagnostics.bind(this));
  }

  /**
   * Ask the GM whether a token may move to `newPos` (a top-left corner).
   * Falls open: any failure allows the move, since Foundry still enforces
   * its own movement restrictions server-side.
   */
  static async validateTokenMovement(tokenId, newPos) {
    if (!this.socket) return true;
    if (game.user.isGM) return this._onValidateTokenMovement(tokenId, newPos);
    if (!game.users.some(u => u.isGM && u.active)) return true;

    try {
      return await this.socket.executeAsGM("validateTokenMovement", tokenId, newPos);
    } catch (err) {
      console.warn("Mobile Mode MGK | Wall validation failed, allowing move.", err);
      return true;
    }
  }

  static async _onValidateTokenMovement(tokenId, newPos) {
    if (!canvas?.ready) return true;
    const token = canvas.tokens.get(tokenId);
    if (!token) return true;
    if (!canvas.walls?.placeables?.length) return true;

    const w = token.w ?? (token.document.width * canvas.grid.sizeX);
    const h = token.h ?? (token.document.height * canvas.grid.sizeY);

    // Read from the document, not the placeable: a local drag preview may have
    // moved token.position without committing it.
    const from = { x: token.document.x + w / 2, y: token.document.y + h / 2 };
    const to = { x: newPos.x + w / 2, y: newPos.y + h / 2 };

    const collision = CONFIG.Canvas.polygonBackends.move.testCollision(from, to, {
      type: "move",
      mode: "any"
    });

    return !collision;
  }

  static async _onRequestVramDiagnostics() {
    // GM diagnostic handler
    return { ok: true };
  }
}
