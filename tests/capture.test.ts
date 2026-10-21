import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CAPTURE } from "../src/room/capture-source";
import { ROOMS, RoomJourney, parseRoomId } from "../src/room/catalog";

test("the redistributed capture matches its provenance, byte budget, and pinned digest", async () => {
  const bytes = await readFile(`public/${CAPTURE.path}`);
  const provenance = JSON.parse(
    await readFile("public/captures/pantheon/PROVENANCE.json", "utf8"),
  );
  assert.equal(bytes.length, CAPTURE.bytes);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    CAPTURE.sha256,
  );
  assert.equal(provenance.sha256, CAPTURE.sha256);
  assert.equal(provenance.creator, CAPTURE.creator);
  assert.equal(provenance.source, CAPTURE.source);
  assert.equal(provenance.license, "CC-BY-4.0");
});

test("the capture is selectable and stays outside the automatic authored sequence", () => {
  assert.equal(parseRoomId("pantheon"), "pantheon");
  assert.equal(ROOMS.length, 4);
  const journey = new RoomJourney();
  journey.go("pantheon");
  assert.equal(journey.playing, false);
  assert.equal(journey.play(), "gallery");
  const visited: string[] = [];
  for (let i = 0; i < 14 * 4 * 4; i++) {
    const next = journey.step(0.25);
    if (next) visited.push(next);
  }
  assert.deepEqual(visited, ["nocturne", "veil"]);
  assert.equal(journey.finished, true);
});
