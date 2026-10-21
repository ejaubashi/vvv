import { clamp } from "../state";
import type { Motion } from "../motion";

export interface VisitBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  round: number;
}
/** The same spring progress drives the glass frame and room camera. */
export function visitBounds(
  out: VisitBounds,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  progress: number,
) {
  const t = clamp(progress, 0, 1),
    inset = width < 600 ? 10 : 16;
  out.x = x + (width / 2 - x) * t;
  out.y = y + (height / 2 - y) * t;
  out.width = radius * 2 + (Math.max(1, width - inset * 2) - radius * 2) * t;
  out.height = radius * 2 + (Math.max(1, height - inset * 2) - radius * 2) * t;
  out.round = radius + ((width < 600 ? 18 : 24) - radius) * t;
  return out;
}
export function roomFrameSize(longEdge: number, aspect = 1, expanded = false) {
  longEdge = Math.max(
    512,
    Math.min(expanded ? 1536 : 1024, Math.round(longEdge / 64) * 64),
  );
  aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return {
    width: aspect >= 1 ? longEdge : Math.max(1, Math.round(longEdge * aspect)),
    height: aspect >= 1 ? Math.max(1, Math.round(longEdge / aspect)) : longEdge,
    longEdge,
  };
}

/** Direct exploration has no independent animation loop; it only sets shared spring targets. */
export class RoomViewInputs {
  private controller = new AbortController();
  private pointer: number | null = null;
  private startX = 0;
  private startY = 0;
  private viewX = 0;
  private viewY = 0;
  get dragging() {
    return this.pointer !== null;
  }
  constructor(
    surface: HTMLElement,
    motion: Motion,
    enabled: () => boolean,
    wake: () => void,
  ) {
    const signal = this.controller.signal;
    const end = () => {
      if (this.pointer !== null && surface.hasPointerCapture(this.pointer))
        surface.releasePointerCapture(this.pointer);
      this.pointer = null;
    };
    surface.addEventListener(
      "pointerdown",
      (event) => {
        if (!enabled() || event.button !== 0 || this.pointer !== null) return;
        this.pointer = event.pointerId;
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.viewX = motion.viewX.target;
        this.viewY = motion.viewY.target;
        surface.setPointerCapture(event.pointerId);
        surface.focus({ preventScroll: true });
      },
      { signal },
    );
    surface.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== this.pointer || !enabled()) return;
        motion.viewX.target = clamp(
          this.viewX +
            (event.clientX - this.startX) / Math.max(180, innerWidth * 0.4),
          -1,
          1,
        );
        motion.viewY.target = clamp(
          this.viewY +
            (event.clientY - this.startY) / Math.max(180, innerHeight * 0.4),
          -1,
          1,
        );
        wake();
      },
      { signal },
    );
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      surface.addEventListener(name, end, { signal });
    window.addEventListener("blur", end, { signal });
    surface.addEventListener(
      "keydown",
      (event) => {
        if (
          !enabled() ||
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        motion.viewX.target = clamp(
          motion.viewX.target +
            (event.key === "ArrowLeft"
              ? -0.12
              : event.key === "ArrowRight"
                ? 0.12
                : 0),
          -1,
          1,
        );
        motion.viewY.target = clamp(
          motion.viewY.target +
            (event.key === "ArrowUp"
              ? -0.12
              : event.key === "ArrowDown"
                ? 0.12
                : 0),
          -1,
          1,
        );
        wake();
      },
      { signal },
    );
  }
  dispose() {
    this.controller.abort();
    this.pointer = null;
  }
}
