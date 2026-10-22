import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PerspectiveCamera,
  Vector3,
  WebGPUCoordinateSystem,
  WebGLCoordinateSystem,
  Raycaster,
} from "three/webgpu";
import {
  mapThresholdCamera,
  THRESHOLD_SHIFT,
  ARRIVAL_Z,
  ThresholdApproach,
} from "../src/room/threshold-math";
import { RoomThreshold } from "../src/room/threshold";
import {
  createArchitecture,
  disposeArchitecture,
} from "../src/room/architecture";

for (const coordinateSystem of [
  WebGPUCoordinateSystem,
  WebGLCoordinateSystem,
]) {
  test(`portal view rays align and clip the destination entrance (${coordinateSystem})`, () => {
    const source = new PerspectiveCamera(53, 1.6, 0.1, 45),
      target = new PerspectiveCamera();
    source.coordinateSystem = coordinateSystem;
    source.position.set(0.55, 1.8, 4.8);
    source.lookAt(0, 1.65, -5.5);
    source.updateMatrixWorld(true);
    source.updateProjectionMatrix();
    mapThresholdCamera(source, target);
    assert.ok(
      target.position.distanceTo(
        source.position.clone().add(new Vector3(0, 0, THRESHOLD_SHIFT)),
      ) < 1e-10,
    );
    for (const point of [new Vector3(0, 2, -6), new Vector3(-0.4, 0.7, -8)]) {
      const a = point.clone().project(source),
        b = point
          .clone()
          .add(new Vector3(0, 0, THRESHOLD_SHIFT))
          .project(target);
      assert.ok(Math.abs(a.x - b.x) < 1e-10 && Math.abs(a.y - b.y) < 1e-10);
    }
    const near = coordinateSystem === WebGPUCoordinateSystem ? 0 : -1;
    const planePoint = new Vector3(0.1, 2, ARRIVAL_Z).project(target);
    const beforePlane = new Vector3(0.1, 2, ARRIVAL_Z + 0.2).project(target);
    const behindPlane = new Vector3(0.1, 2, ARRIVAL_Z - 0.2).project(target);
    assert.ok(Math.abs(planePoint.z - near) < 1e-8);
    assert.ok(beforePlane.z < near && behindPlane.z > near);
  });
}
test("threshold is a depth-tested aperture behind a real foreground blocker; cleanup is idempotent", () => {
  const room = createArchitecture(),
    threshold = new RoomThreshold("nocturne");
  threshold.attach(room.scene);
  room.scene.updateMatrixWorld(true);
  const start = new Vector3(-0.38, 1.5, 4.8),
    target = new Vector3(-0.38, 1.5, -4.55);
  const hits = new Raycaster(
    start,
    target.sub(start).normalize(),
  ).intersectObjects([room.occluder, threshold.aperture]);
  assert.equal(hits[0].object.name, "foreground-column");
  assert.ok(hits.some((hit) => hit.object.name === "threshold-aperture"));
  assert.equal(threshold.aperture.material.depthTest, true);
  let disposals = 0;
  threshold.target.addEventListener("dispose", () => disposals++);
  threshold.dispose();
  threshold.dispose();
  assert.equal(disposals, 1);
  assert.equal(room.scene.children.includes(threshold.aperture), false);
  disposeArchitecture(room);
});
test("crossing requires a deliberate start, bounds elapsed gaps, cancels and skips movement under reduced motion", () => {
  const approach = new ThresholdApproach();
  assert.equal(approach.step(10, false), false);
  approach.start();
  approach.step(100, false);
  assert.ok(approach.progress < 0.04);
  for (let i = 0; i < 100; i++) approach.step(0.1, false);
  assert.equal(approach.progress, 1);
  approach.cancel();
  assert.equal(approach.progress, 0);
  assert.equal(approach.active, false);
  approach.start();
  assert.equal(approach.step(0.016, true), true);
  assert.equal(approach.progress, 1);
});
