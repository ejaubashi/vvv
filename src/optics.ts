import { clamp } from "./state";

/** Schlick's dielectric approximation; inputs are air-to-material and remain neutral. */
export function fresnelReflectance(ior: number, cosine: number): number {
  const n = clamp(ior, 1, 2);
  if (n === 1) return 0;
  const f0 = ((n - 1) / (n + 1)) ** 2;
  return f0 + (1 - f0) * (1 - clamp(cosine, 0, 1)) ** 5;
}

/** Snell transmission through a convex screen-space profile, not scene ray tracing. */
export function refractedOffset(
  radial: number,
  ior: number,
  depth: number,
): number {
  const r = clamp(radial, 0, 1),
    slope = r * 0.78;
  const z = Math.sqrt(Math.max(0.06, 1 - slope * slope));
  const eta = 1 / clamp(ior, 1, 2);
  const k = Math.sqrt(Math.max(0, 1 - eta * eta * (1 - z * z)));
  const tx = (eta * z - k) * slope;
  const tz = -eta + (eta * z - k) * z;
  return clamp(
    (tx / Math.max(0.2, -tz)) * clamp(depth, 0, 2) * 0.72,
    -0.5,
    0.5,
  );
}
