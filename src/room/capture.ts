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
import {
  CAPTURE,
  downloadCapture,
  type CaptureDefinition,
} from "./capture-source";
import type { RoomPose } from "./pose";
import type { UnravelFrame } from "./unravel";
import { createUnravelModifier } from "./unravel-shader";

/** An optional WebGL capture adapter. Spark does not target Three's WebGPURenderer. */
export class CapturedRoom {
  readonly engine: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(64, 1, 0.05, 250);
  readonly spark: SparkRenderer;
  private mesh: SplatMesh | null = null;
  private disposed = false;
  dirty = true;
  private origin = new Vector3();
  private orientation = new Quaternion();
  private offset = new Vector3();
  private rotation = new Quaternion();
  private angles = new Euler();
  private deformation = createUnravelModifier();
  private deformationVersion = "";
  setUnravel(frame: UnravelFrame) {
    const key = `${frame.amount},${frame.phase},${frame.brushX},${frame.brushY},${frame.flowX},${frame.flowY}`;
    if (key === this.deformationVersion) return;
    this.deformationVersion = key;
    const d = this.deformation;
    d.amount.value = frame.amount;
    d.phase.value = frame.phase;
    d.brush.value.set(frame.brushX, frame.brushY);
    d.flow.value.set(frame.flowX, frame.flowY);
    if (this.mesh) this.mesh.needsUpdate = true;
    this.dirty = true;
  }
  private constructor(
    readonly definition: CaptureDefinition,
    wake: () => void,
    lost: () => void,
  ) {
    this.origin.fromArray(definition.position);
    this.camera.fov = definition.fov;
    this.camera.updateProjectionMatrix();
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
    this.camera.lookAt(new Vector3().fromArray(definition.target));
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
    definition: CaptureDefinition = CAPTURE,
  ) {
    const bytes = await downloadCapture(signal, progress, definition);
    signal.throwIfAborted();
    const room = new CapturedRoom(definition, wake, lost);
    try {
      room.mesh = new SplatMesh({
        fileBytes: bytes,
        fileType: SplatFileType.PCSOGSZIP,
        raycastable: false,
        enableLod: false,
        worldModifier: room.deformation.modifier,
      });
      // SuperSplat data uses the published viewer's 180-degree Z orientation.
      room.mesh.quaternion.fromArray(definition.quaternion);
      room.mesh.scale.setScalar(definition.scale);
      room.mesh.position.fromArray(definition.translation);
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
    const d = this.deformation;
    d.eye.value.copy(this.camera.position);
    d.right.value.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    d.up.value.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    d.forward.value.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    d.lens.value.set(
      this.camera.aspect,
      Math.tan((this.camera.fov * Math.PI) / 360),
    );
    if (d.amount.value > 0 && this.mesh) this.mesh.needsUpdate = true;
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
