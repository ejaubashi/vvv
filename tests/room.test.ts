import { test } from "node:test";
import assert from "node:assert/strict";
import { Raycaster, Vector3 } from "three/webgpu";
import {
  createArchitecture,
  disposeArchitecture,
} from "../src/room/architecture";
import { roomPose } from "../src/room/pose";
import { AUTHORED_ROOMS, RoomJourney } from "../src/room/catalog";
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
test("all room editions have distinct finite geometry and dispose shared geometry once", () => {
  const signatures = new Set<string>();
  for (const definition of AUTHORED_ROOMS) {
    const model = createArchitecture(undefined, definition.id);
    const geometries = new Set(model.meshes.map((m) => m.geometry));
    const disposals = new Map([...geometries].map((geometry) => [geometry, 0]));
    for (const geometry of geometries) {
      geometry.addEventListener("dispose", () =>
        disposals.set(geometry, disposals.get(geometry)! + 1),
      );
      for (const value of geometry.attributes.position.array)
        assert.ok(Number.isFinite(value));
    }
    signatures.add(model.meshes.map((m) => m.name).join(","));
    if (definition.id === "veil") {
      const fabrics = model.meshes.filter((m) => m.name.startsWith("fabric-"));
      assert.equal(fabrics.length, 4);
      const z = fabrics[0].geometry.attributes.position;
      assert.ok(
        Math.max(...z.array.filter((_, index) => index % 3 === 2)) > 0.1,
      );
    }
    disposeArchitecture(model);
    for (const count of disposals.values()) assert.equal(count, 1);
  }
  assert.equal(signatures.size, AUTHORED_ROOMS.length);
});
test("the opt-in room journey pauses, resumes, finishes and replays without looping", () => {
  const journey = new RoomJourney();
  const advance = (seconds: number) => {
    let next: string | null = null;
    for (let i = 0; i < seconds * 4; i++) next = journey.step(0.25) ?? next;
    return next;
  };
  assert.equal(advance(20), null);
  assert.equal(journey.index, 0);
  journey.play();
  advance(7);
  journey.pause();
  advance(20);
  assert.equal(journey.elapsed, 7);
  journey.play();
  assert.equal(advance(7), "nocturne");
  assert.equal(advance(14), "veil");
  assert.equal(advance(14), null);
  assert.equal(journey.finished, true);
  assert.equal(journey.playing, false);
  assert.equal(advance(50), null);
  assert.equal(journey.replay(), "gallery");
  assert.equal(journey.playing, true);
  assert.equal(journey.elapsed, 0);
});
test("manual room exploration pauses the journey and elapsed gaps cannot skip rooms", () => {
  const journey = new RoomJourney();
  journey.play();
  journey.step(1000);
  assert.equal(journey.index, 0);
  assert.equal(journey.elapsed, 0.25);
  journey.go("veil");
  assert.equal(journey.playing, false);
  assert.equal(journey.index, 2);
  assert.equal(journey.elapsed, 0);
});
