import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  Quaternion,
  Euler,
  SRGBColorSpace,
  Color,
  NoToneMapping,
} from "three";
import { SparkRenderer, SplatMesh, SplatFileType } from "@sparkjsdev/spark";
import { CAPTURE, downloadCapture } from "./capture-source";
import type { RoomPose } from "./pose";

/** An optional WebGL capture adapter. Spark does not target Three's WebGPURenderer. */
export class CapturedRoom {
  readonly engine: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(64, 1, 0.05, 250);
  readonly spark: SparkRenderer;
  private mesh: SplatMesh | null = null;
  private disposed = false;
  dirty = true;
  private origin = new Vector3(...CAPTURE.position);
  private orientation = new Quaternion();
  private offset = new Vector3();
  private rotation = new Quaternion();
  private angles = new Euler();
  private constructor(wake: () => void, lost: () => void) {
    this.engine = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    this.engine.setPixelRatio(1);
    this.engine.setSize(512, 512, false);
    this.engine.outputColorSpace = SRGBColorSpace;
    this.engine.toneMapping = NoToneMapping;
    this.scene.background = new Color(0x171510);
    this.camera.position.copy(this.origin);
    this.camera.lookAt(new Vector3(...CAPTURE.target));
    this.orientation.copy(this.camera.quaternion);
    this.spark = new SparkRenderer({
      renderer: this.engine,
      enableLod: false,
      onDirty: () => {
        if (!this.disposed) {
          this.dirty = true;
          wake();
        }
      },
    });
    this.scene.add(this.spark);
    this.engine.domElement.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        if (!this.disposed) lost();
      },
      { once: true },
    );
  }
  static async load(
    signal: AbortSignal,
    wake: () => void,
    progress: (ratio: number) => void,
    lost: () => void,
  ) {
    const bytes = await downloadCapture(signal, progress);
    signal.throwIfAborted();
    const room = new CapturedRoom(wake, lost);
    try {
      room.mesh = new SplatMesh({
        fileBytes: bytes,
        fileType: SplatFileType.PCSOGSZIP,
        raycastable: false,
        enableLod: false,
      });
      // SuperSplat data uses the published viewer's 180-degree Z orientation.
      room.mesh.quaternion.set(0, 0, 1, 0);
      await room.mesh.initialized;
      signal.throwIfAborted();
      room.scene.add(room.mesh);
      room.scene.updateMatrixWorld(true);
      await room.spark.update({ scene: room.scene, camera: room.camera });
      signal.throwIfAborted();
      return room;
    } catch (error) {
      room.dispose();
      throw error;
    }
  }
  render(pose: RoomPose, width: number, height: number) {
    this.dirty = false;
    if (
      this.engine.domElement.width !== width ||
      this.engine.domElement.height !== height
    )
      this.engine.setSize(width, height, false);
    if (this.camera.aspect !== width / height) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    // Small local translations reveal parallax without walking out of photographed coverage.
    this.offset
      .set(pose.x * 0.14, (pose.y - 1.55) * 0.16, (pose.z - 6.2) * 0.14)
      .applyQuaternion(this.orientation);
    this.camera.position.copy(this.origin).add(this.offset);
    this.angles.set((pose.y - 1.55) * 0.32, -pose.x * 0.19, 0);
    this.camera.quaternion
      .copy(this.orientation)
      .multiply(this.rotation.setFromEuler(this.angles));
    this.engine.render(this.scene, this.camera);
    return this.engine.domElement;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh?.dispose();
    this.mesh = null;
    this.spark.dispose();
    this.scene.clear();
    this.engine.dispose();
    this.engine.forceContextLoss();
  }
}
