import type { Motion } from "../motion";
import { clamp } from "../state";

export interface UnravelFrame {
  amount: number;
  phase: number;
  brushX: number;
  brushY: number;
  flowX: number;
  flowY: number;
}

/** Gesture state advances only on FORM's shared clock; geometry is never accumulated. */
export class Unravel {
  enabled = false;
  holding = false;
  readonly frame: UnravelFrame = {
    amount: 0,
    phase: 0,
    brushX: 0,
    brushY: 0,
    flowX: 0,
    flowY: 0,
  };
  constructor(private motion: Motion) {}
  setEnabled(value: boolean) {
    this.enabled = value && !this.motion.reduced;
    if (!this.enabled) this.reset();
  }
  press(x = 0, y = 0) {
    if (!this.enabled || this.motion.reduced) return;
    this.holding = true;
    this.frame.brushX = clamp(x, -1, 1);
    this.frame.brushY = clamp(y, -1, 1);
    this.motion.unravel.target = 1;
    this.motion.unravelX.target = this.motion.unravelY.target = 0;
  }
  drag(x: number, y: number) {
    if (!this.holding || this.motion.reduced) return;
    this.motion.unravelX.target = clamp(x, -1, 1);
    this.motion.unravelY.target = clamp(y, -1, 1);
  }
  release() {
    this.holding = false;
    this.motion.unravel.target = 0;
  }
  reset() {
    this.holding = false;
    this.motion.unravel.snap(0);
    this.motion.unravelX.snap(0);
    this.motion.unravelY.snap(0);
    Object.assign(this.frame, { amount: 0, phase: 0, flowX: 0, flowY: 0 });
  }
  step(dt: number) {
    if (this.motion.reduced) this.setEnabled(false);
    else if (!this.enabled) this.reset();
    this.frame.amount = clamp(this.motion.unravel.x, 0, 1);
    this.frame.flowX = clamp(this.motion.unravelX.x, -1, 1);
    this.frame.flowY = clamp(this.motion.unravelY.x, -1, 1);
    if (this.active) this.frame.phase += Math.max(0, Math.min(dt, 0.25));
    else this.frame.phase = 0;
  }
  get active() {
    return (
      this.enabled &&
      (this.holding || this.motion.unravel.moving || this.frame.amount > 0)
    );
  }
}

/** A separate, deliberate gesture mode keeps view navigation and sculpting unambiguous. */
export class UnravelInputs {
  private controller = new AbortController();
  private pointer: number | null = null;
  private startX = 0;
  private startY = 0;
  private keyHeld = false;
  constructor(
    private surface: HTMLElement,
    private state: Unravel,
    private available: () => boolean,
    private wake: () => void,
  ) {
    const signal = this.controller.signal;
    surface.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !this.ready() ||
          event.button !== 0 ||
          this.pointer !== null ||
          this.keyHeld
        )
          return;
        event.preventDefault();
        this.pointer = event.pointerId;
        this.startX = event.clientX;
        this.startY = event.clientY;
        const rect = surface.getBoundingClientRect();
        this.state.press(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        );
        surface.setPointerCapture(event.pointerId);
        surface.focus({ preventScroll: true });
        wake();
      },
      { signal },
    );
    surface.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== this.pointer || !this.ready()) return;
        const rect = surface.getBoundingClientRect();
        this.state.drag(
          ((event.clientX - this.startX) / rect.width) * 2,
          (-(event.clientY - this.startY) / rect.height) * 2,
        );
        wake();
      },
      { signal },
    );
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      surface.addEventListener(
        name,
        (event) => {
          if ((event as PointerEvent).pointerId === this.pointer) this.end();
        },
        { signal },
      );
    surface.addEventListener(
      "contextmenu",
      (event) => {
        if (this.ready()) event.preventDefault();
      },
      { signal },
    );
    surface.addEventListener(
      "keydown",
      (event) => {
        if (!this.ready()) return;
        if (event.code === "Space") {
          event.preventDefault();
          if (!event.repeat && this.pointer === null && !this.keyHeld) {
            this.keyHeld = true;
            this.state.press();
            wake();
          }
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.cancel();
          this.state.setEnabled(false);
          wake();
        } else if (event.key.startsWith("Arrow") && this.keyHeld) {
          event.preventDefault();
          this.state.drag(
            this.state.frame.flowX +
              (event.key === "ArrowRight"
                ? 0.14
                : event.key === "ArrowLeft"
                  ? -0.14
                  : 0),
            this.state.frame.flowY +
              (event.key === "ArrowUp"
                ? 0.14
                : event.key === "ArrowDown"
                  ? -0.14
                  : 0),
          );
          wake();
        }
      },
      { signal },
    );
    surface.addEventListener(
      "keyup",
      (event) => {
        if (event.code === "Space" && this.keyHeld) {
          event.preventDefault();
          this.end();
        }
      },
      { signal },
    );
    surface.addEventListener("blur", () => this.cancel(), { signal });
    window.addEventListener("blur", () => this.cancel(), { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.cancel();
      },
      { signal },
    );
  }
  private ready() {
    return this.available() && this.state.enabled;
  }
  private end() {
    const id = this.pointer;
    this.pointer = null;
    this.keyHeld = false;
    if (id !== null && this.surface.hasPointerCapture(id))
      this.surface.releasePointerCapture(id);
    this.state.release();
    this.wake();
  }
  cancel() {
    this.end();
    this.state.reset();
  }
  dispose() {
    this.cancel();
    this.controller.abort();
  }
}
