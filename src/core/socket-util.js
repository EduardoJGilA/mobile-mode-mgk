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

    this.socket = socketlib.registerModule("mobile-mode-mgk");

    // Register socket functions
    this.socket.register("validateTokenMovement", this._onValidateTokenMovement.bind(this));
    this.socket.register("requestVramDiagnostics", this._onRequestVramDiagnostics.bind(this));
  }

  static async validateTokenMovement(tokenId, newPos) {
    if (!this.socket) return true;
    return await this.socket.executeAsGM("validateTokenMovement", tokenId, newPos);
  }

  static async _onValidateTokenMovement(tokenId, newPos) {
    if (!canvas?.ready) return true;
    const token = canvas.tokens.get(tokenId);
    if (!token) return true;

    // Perform polygon collision test against scene walls
    const collision = CONFIG.Canvas.polygonBackends.move.testCollision(
      token.center,
      { x: newPos.x + token.w / 2, y: newPos.y + token.h / 2 },
      { type: "move", mode: "any" }
    );

    return !collision;
  }

  static async _onRequestVramDiagnostics() {
    // GM diagnostic handler
    return { ok: true };
  }
}
