import { clamp } from "./state";
import type { Motion } from "./motion";
export interface GestureOptions {
  lens: HTMLButtonElement;
  motion: Motion;
  inspect: () => boolean;
  magnet: () => number;
  blocked: () => boolean;
  wake: () => void;
  openActions: () => void;
  closeActions: () => void;
  preview: (x: number, y: number) => void;
  select: (x: number, y: number) => void;
  bounds: () => { width: number; height: number; radius: number };
}
export class Gestures {
  private controller = new AbortController();
  private active: number | null = null;
  private px = 0;
  private py = 0;
  private time = 0;
  private offsetX = 0;
  private offsetY = 0;
  constructor(private o: GestureOptions) {
    const signal = this.controller.signal;
    o.lens.addEventListener("pointerdown", this.down, { signal });
    o.lens.addEventListener("pointermove", this.move, { signal });
    o.lens.addEventListener("pointerup", this.up, { signal });
    o.lens.addEventListener("pointercancel", this.cancel, { signal });
    o.lens.addEventListener(
      "lostpointercapture",
      () => {
        if (this.active !== null) this.cancel();
      },
      { signal },
    );
    window.addEventListener("pointermove", this.proximity, {
      signal,
      passive: true,
    });
    window.addEventListener("blur", this.cancel, { signal });
  }
  private down = (e: PointerEvent) => {
    if (this.o.blocked() || this.active !== null || e.button !== 0) return;
    this.active = e.pointerId;
    this.px = e.clientX;
    this.py = e.clientY;
    this.time = e.timeStamp;
    this.offsetX = this.o.motion.x.x - e.clientX;
    this.offsetY = this.o.motion.y.x - e.clientY;
    this.o.lens.setPointerCapture(e.pointerId);
    this.o.motion.intensity.target =
      e.pointerType === "pen" && e.pressure > 0
        ? clamp(e.pressure, 0.2, 1)
        : 0.65;
    if (!this.o.inspect()) this.o.openActions();
    this.o.wake();
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.active) return;
    const dt = Math.max(8, e.timeStamp - this.time),
      vx = clamp((e.clientX - this.px) / dt, -3, 3),
      vy = clamp((e.clientY - this.py) / dt, -3, 3);
    this.o.motion.dx.target = vx;
    this.o.motion.dy.target = vy;
    this.o.motion.intensity.target = clamp(
      0.35 + Math.hypot(vx, vy) * 0.15,
      0,
      1,
    );
    if (this.o.inspect()) {
      const b = this.o.bounds();
      this.o.motion.x.target = clamp(
        e.clientX + this.offsetX,
        b.radius + 12,
        b.width - b.radius - 12,
      );
      this.o.motion.y.target = clamp(
        e.clientY + this.offsetY,
        b.radius + 85,
        b.height - b.radius - 145,
      );
    } else this.o.preview(e.clientX, e.clientY);
    this.px = e.clientX;
    this.py = e.clientY;
    this.time = e.timeStamp;
    this.o.wake();
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.active) return;
    this.active = null;
    if (this.o.lens.hasPointerCapture(e.pointerId))
      this.o.lens.releasePointerCapture(e.pointerId);
    this.o.motion.release();
    if (!this.o.inspect()) this.o.select(e.clientX, e.clientY);
    this.o.wake();
  };
  private cancel = () => {
    this.active = null;
    this.o.motion.release();
    this.o.closeActions();
    this.o.wake();
  };
  private proximity = (e: PointerEvent) => {
    if (this.active !== null || this.o.blocked() || e.pointerType === "touch")
      return;
    const dx = e.clientX - this.o.motion.x.x,
      dy = e.clientY - this.o.motion.y.x;
    const distance = Math.hypot(dx, dy),
      strength = clamp(1 - distance / 300, 0, 1) * this.o.magnet();
    this.o.motion.dx.target = (dx / 300) * strength;
    this.o.motion.dy.target = (dy / 300) * strength;
    this.o.motion.intensity.target = strength * 0.12;
    this.o.wake();
  };
  dispose() {
    this.controller.abort();
  }
}
