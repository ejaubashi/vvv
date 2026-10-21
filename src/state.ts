export type Workspace = "media" | "material" | "interaction" | "details";
export type Scene = 0 | 1 | 2;
export interface OpticalState {
  x: number;
  y: number;
  radius: number;
  width: number;
  height: number;
  round: number;
  dx: number;
  dy: number;
  intensity: number;
  ior: number;
  roughness: number;
  compare: boolean;
  depth: number;
  lightAngle: number;
  composition: 0 | 1 | 2;
  scene: Scene;
  reveal: number;
  previousScene: Scene;
  revealX: number;
  revealY: number;
  energy: number;
  room: number;
}
export const defaults = {
  ior: 1.52,
  roughness: 0.08,
  magnet: 0.5,
  depth: 0.85,
  lightAngle: -135,
};
export class WorkspaceState {
  active: Workspace | null = null;
  generation = 0;
  open(workspace: Workspace) {
    this.active = workspace;
    return ++this.generation;
  }
  close() {
    this.active = null;
    return ++this.generation;
  }
  current(generation: number) {
    return generation === this.generation;
  }
}
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
