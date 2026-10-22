import { Vector2, Vector3 } from "three";
import { dyno } from "@sparkjsdev/spark";

/** A pure deformation of the original splats: amount zero is an exact identity. */
export function createUnravelModifier() {
  const amount = dyno.dynoFloat(0),
    phase = dyno.dynoFloat(0);
  const brush = dyno.dynoVec2(new Vector2()),
    flow = dyno.dynoVec2(new Vector2());
  const eye = dyno.dynoVec3(new Vector3()),
    right = dyno.dynoVec3(new Vector3(1, 0, 0));
  const up = dyno.dynoVec3(new Vector3(0, 1, 0)),
    forward = dyno.dynoVec3(new Vector3(0, 0, -1));
  const lens = dyno.dynoVec2(new Vector2(1, Math.tan((64 * Math.PI) / 360)));
  const modifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const deform = new dyno.Dyno({
        inTypes: {
          gsplat: dyno.Gsplat,
          amount: "float",
          phase: "float",
          brush: "vec2",
          flow: "vec2",
          eye: "vec3",
          right: "vec3",
          up: "vec3",
          forward: "vec3",
          lens: "vec2",
        },
        outTypes: { gsplat: dyno.Gsplat },
        statements: ({ inputs: i, outputs: o }) =>
          dyno.unindentLines(`
        ${o.gsplat} = ${i.gsplat};
        if (${i.amount} > 0.0) {
          vec3 p = ${i.gsplat}.center;
          vec3 relative = p - ${i.eye};
          float depth = dot(relative, ${i.forward});
          if (depth > 0.2) {
            vec2 projected = vec2(dot(relative, ${i.right}) / ${i.lens}.x, dot(relative, ${i.up})) / (depth * ${i.lens}.y);
            vec2 radial = (projected - ${i.brush}) * vec2(${i.lens}.x, 1.0);
            float falloff = 1.0 - smoothstep(0.12, 1.0, length(radial));
            // Nearby splats share a stone-sized cell, keeping fragments spatially coherent.
            vec3 cell = floor(p / 0.65);
            vec3 seed = fract(sin(vec3(dot(cell, vec3(127.1, 311.7, 74.7)), dot(cell, vec3(269.5, 183.3, 246.1)), dot(cell, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
            float release = smoothstep(seed.x * 0.28, 0.65 + seed.x * 0.28, ${i.amount});
            float strength = release * falloff;
            vec2 tangent = vec2(-radial.y, radial.x) / max(0.18, length(radial));
            float breath = sin(${i.phase} * 0.75 + seed.y * 6.283) * 0.12;
            vec2 drift = tangent * (1.2 + seed.z * 0.6) + (seed.xy - 0.5) * 1.5 + ${i.flow} * 4.0;
            drift.y += 0.45 + breath;
            ${o.gsplat}.center = p + strength * (${i.right} * drift.x + ${i.up} * drift.y + ${i.forward} * (seed.z - 0.5) * 2.0);
            ${o.gsplat}.scales *= mix(1.0, 0.32 + seed.z * 0.18, strength);
          }
        }
      `),
      });
      return deform.apply({
        gsplat,
        amount,
        phase,
        brush,
        flow,
        eye,
        right,
        up,
        forward,
        lens,
      });
    },
  );
  return {
    modifier,
    amount,
    phase,
    brush,
    flow,
    eye,
    right,
    up,
    forward,
    lens,
  };
}
