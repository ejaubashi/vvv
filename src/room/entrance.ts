import { clamp } from "../state";

export interface EntranceFrame {
  x: number;
  y: number;
  radius: number;
  stretch: number;
  angle: number;
  opacity: number;
  impactX: number;
  impactY: number;
  rippleRadius: number;
  rippleStrength: number;
}

const ease = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A finite score advanced only by the application's animation clock. */
export class LensEntrance {
  static readonly duration = 1.4;
  elapsed = 0;
  running = false;
  private ready = false;
  private contacted = false;
  readonly frame: EntranceFrame = {
    x: 0,
    y: 0,
    radius: 23,
    stretch: 1,
    angle: -0.35,
    opacity: 0,
    impactX: 0,
    impactY: 0,
    rippleRadius: 0,
    rippleStrength: 0,
  };

  begin(reduced: boolean) {
    this.elapsed = reduced ? LensEntrance.duration : 0;
    this.ready = false;
    this.contacted = false;
    this.running = !reduced;
  }

  cancel() {
    this.running = false;
    this.elapsed = 0;
    this.ready = false;
    this.contacted = false;
  }

  /** Returns true once, at contact, for an optional synchronized audio cue. */
  step(dt: number, reduced: boolean, roomVisible: boolean) {
    if (!this.running) return false;
    if (reduced) {
      this.elapsed = LensEntrance.duration;
      this.running = false;
      return false;
    }
    this.ready ||= roomVisible;
    if (!this.ready) return false;
    this.elapsed = Math.min(
      LensEntrance.duration,
      this.elapsed + clamp(dt, 0, 0.25),
    );
    const contact = !this.contacted && this.elapsed >= 0.38;
    this.contacted ||= contact;
    if (this.elapsed >= LensEntrance.duration) this.running = false;
    return contact;
  }

  get immersion() {
    return ease(0.5, LensEntrance.duration, this.elapsed);
  }

  get phase() {
    if (!this.running) return "idle";
    if (!this.ready) return "waiting";
    return this.elapsed < 0.38
      ? "approach"
      : this.elapsed < 0.5
        ? "contact"
        : "expanding";
  }

  layout(
    x: number,
    y: number,
    radius: number,
    width: number,
    visible: boolean,
    rightInset = 0,
  ) {
    const f = this.frame;
    const side = x + radius + 78 > width - rightInset ? -1 : 1;
    const t = this.running ? this.elapsed : 0;
    const approach = ease(0, 0.42, t);
    const sink = ease(0.38, 0.7, t);
    const start = Math.min(
      radius + 30,
      side > 0 ? width - rightInset - x - 32 : x - 32,
    );
    f.radius = width < 600 ? 20 : 23;
    const restingHeight =
      width < 600 && start < radius + f.radius + 10 ? 0.72 : 0.43;
    f.x =
      x +
      side *
        (start * (1 - approach) +
          radius * 0.68 * approach -
          radius * 0.4 * sink);
    f.y =
      y -
      radius * (restingHeight * (1 - approach) + 0.43 * approach) +
      Math.sin(approach * Math.PI) * radius * 0.1 +
      sink * radius * 0.18;
    f.stretch = 1 + Math.sin(approach * Math.PI) * 0.65 - sink * 0.55;
    f.angle = side * -0.35;
    f.opacity = visible ? 1 - ease(0.43, 0.68, t) : 0;
    f.impactX = x + side * radius * 0.68;
    f.impactY = y - radius * 0.43;
    const wave = clamp((t - 0.38) / 0.94, 0, 1);
    f.rippleRadius = 12 + wave * radius * 2.8;
    f.rippleStrength =
      this.running && t > 0.38
        ? Math.sin(Math.PI * wave) * (1 - this.immersion * 0.65)
        : 0;
    return f;
  }
}
