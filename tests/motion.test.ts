import { test } from "node:test";
import assert from "node:assert/strict";
import { Motion, Spring } from "../src/motion";
import { WorkspaceState } from "../src/state";
import { PerformanceMonitor } from "../src/performance";
test("spring remains bounded under irregular frames and settles exactly", () => {
  const s = new Spring(0);
  s.target = 1;
  let peak = 0;
  for (let i = 0; i < 300; i++) {
    s.step([0.016, 0.008, 0.25, 0.035][i % 4]);
    peak = Math.max(peak, s.x);
    assert.ok(Number.isFinite(s.x));
  }
  assert.equal(s.x, 1);
  assert.equal(s.velocity, 0);
  assert.ok(peak < 1.06);
  assert.equal(s.moving, false);
});
test("reversing a morph during opening preserves continuity and returns to rest", () => {
  const s = new Spring(0, 100, 21);
  s.target = 1;
  for (let i = 0; i < 8; i++) s.step(0.016);
  const before = s.x;
  s.target = 0;
  assert.equal(s.x, before);
  for (let i = 0; i < 300; i++) s.step(0.016);
  assert.equal(s.x, 0);
  assert.equal(s.moving, false);
});
test("press, velocity, release and reduced motion share one state", () => {
  const m = new Motion();
  m.intensity.target = 1;
  m.dx.target = 3;
  for (let i = 0; i < 30; i++) m.step(0.016);
  assert.ok(m.intensity.x > 0.9);
  m.release();
  for (let i = 0; i < 300; i++) m.step(0.016);
  assert.equal(m.intensity.x, 0);
  assert.equal(m.dx.x, 0);
  m.reduced = true;
  m.x.target = 300;
  m.step(0.016);
  assert.equal(m.x.x, 300);
  assert.equal(m.moving, false);
});
test("superseded workspace operations are invalidated", () => {
  const state = new WorkspaceState();
  const first = state.open("material");
  state.close();
  const second = state.open("media");
  assert.equal(state.current(first), false);
  assert.equal(state.current(second), true);
  assert.equal(state.active, "media");
});
test("quality adapts after sustained slow frames with delayed recovery", () => {
  const p = new PerformanceMonitor();
  for (let i = 0; i < 70; i++) p.sample(50);
  assert.ok(p.scale < 1);
  const low = p.scale;
  for (let i = 0; i < 125; i++) p.sample(16);
  assert.equal(p.scale, low);
  for (let i = 0; i < 650; i++) p.sample(16);
  assert.ok(p.scale > low);
  assert.ok(p.scale <= 1);
});
