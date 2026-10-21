import { test } from "node:test";
import assert from "node:assert/strict";
import { Raycaster, Vector3 } from "three/webgpu";
import {
  createArchitecture,
  disposeArchitecture,
} from "../src/room/architecture";
import { roomPose } from "../src/room/pose";
test("architecture has finite mesh geometry and a perspective depth range", () => {
  const model = createArchitecture();
  try {
    assert.ok(model.camera.isPerspectiveCamera);
    assert.ok(model.camera.near > 0 && model.camera.far > 20);
    assert.equal(
      model.meshes.filter((m) => m.name.startsWith("arch-")).length,
      4,
    );
    for (const mesh of model.meshes) {
      const vertices = mesh.geometry.attributes.position;
      assert.ok(vertices.count > 0);
      for (const value of vertices.array) assert.ok(Number.isFinite(value));
      assert.equal(mesh.material.depthTest, true);
    }
  } finally {
    disposeArchitecture(model);
  }
});
test("foreground geometry occludes the sculpture from one viewpoint and reveals it from another", () => {
  const model = createArchitecture();
  try {
    model.scene.updateMatrixWorld(true);
    const target = model.sculpture.position.clone();
    const first = (x: number) => {
      const from = new Vector3(x, 1.35, 6.2),
        direction = target.clone().sub(from).normalize();
      return new Raycaster(from, direction).intersectObjects(
        [model.occluder, model.sculpture],
        false,
      )[0]?.object.name;
    };
    assert.equal(first(-0.9), "foreground-column");
    assert.equal(first(0.9), "sculpture");
  } finally {
    disposeArchitecture(model);
  }
});
test("room camera stays bounded and changes with lens and gesture state", () => {
  const pose = { x: 0, y: 0, z: 0 };
  roomPose(pose, 1, 1, 1, 1, 1, 2);
  assert.ok(pose.x <= 1.05 && pose.y >= 1.15 && pose.z > 5);
  const x = pose.x;
  roomPose(pose, -1, -1, -1, -1, 0, 0);
  assert.ok(pose.x < 0 && pose.x !== x);
  assert.ok(pose.y <= 1.95 + 1e-12);
  assert.equal(pose.z, 6.2);
});
