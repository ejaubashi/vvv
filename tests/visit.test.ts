import { test } from "node:test";
import assert from "node:assert/strict";
import { visitBounds, roomFrameSize } from "../src/room/visit";
import { roomPose } from "../src/room/pose";
import { Motion } from "../src/motion";
test("the glass opens from its original bounds into a viewport frame in both orientations", () => {
  const out = { x: 0, y: 0, width: 0, height: 0, round: 0 };
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [667, 375],
  ]) {
    visitBounds(out, width, height, 160, 220, 120, 0);
    assert.deepEqual(out, {
      x: 160,
      y: 220,
      width: 240,
      height: 240,
      round: 120,
    });
    visitBounds(out, width, height, 160, 220, 120, 1);
    assert.equal(out.x, width / 2);
    assert.equal(out.y, height / 2);
    assert.ok(out.width < width && out.height < height);
    const endWidth = out.width;
    visitBounds(out, width, height, 160, 220, 120, 0.5);
    assert.equal(out.width, (240 + endWidth) / 2);
  }
});
test("room frame allocation preserves viewport aspect within a bounded pixel budget", () => {
  for (const aspect of [0.46, 1, 1.78, 3]) {
    const frame = roomFrameSize(10000, aspect, true);
    assert.equal(Math.max(frame.width, frame.height), 1536);
    assert.ok(Math.abs(frame.width / frame.height - aspect) < 0.003);
    assert.ok(frame.width * frame.height <= 1536 * 1536);
  }
  assert.deepEqual(roomFrameSize(8000), {
    width: 1024,
    height: 1024,
    longEdge: 1024,
  });
});
test("entry shares the motion clock, reverses continuously, and keeps the camera in front of architecture", () => {
  const motion = new Motion();
  motion.immersion.target = 1;
  for (let i = 0; i < 12; i++) motion.step(0.016);
  const before = motion.immersion.x;
  assert.ok(before > 0 && before < 1);
  motion.immersion.target = 0;
  assert.equal(motion.immersion.x, before);
  for (let i = 0; i < 300; i++) motion.step(0.016);
  assert.equal(motion.immersion.x, 0);
  assert.equal(motion.moving, false);
  motion.reduced = true;
  motion.immersion.target = 1;
  motion.step(0.016);
  assert.equal(motion.immersion.x, 1);
  const pose = { x: 0, y: 0, z: 0 };
  roomPose(pose, 1, 1, 0, 0, 1, 2, 1);
  assert.ok(pose.z > 3.5 && pose.z < 5);
});
