import { clamp } from "./state";
export class Spring {
  x: number;
  velocity = 0;
  target: number;
  constructor(
    value = 0,
    public stiffness = 160,
    public damping = 24,
  ) {
    this.x = this.target = value;
  }
  step(dt: number) {
    dt = clamp(dt, 0, 0.25);
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity +=
        ((this.target - this.x) * this.stiffness -
          this.velocity * this.damping) *
        h;
      this.x += this.velocity * h;
    }
    if (
      Math.abs(this.target - this.x) < 0.001 &&
      Math.abs(this.velocity) < 0.002
    ) {
      this.x = this.target;
      this.velocity = 0;
    }
  }
  snap(v: number) {
    this.x = this.target = v;
    this.velocity = 0;
  }
  get moving() {
    return this.x !== this.target || this.velocity !== 0;
  }
}
export class Motion {
  x = new Spring();
  y = new Spring();
  dx = new Spring();
  dy = new Spring();
  intensity = new Spring();
  morph = new Spring(0, 100, 21);
  light = new Spring((-135 * Math.PI) / 180, 65, 17);
  audio = new Spring(0, 90, 19);
  reduced = false;
  readonly springs = [
    this.x,
    this.y,
    this.dx,
    this.dy,
    this.intensity,
    this.morph,
    this.light,
    this.audio,
  ];
  step(dt: number) {
    for (const spring of this.springs)
      this.reduced ? spring.snap(spring.target) : spring.step(dt);
  }
  get moving() {
    return this.springs.some((s) => s.moving);
  }
  release() {
    this.dx.target = this.dy.target = this.intensity.target = 0;
  }
  reset(x: number, y: number) {
    this.x.target = x;
    this.y.target = y;
    this.release();
  }
}
