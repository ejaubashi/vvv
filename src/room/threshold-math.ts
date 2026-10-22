import {
  Plane,
  Vector3,
  Vector4,
  WebGPUCoordinateSystem,
  type PerspectiveCamera,
} from "three/webgpu";

export const THRESHOLD_Z = -4.55;
export const ARRIVAL_Z = 1.8;
export const THRESHOLD_SHIFT = ARRIVAL_Z - THRESHOLD_Z;

/** Same view rays on both sides; the destination's near plane is the doorway. */
export function mapThresholdCamera(
  source: PerspectiveCamera,
  destination: PerspectiveCamera,
) {
  destination.copy(source, false);
  destination.position.z += THRESHOLD_SHIFT;
  destination.updateMatrixWorld(true);
  destination.updateProjectionMatrix();
  const plane = new Plane(new Vector3(0, 0, -1), ARRIVAL_Z);
  plane.applyMatrix4(destination.matrixWorldInverse);
  const p = new Vector4(
    plane.normal.x,
    plane.normal.y,
    plane.normal.z,
    plane.constant,
  );
  const q = new Vector4(
    Math.sign(p.x) || 1,
    Math.sign(p.y) || 1,
    1,
    1,
  ).applyMatrix4(destination.projectionMatrixInverse);
  const near = destination.coordinateSystem === WebGPUCoordinateSystem ? 0 : -1;
  p.multiplyScalar((1 - near) / p.dot(q));
  const e = destination.projectionMatrix.elements;
  e[2] = p.x + near * e[3];
  e[6] = p.y + near * e[7];
  e[10] = p.z + near * e[11];
  e[14] = p.w + near * e[15];
  destination.projectionMatrixInverse
    .copy(destination.projectionMatrix)
    .invert();
}

/** Finite approach driven by the application clock, with no automatic crossing. */
export class ThresholdApproach {
  progress = 0;
  active = false;
  start() {
    this.progress = 0;
    this.active = true;
  }
  cancel() {
    this.progress = 0;
    this.active = false;
  }
  step(dt: number, reduced: boolean) {
    if (!this.active) return false;
    this.progress = reduced
      ? 1
      : Math.min(1, this.progress + Math.max(0, Math.min(dt, 0.1)) / 2.6);
    return this.progress === 1;
  }
  get eased() {
    return this.progress * this.progress * (3 - 2 * this.progress);
  }
}
