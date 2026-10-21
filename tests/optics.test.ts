import { test } from "node:test";
import assert from "node:assert/strict";
import { fresnelReflectance, refractedOffset } from "../src/optics";
test("dielectric reflection follows index and approaches unity at grazing angles", () => {
  for (const cosine of [0, 0.2, 0.5, 1])
    assert.equal(fresnelReflectance(1, cosine), 0);
  assert.ok(Math.abs(fresnelReflectance(1.52, 1) - 0.04258) < 0.0001);
  assert.equal(fresnelReflectance(1.52, 0), 1);
  assert.ok(fresnelReflectance(1.62, 0.5) > fresnelReflectance(1.33, 0.5));
  assert.ok(fresnelReflectance(1.52, 0.2) > fresnelReflectance(1.52, 0.8));
});
test("transmission leaves an index-matched or zero-depth scene undistorted", () => {
  for (const radius of [0, 0.2, 0.8, 1]) {
    assert.ok(Math.abs(refractedOffset(radius, 1, 1)) < 1e-9);
    assert.ok(Math.abs(refractedOffset(radius, 1.52, 0)) < 1e-9);
  }
  assert.equal(Math.abs(refractedOffset(0, 1.52, 1)), 0);
});
test("depth and refractive index strengthen bounded inward displacement", () => {
  assert.ok(
    Math.abs(refractedOffset(0.8, 1.52, 1)) >
      Math.abs(refractedOffset(0.8, 1.52, 0.5)),
  );
  assert.ok(
    Math.abs(refractedOffset(0.8, 1.62, 1)) >
      Math.abs(refractedOffset(0.8, 1.33, 1)),
  );
  for (let radius = 0; radius <= 1; radius += 0.05)
    for (const ior of [1, 1.33, 1.52, 2]) {
      const offset = refractedOffset(radius, ior, 2);
      assert.ok(Number.isFinite(offset));
      assert.ok(offset <= 1e-9);
      assert.ok(offset >= -0.5);
    }
});
