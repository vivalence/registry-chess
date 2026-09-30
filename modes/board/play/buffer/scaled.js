import { ImageRenderable } from "@opentui/core";

export class ScaledImage extends ImageRenderable {
  cell = null;

  renderSelf(buffer) {
    if (this.cell === null) return super.renderSelf(buffer);
    if (this._image === null || this.width <= 0 || this.height <= 0) return;
    const width = Math.max(1, Math.round(this.width * this.cell.width));
    const height = Math.max(1, Math.round(this.height * this.cell.height));
    buffer.drawImage(this._image, this._screenX, this._screenY, this.width, this.height, width, height, 0, 0, this._image.width, this._image.height, this.protocol);
  }
}
