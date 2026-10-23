import { test } from "node:test";
import assert from "node:assert/strict";
import { LensEntrance } from "../src/room/entrance";

test("entry waits for the visible room, emits one contact, and ends at an exact viewport", () => {
  const entrance = new LensEntrance();
  entrance.begin(false);
  for (let i = 0; i < 50; i++) entrance.step(0.1, false, false);
  assert.equal(entrance.elapsed, 0);
  assert.equal(entrance.phase, "waiting");
  let contacts = 0;
  for (let i = 0; i < 100; i++) {
    if (entrance.step(0.016, false, true)) contacts++;
  }
  assert.equal(contacts, 1);
  assert.equal(entrance.immersion, 1);
  assert.equal(entrance.running, false);
});

test("Escape resets the score for replay, and reduced motion finishes an entry in flight", () => {
  const entrance = new LensEntrance();
  entrance.begin(false);
  for (let i = 0; i < 40; i++) entrance.step(0.016, false, true);
  assert.ok(entrance.immersion > 0 && entrance.immersion < 1);
  entrance.cancel();
  assert.equal(entrance.immersion, 0);
  assert.equal(entrance.layout(300, 300, 150, 1100, true).rippleStrength, 0);
  entrance.begin(false);
  assert.equal(entrance.step(0.016, true, true), false);
  assert.equal(entrance.running, false);
  assert.equal(entrance.immersion, 1);
});

test("the glass object fits both viewport edges and its distortion is finite and temporary", () => {
  for (const [width, x, radius] of [
    [390, 195, 132],
    [1100, 900, 180],
    [1100, 200, 180],
  ]) {
    const entrance = new LensEntrance();
    const idle = entrance.layout(x, 340, radius, width, true);
    assert.ok(idle.x - idle.radius >= 0 && idle.x + idle.radius <= width);
    entrance.begin(false);
    let rippled = false;
    for (let i = 0; i < 100; i++) {
      entrance.step(0.016, false, true);
      const frame = entrance.layout(x, 340, radius, width, entrance.running);
      assert.ok(Object.values(frame).every(Number.isFinite));
      assert.ok(frame.stretch > 0);
      rippled ||= frame.rippleStrength > 0;
    }
    assert.ok(rippled);
    assert.equal(entrance.frame.opacity, 0);
    assert.equal(entrance.frame.rippleStrength, 0);
  }
});
