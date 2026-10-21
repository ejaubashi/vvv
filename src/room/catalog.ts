export const ROOMS = [
  {
    id: "gallery",
    name: "Limestone",
    subtitle: "Light through an arcade",
    detail: "Warm stone, repeating arches and a distant metal sphere.",
    stone: 0xc9c5bc,
    floor: 0xaaa69f,
    sculpture: 0xa1a3a5,
    fog: 0x5d5a55,
    background: 0x282828,
    environment: 0.35,
    light: 0xfff5e5,
    intensity: 3.2,
  },
  {
    id: "nocturne",
    name: "Nocturne",
    subtitle: "A chamber of reflected light",
    detail: "Dark stone, suspended metal rings and narrow seams of light.",
    stone: 0x343b45,
    floor: 0x242b33,
    sculpture: 0xb5c5d6,
    fog: 0x141a23,
    background: 0x10151d,
    environment: 0.65,
    light: 0xdbeaff,
    intensity: 3.8,
  },
  {
    id: "veil",
    name: "Veil",
    subtitle: "A room held in fabric",
    detail: "Suspended, folded cloth frames a pale sculpture in soft daylight.",
    stone: 0xd9d4c9,
    floor: 0xc3bdb2,
    sculpture: 0xd1c6b5,
    fog: 0xb4ada1,
    background: 0x8b857b,
    environment: 0.6,
    light: 0xfff6e6,
    intensity: 2.5,
  },
] as const;
export type RoomId = (typeof ROOMS)[number]["id"];
export const roomDefinition = (id: RoomId) =>
  ROOMS.find((room) => room.id === id)!;
export const parseRoomId = (value: string | null): RoomId =>
  ROOMS.find((room) => room.id === value)?.id ?? "gallery";

/** A finite, opt-in exhibition; time is supplied by the application's existing clock. */
export class RoomJourney {
  index = 0;
  elapsed = 0;
  playing = false;
  finished = false;
  readonly dwell = 14;
  go(id: RoomId) {
    this.index = ROOMS.findIndex((room) => room.id === id);
    this.elapsed = 0;
    this.playing = false;
    this.finished = false;
  }
  play() {
    if (this.finished) this.go("gallery");
    this.playing = true;
    return ROOMS[this.index].id;
  }
  pause() {
    this.playing = false;
  }
  replay() {
    this.go("gallery");
    return this.play();
  }
  step(dt: number): RoomId | null {
    if (!this.playing) return null;
    this.elapsed += Math.max(0, Math.min(dt, 0.25));
    if (this.elapsed < this.dwell) return null;
    this.elapsed = 0;
    if (this.index === ROOMS.length - 1) {
      this.finished = true;
      this.pause();
      return null;
    }
    return ROOMS[++this.index].id;
  }
}
