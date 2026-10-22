import { test } from "node:test";
import assert from "node:assert/strict";
import { Motion } from "../src/motion";
import { Unravel } from "../src/room/unravel";
const rig = () => {
  const motion = new Motion(),
    state = new Unravel(motion);
  const advance = (count = 240) => {
    for (let i = 0; i < count; i++) {
      motion.step(1 / 60);
      state.step(1 / 60);
    }
  };
  return { motion, state, advance };
};
test("unravel is deliberate, bounded, and does not change camera springs", () => {
  const { motion, state, advance } = rig();
  state.press();
  advance();
  assert.equal(state.frame.amount, 0);
  state.setEnabled(true);
  state.press(99, -99);
  state.drag(4, -8);
  advance();
  assert.equal(state.frame.amount, 1);
  assert.equal(state.frame.brushX, 1);
  assert.equal(state.frame.brushY, -1);
  assert.equal(state.frame.flowX, 1);
  assert.equal(state.frame.flowY, -1);
  assert.equal(motion.viewX.x, 0);
  assert.equal(motion.viewY.x, 0);
  assert.equal(state.active, true);
});
test("release restores exact identity and stops the clock after a finite trace", () => {
  const { state, advance } = rig();
  state.setEnabled(true);
  state.press();
  state.drag(0.6, 0.3);
  advance();
  state.release();
  advance();
  assert.equal(state.frame.amount, 0);
  assert.equal(state.frame.phase, 0);
  assert.equal(state.active, false);
  assert.equal(state.holding, false);
  const frame = { ...state.frame };
  advance();
  assert.deepEqual(state.frame, frame);
});
test("regrabbing during recovery is continuous and cancellation restores immediately", () => {
  const { state, advance } = rig();
  state.setEnabled(true);
  state.press();
  advance(15);
  state.release();
  advance(5);
  const amount = state.frame.amount;
  state.press(0.3, 0.1);
  assert.equal(state.frame.amount, amount);
  state.reset();
  assert.equal(state.frame.amount, 0);
  assert.equal(state.active, false);
  state.press();
  advance();
  assert.equal(state.frame.amount, 1);
  state.setEnabled(false);
  assert.equal(state.frame.amount, 0);
  assert.equal(state.active, false);
});
test("reduced motion cancels deformation while preserving intentional view movement", () => {
  const { motion, state, advance } = rig();
  state.setEnabled(true);
  state.press();
  advance(15);
  motion.reduced = true;
  motion.viewX.target = 0.7;
  advance(1);
  assert.equal(state.enabled, false);
  assert.equal(state.frame.amount, 0);
  assert.equal(state.holding, false);
  assert.equal(state.active, false);
  assert.equal(motion.viewX.x, 0.7);
  state.setEnabled(true);
  state.press();
  advance();
  assert.equal(state.frame.amount, 0);
});
