import type { OpticalState, Scene } from "../state";
export class SceneTexture {
  canvas = document.createElement("canvas");
  ctx = this.canvas.getContext("2d", { alpha: false })!;
  private cache = document.createElement("canvas");
  private old = document.createElement("canvas");
  private scene: Scene | null = null;
  version = 0;
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
  private paint(canvas: HTMLCanvasElement, scene: Scene) {
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
  draw(s: OpticalState, media: HTMLImageElement | HTMLVideoElement | null) {
    const time = media instanceof HTMLVideoElement ? media.currentTime : 0;
    if (
      this.scene === s.scene &&
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
    if (this.scene !== s.scene) {
      this.paint(this.cache, s.scene);
      if (this.scene === null) this.paint(this.old, s.previousScene);
      else this.old.getContext("2d")!.drawImage(this.canvas, 0, 0);
      this.scene = s.scene;
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
