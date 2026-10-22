import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CAPTURES, isCaptureId } from "../src/room/capture-source";
import {
  ROOMS,
  AUTHORED_ROOMS,
  RoomJourney,
  parseRoomId,
} from "../src/room/catalog";

for (const capture of CAPTURES)
  test(`${capture.id}: scene bytes, attribution and pinned provenance agree`, async () => {
    const bytes = await readFile(`public/${capture.path}`);
    const provenance = JSON.parse(
      await readFile(`public/captures/${capture.id}/PROVENANCE.json`, "utf8"),
    );
    assert.equal(bytes.length, capture.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      capture.sha256,
    );
    assert.equal(provenance.sha256, capture.sha256);
    assert.equal(provenance.creator, capture.creator);
    assert.equal(provenance.source, capture.source);
    assert.equal(provenance.license, "CC-BY-4.0");
    assert.ok(capture.splats > 600_000 && capture.splats <= 700_000);
    assert.ok(capture.fov > 45 && capture.fov < 100);
    const thumbnail = await readFile(`public/${capture.thumbnail}`);
    assert.equal(thumbnail.toString("ascii", 8, 12), "WEBP");
  });

test("the default collection replaces the studies, with a finite opt-in captured sequence", () => {
  assert.deepEqual(
    ROOMS.map((entry) => entry.id),
    ["pantheon", "apartment", "small-garden", "la-night"],
  );
  assert.equal(parseRoomId(null), "pantheon");
  assert.equal(parseRoomId("unknown"), "pantheon");
  assert.ok(ROOMS.every((entry) => isCaptureId(entry.id)));
  assert.equal(
    ROOMS.some((entry) =>
      (AUTHORED_ROOMS as readonly { id: string }[]).some(
        (study) => study.id === entry.id,
      ),
    ),
    false,
  );
  const journey = new RoomJourney(ROOMS);
  assert.equal(journey.playing, false);
  assert.equal(journey.play(), "pantheon");
  const visited: string[] = [];
  for (let i = 0; i < 14 * 4 * 5; i++) {
    const next = journey.step(0.25);
    if (next) visited.push(next);
  }
  assert.deepEqual(visited, ["apartment", "small-garden", "la-night"]);
  assert.equal(journey.finished, true);
  assert.equal(journey.playing, false);
});
