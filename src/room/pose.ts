import { clamp } from "../state";
export interface RoomPose {
  x: number;
  y: number;
  z: number;
}
/** One camera pose derived from the authoritative lens/gesture springs. */
export function roomPose(
  out: RoomPose,
  lookX: number,
  lookY: number,
  lensX: number,
  lensY: number,
  pressure: number,
  depth: number,
  immersion = 0,
) {
  immersion = clamp(immersion, 0, 1);
  out.x = clamp(lookX * 0.65 + lensX * 0.45, -1.05, 1.05);
  out.y = 1.55 - clamp(lookY * 0.22 + lensY * 0.18, -0.4, 0.4);
  out.y += immersion * 0.08;
  out.z =
    6.2 -
    clamp(depth, 0, 2) * 0.2 -
    clamp(pressure, 0, 1) * 0.45 -
    immersion * 1.15;
  return out;
}
