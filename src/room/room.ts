import {
  WebGPURenderer,
  MeshStandardNodeMaterial,
  ACESFilmicToneMapping,
  SRGBColorSpace,
} from "three/webgpu";
import { color, positionWorld, float } from "three/tsl";
import { createArchitecture, disposeArchitecture } from "./architecture";
import { roomPose, type RoomPose } from "./pose";
import type { PortalFrame } from "../render/portal-frame";

export class PortalRoom {
  frame: PortalFrame = { canvas: document.createElement("canvas"), version: 0 };
  status: "idle" | "loading" | "ready" | "fallback" | "disposed" = "idle";
  backend = "Not started";
  resolution = 0;
  draws = 0;
  submitMs = 0;
  private engine: WebGPURenderer | null = null;
  private model: ReturnType<typeof createArchitecture> | null = null;
  private pending: Promise<void> | null = null;
  private cleanup: Promise<void> = Promise.resolve();
  private pose: RoomPose = { x: 0, y: 1.55, z: 6.2 };
  private lastPose: RoomPose = { x: Infinity, y: Infinity, z: Infinity };
  private loss: () => void;
  constructor(onChange: () => void) {
    this.loss = onChange;
    this.frame.canvas.width = this.frame.canvas.height = 1;
  }
  init(forceWebGL = false): Promise<void> {
    if (this.pending) return this.pending;
    if (this.status === "disposed") return Promise.resolve();
    this.status = "loading";
    this.pending = this.initialize(forceWebGL);
    return this.pending;
  }
  private async initialize(forceWebGL: boolean) {
    try {
      if (new URLSearchParams(location.search).get("roomRenderer") === "none")
        throw Error("Room fallback requested");
      const stone = new MeshStandardNodeMaterial({ roughness: 0.84 });
      stone.colorNode = color(0xc4c4c4).mul(
        positionWorld.y.mul(0.045).add(0.76).clamp(0.65, 1),
      );
      const floor = new MeshStandardNodeMaterial({
        color: 0x929292,
        roughness: 0.48,
      });
      const sculpture = new MeshStandardNodeMaterial({
        color: 0xdadada,
        roughness: 0.2,
        metalness: 0.25,
      });
      sculpture.roughnessNode = float(0.2);
      this.model = createArchitecture({ stone, floor, sculpture });
      const engine = new WebGPURenderer({
        canvas: document.createElement("canvas"),
        antialias: false,
        alpha: false,
        forceWebGL,
        powerPreference: "low-power",
      });
      this.engine = engine;
      engine.setPixelRatio(1);
      engine.setSize(384, 384, false);
      engine.outputColorSpace = SRGBColorSpace;
      engine.toneMapping = ACESFilmicToneMapping;
      engine.toneMappingExposure = 0.95;
      engine.shadowMap.enabled = true;
      engine.shadowMap.type = this.model.shadowType;
      this.model.sun.shadow.autoUpdate = false;
      this.model.sun.shadow.needsUpdate = true;
      engine.onDeviceLost = () => {
        if (this.status !== "disposed") this.useFallback();
      };
      engine.domElement.addEventListener(
        "webglcontextlost",
        (event) => {
          event.preventDefault();
          if (this.status !== "disposed") this.useFallback();
        },
        { once: true },
      );
      await engine.init();
      if (!this.isLoading()) {
        await this.release();
        return;
      }
      await engine.compileAsync(this.model.scene, this.model.camera);
      if (!this.isLoading()) {
        await this.release();
        return;
      }
      this.backend = (engine.backend as { isWebGPUBackend?: boolean })
        .isWebGPUBackend
        ? "Three.js / WebGPU"
        : "Three.js / WebGL 2";
      this.status = "ready";
      this.loss();
    } catch (error) {
      if (this.status === "disposed") await this.release();
      if (this.status !== "disposed") {
        console.info("Architectural fallback:", String(error));
        this.useFallback();
      }
    }
  }
  private isLoading() {
    return this.status === "loading";
  }
  private release() {
    const engine = this.engine;
    this.engine = null;
    if (engine) {
      let task: Promise<void> = Promise.resolve();
      if (engine.hasInitialized()) task = engine.dispose();
      else {
        // r186 Backend typings omit dispose(); avoid Renderer.dispose() restarting a failed init.
        const backend = engine.backend;
        if ("dispose" in backend && typeof backend.dispose === "function")
          task = Promise.resolve(backend.dispose());
      }
      this.cleanup = task.catch((error: unknown) =>
        console.warn("Room renderer cleanup:", String(error)),
      );
    }
    if (this.model) {
      const model = this.model;
      this.model = null;
      disposeArchitecture(model);
    }
    return this.cleanup;
  }
  private useFallback() {
    if (this.status === "disposed" || this.status === "fallback") return;
    this.status = "fallback";
    this.backend = "Architectural illustration · 3D unavailable";
    this.release();
    this.frame.canvas = document.createElement("canvas");
    this.frame.canvas.width = this.frame.canvas.height = 1;
    this.frame.version++;
    this.resolution = 0;
    this.lastPose.x = Infinity;
    this.loss();
  }
  render(
    lookX: number,
    lookY: number,
    lensX: number,
    lensY: number,
    pressure: number,
    depth: number,
    size: number,
  ) {
    if (this.status !== "ready" && this.status !== "fallback") return;
    size = Math.max(384, Math.min(640, Math.round(size / 64) * 64));
    const changedSize = this.resolution !== size;
    roomPose(this.pose, lookX, lookY, lensX, lensY, pressure, depth);
    if (
      !changedSize &&
      Math.abs(this.pose.x - this.lastPose.x) < 0.00025 &&
      Math.abs(this.pose.y - this.lastPose.y) < 0.00025 &&
      Math.abs(this.pose.z - this.lastPose.z) < 0.00025
    )
      return;
    const start = performance.now();
    if (this.engine && this.model) {
      if (changedSize) this.engine.setSize(size, size, false);
      this.model.camera.position.set(this.pose.x, this.pose.y, this.pose.z);
      this.model.camera.lookAt(0, 1.65, -5.5);
      try {
        this.engine.render(this.model.scene, this.model.camera);
        if (changedSize)
          this.frame.canvas.width = this.frame.canvas.height = size;
        this.frame.canvas
          .getContext("2d")!
          .drawImage(this.engine.domElement, 0, 0, size, size);
      } catch (error) {
        console.warn("Room rendering stopped:", String(error));
        this.useFallback();
        return;
      }
    } else this.poster(size);
    this.resolution = size;
    Object.assign(this.lastPose, this.pose);
    this.submitMs = performance.now() - start;
    this.draws++;
    this.frame.version++;
  }
  private poster(size: number) {
    const canvas = this.frame.canvas;
    canvas.width = canvas.height = size;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#292929";
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      const scale = Math.pow(0.74, i),
        w = size * 0.92 * scale,
        h = size * 1.05 * scale,
        x = size * 0.5 - w / 2 - this.pose.x * size * 0.035 * (5 - i),
        y = size * 0.64 - h * 0.52;
      c.fillStyle = `rgb(${115 - i * 14},${115 - i * 14},${115 - i * 14})`;
      c.beginPath();
      c.rect(x, y, w, h);
      c.roundRect(x + w * 0.16, y + h * 0.22, w * 0.68, h * 0.91, [
        w * 0.34,
        w * 0.34,
        0,
        0,
      ]);
      c.fill("evenodd");
    }
  }
  get meshCount() {
    return this.model?.meshes.length ?? 0;
  }
  async dispose() {
    if (this.status === "disposed") return this.cleanup;
    const loading = this.status === "loading";
    this.status = "disposed";
    if (loading) await this.pending;
    else await this.release();
  }
}
