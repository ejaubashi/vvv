import {
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Shape,
  Path,
  ShapeGeometry,
  ExtrudeGeometry,
  RenderTarget,
  UnsignedByteType,
  SRGBColorSpace,
  PerspectiveCamera,
  type WebGPURenderer,
  type Scene,
} from "three/webgpu";
import {
  texture,
  positionView,
  cameraProjectionMatrix,
  vec4,
  vec2,
} from "three/tsl";
import { createArchitecture, disposeArchitecture } from "./architecture";
import { createRoomSurfaces } from "./materials";
import { roomDefinition, type AuthoredRoomId } from "./catalog";
import { THRESHOLD_Z, mapThresholdCamera } from "./threshold-math";

function arch<T extends Shape | Path>(path: T, radius: number, spring: number) {
  path.moveTo(-radius, 0);
  path.lineTo(radius, 0);
  path.lineTo(radius, spring);
  path.absarc(0, spring, radius, 0, Math.PI, false);
  path.lineTo(-radius, 0);
  path.closePath();
  return path;
}

/** One nonrecursive doorway, one destination and one bounded render target. */
export class RoomThreshold {
  readonly surfaces;
  readonly model;
  readonly target = new RenderTarget(512, 512, {
    type: UnsignedByteType,
    depthBuffer: true,
  });
  readonly camera = new PerspectiveCamera();
  readonly aperture;
  readonly frame;
  private attached: Scene | null = null;
  private transferred = false;
  private disposed = false;
  constructor(readonly destination: AuthoredRoomId) {
    this.surfaces = createRoomSurfaces(destination);
    this.model = createArchitecture(this.surfaces.materials, destination);
    this.model.scene.environment = this.surfaces.environment;
    this.model.scene.environmentIntensity =
      roomDefinition(destination).environment;
    this.model.scene.add(this.surfaces.reflection.target);
    this.model.sun.shadow.autoUpdate = false;
    this.model.sun.shadow.needsUpdate = true;
    // A display-referred intermediate matches the final room and avoids applying
    // the source room's tone mapping a second time to the destination.
    this.target.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicNodeMaterial({ toneMapped: false });
    // Derive projective UV from the camera, not shared screen-size uniforms:
    // nested floor reflections temporarily render at a different resolution.
    const clip = cameraProjectionMatrix.mul(vec4(positionView, 1));
    const uv = clip.xy.div(clip.w).mul(vec2(0.5, -0.5)).add(0.5);
    material.colorNode = texture(this.target.texture, uv).rgb;
    this.aperture = new Mesh(
      new ShapeGeometry(arch(new Shape(), 1.27, 2.15), 64),
      material,
    );
    this.aperture.name = "threshold-aperture";
    this.aperture.position.z = THRESHOLD_Z;
    const border = arch(new Shape(), 1.38, 2.15);
    // ExtrudeGeometry normalizes the inner contour winding for the opening.
    border.holes.push(arch(new Path(), 1.27, 2.15));
    this.frame = new Mesh(
      new ExtrudeGeometry(border, {
        depth: 0.19,
        bevelEnabled: true,
        bevelSize: 0.025,
        bevelThickness: 0.025,
        bevelSegments: 3,
        curveSegments: 64,
      }),
      new MeshStandardNodeMaterial({
        color: 0x71634c,
        metalness: 0.72,
        roughness: 0.3,
      }),
    );
    this.frame.name = "threshold-jamb";
    this.frame.position.z = THRESHOLD_Z + 0.015;
    this.frame.castShadow = this.frame.receiveShadow = true;
  }
  attach(scene: Scene) {
    this.attached = scene;
    scene.add(this.aperture, this.frame);
  }
  render(
    engine: WebGPURenderer,
    source: PerspectiveCamera,
    width: number,
    height: number,
  ) {
    // Same aspect at a capped long edge. No new loop and no recursive portals.
    const scale = Math.min(1, 1024 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)),
      h = Math.max(1, Math.round(height * scale));
    if (this.target.width !== w || this.target.height !== h)
      this.target.setSize(w, h);
    mapThresholdCamera(source, this.camera);
    const previous = engine.getRenderTarget();
    try {
      engine.setRenderTarget(this.target);
      engine.render(this.model.scene, this.camera);
    } finally {
      engine.setRenderTarget(previous);
    }
  }
  /** The destination graph is adopted by PortalRoom, without rebuilding or a fade. */
  takeDestination() {
    this.transferred = true;
    return { model: this.model, surfaces: this.surfaces };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.attached?.remove(this.aperture, this.frame);
    this.aperture.geometry.dispose();
    this.aperture.material.dispose();
    this.frame.geometry.dispose();
    this.frame.material.dispose();
    this.target.dispose();
    if (!this.transferred) {
      disposeArchitecture(this.model);
      this.surfaces.dispose();
    }
  }
}
