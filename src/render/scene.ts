import type { OpticalState, Scene } from "../state";
export class SceneTexture {
  canvas = document.createElement("canvas");
  ctx = this.canvas.getContext("2d", { alpha: false })!;
  private cache = document.createElement("canvas");
  private old = document.createElement("canvas");
  private scene: Scene | null = null;
  version = 0;
  private composition = -1;
  private lastReveal = -1;
  private lastMedia: CanvasImageSource | null = null;
  private lastTime = -1;
  resize(w: number, h: number) {
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const width = Math.round(w * scale),
      height = Math.round(h * scale);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = this.cache.width = this.old.width = width;
      this.canvas.height = this.cache.height = this.old.height = height;
      this.scene = null;
      this.lastReveal = -1;
    }
  }
  private paint(canvas: HTMLCanvasElement, scene: Scene, composition = 0) {
    const c = canvas.getContext("2d")!,
      w = canvas.width,
      h = canvas.height;
    const colors = [
      ["#f5f4f1", "#e5e4df", "#c4c3bf"],
      ["#d0d1d0", "#a5a8a7", "#777b7a"],
      ["#454747", "#292c2c", "#161919"],
    ][scene];
    const g = c.createRadialGradient(
      w * 0.42,
      h * 0.3,
      0,
      w * 0.5,
      h * 0.45,
      w * 0.85,
    );
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.6, colors[1]);
    g.addColorStop(1, colors[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (composition === 1) {
      this.sculpture(c, w, h, scene);
      return;
    }
    if (composition === 2) {
      this.veil(c, w, h, scene);
      return;
    }
    c.save();
    c.translate(w * 0.51, h * 0.52);
    c.rotate(-0.47);
    const shade = c.createLinearGradient(-w * 0.27, 0, w * 0.29, 0);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(0.3, "rgba(0,0,0,0)");
    shade.addColorStop(0.48, "rgba(0,0,0,.055)");
    shade.addColorStop(0.51, "rgba(255,255,255,.24)");
    shade.addColorStop(0.54, "rgba(255,255,255,.035)");
    shade.addColorStop(0.77, "rgba(0,0,0,0)");
    c.fillStyle = shade;
    c.fillRect(-w * 0.5, -h * 1.5, w, h * 3);
    c.restore();
    c.save();
    c.filter = `blur(${w * 0.036}px)`;
    const sun = c.createRadialGradient(
      w * 0.3,
      h * 0.13,
      0,
      w * 0.3,
      h * 0.13,
      w * 0.29,
    );
    sun.addColorStop(0, "rgba(255,255,255,.21)");
    sun.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);
    c.restore();
  }
  private sculpture(
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    scene: Scene,
  ) {
    const size = Math.min(w * 0.33, h * 0.34);
    c.save();
    c.translate(w * 0.57, h * 0.47);
    c.rotate(-0.45);
    c.save();
    c.filter = `blur(${size * 0.1}px)`;
    c.fillStyle = "rgba(0,0,0,.15)";
    c.beginPath();
    c.ellipse(
      size * 0.1,
      size * 0.7,
      size * 1.1,
      size * 0.25,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.restore();
    // A cached analytical tube profile gives the artwork curved normals, not a flat stroke.
    const tile = document.createElement("canvas");
    tile.width = tile.height = Math.min(768, Math.ceil(size * 2.5));
    const ctx = tile.getContext("2d")!,
      image = ctx.createImageData(tile.width, tile.height),
      pixels = image.data;
    const light = [-0.42, -0.62, 0.66],
      half = [-0.23, -0.34, 0.91];
    for (let y = 0; y < tile.height; y++)
      for (let x = 0; x < tile.width; x++) {
        const px = (x / tile.width - 0.5) * 2.42,
          py = (y / tile.height - 0.5) * 2.42;
        const distance = Math.hypot(px, py),
          tube = (distance - 1) / 0.165;
        if (Math.abs(tube) >= 1) continue;
        const nx = (tube * px) / Math.max(0.001, distance),
          ny = (tube * py) / Math.max(0.001, distance),
          nz = Math.sqrt(Math.max(0, 1 - tube * tube));
        const diffuse = Math.max(
          0,
          nx * light[0] + ny * light[1] + nz * light[2],
        );
        const specular = Math.pow(
          Math.max(0, nx * half[0] + ny * half[1] + nz * half[2]),
          28,
        );
        const value = Math.min(
          255,
          (scene === 2 ? 35 : 122) +
            diffuse * (scene === 2 ? 100 : 112) +
            specular * 28,
        );
        const index = (y * tile.width + x) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
        pixels[index + 3] = Math.min(
          255,
          (1 - Math.abs(tube)) * tile.width * 40,
        );
      }
    ctx.putImageData(image, 0, 0);
    c.drawImage(
      tile,
      -size * 1.21,
      -size * 0.73 * 1.21,
      size * 2.42,
      size * 0.73 * 2.42,
    );
    c.restore();
  }
  private veil(
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    scene: Scene,
  ) {
    c.save();
    for (let i = 0; i < 7; i++) {
      const x = w * (-0.1 + i * 0.2),
        band = w * 0.15;
      const gradient = c.createLinearGradient(x, 0, x + band, 0);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.36, "rgba(0,0,0,.08)");
      gradient.addColorStop(
        0.55,
        scene === 2 ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.42)",
      );
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gradient;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(
        x + w * 0.2,
        h * 0.32,
        x - w * 0.1,
        h * 0.68,
        x + w * 0.16,
        h,
      );
      c.lineTo(x + band + w * 0.16, h);
      c.bezierCurveTo(
        x + band - w * 0.1,
        h * 0.68,
        x + band + w * 0.2,
        h * 0.32,
        x + band,
        0,
      );
      c.closePath();
      c.fill();
    }
    c.restore();
  }
  captureReveal() {
    this.old.getContext("2d")!.drawImage(this.canvas, 0, 0);
  }
  draw(
    s: OpticalState,
    media: HTMLImageElement | HTMLVideoElement | null,
    frameVersion?: number,
  ) {
    const time =
      media instanceof HTMLVideoElement
        ? (frameVersion ?? media.currentTime)
        : 0;
    if (
      this.scene === s.scene &&
      this.composition === s.composition &&
      this.lastReveal === s.reveal &&
      this.lastMedia === media &&
      this.lastTime === time
    )
      return;
    this.lastReveal = s.reveal;
    this.lastMedia = media;
    this.lastTime = time;
    this.version++;
    const c = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height;
    if (this.scene !== s.scene || this.composition !== s.composition) {
      this.paint(this.cache, s.scene, s.composition);
      if (this.scene === null) this.paint(this.old, s.previousScene);
      else this.old.getContext("2d")!.drawImage(this.canvas, 0, 0);
      this.scene = s.scene;
      this.composition = s.composition;
    }
    c.drawImage(s.reveal < 1 ? this.old : this.cache, 0, 0);
    if (s.reveal < 1) {
      c.save();
      c.beginPath();
      c.arc(
        s.revealX * w,
        s.revealY * h,
        Math.hypot(w, h) * s.reveal,
        0,
        Math.PI * 2,
      );
      c.clip();
      c.drawImage(this.cache, 0, 0);
      c.restore();
    }
    if (media) {
      const mw =
          media instanceof HTMLVideoElement
            ? media.videoWidth
            : media.naturalWidth,
        mh =
          media instanceof HTMLVideoElement
            ? media.videoHeight
            : media.naturalHeight;
      if (mw && mh) {
        const scale = Math.max(w / mw, h / mh);
        c.save();
        c.filter = "grayscale(1)";
        c.drawImage(
          media,
          (w - mw * scale) / 2,
          (h - mh * scale) / 2,
          mw * scale,
          mh * scale,
        );
        c.restore();
      }
    }
  }
}
