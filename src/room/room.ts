import {
  WebGPURenderer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
} from "three/webgpu";
import { createArchitecture, disposeArchitecture } from "./architecture";
import { createRoomSurfaces } from "./materials";
import { roomPose, type RoomPose } from "./pose";
import type { PortalFrame } from "../render/portal-frame";
import { roomDefinition, type RoomId } from "./catalog";
import { roomFrameSize } from "./visit";

export class PortalRoom {
  frame: PortalFrame = { canvas: document.createElement("canvas"), version: 0 };
  status: "idle" | "loading" | "ready" | "fallback" | "disposed" = "idle";
  backend = "Not started";
  resolution = 0;
  draws = 0;
  submitMs = 0;
  kind: RoomId = "gallery";
  requested: RoomId = "gallery";
  switching = false;
  blend = 1;
  private engine: WebGPURenderer | null = null;
  private model: ReturnType<typeof createArchitecture> | null = null;
  private surfaces: ReturnType<typeof createRoomSurfaces> | null = null;
  private pending: Promise<void> | null = null;
  private switchTask: Promise<void> | null = null;
  private previous = document.createElement("canvas");
  private current = document.createElement("canvas");
  private lastBlend = 1;
  private lastLight = Infinity;
  private cleanup: Promise<void> = Promise.resolve();
  private pose: RoomPose = { x: 0, y: 1.55, z: 6.2 };
  private lastPose: RoomPose = { x: Infinity, y: Infinity, z: Infinity };
  private loss: () => void;
  constructor(onChange: () => void) {
    this.loss = onChange;
    this.frame.canvas.width = this.frame.canvas.height = 1;
  }
  init(forceWebGL = false, id: RoomId = "gallery"): Promise<void> {
    if (this.pending) return this.pending;
    if (this.status === "disposed") return Promise.resolve();
    this.status = "loading";
    this.kind = this.requested = id;
    this.pending = this.initialize(forceWebGL);
    return this.pending;
  }
  private async initialize(forceWebGL: boolean) {
    try {
      if (new URLSearchParams(location.search).get("roomRenderer") === "none")
        throw Error("Room fallback requested");
      this.surfaces = createRoomSurfaces(this.kind);
      this.model = createArchitecture(this.surfaces.materials, this.kind);
      this.model.scene.environment = this.surfaces.environment;
      this.model.scene.environmentIntensity = roomDefinition(
        this.kind,
      ).environment;
      this.model.scene.add(this.surfaces.reflection.target);
      const engine = new WebGPURenderer({
        canvas: document.createElement("canvas"),
        antialias: true,
        samples: 4,
        alpha: false,
        forceWebGL,
        powerPreference: "low-power",
      });
      this.engine = engine;
      engine.setPixelRatio(1);
      engine.setSize(512, 512, false);
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
  /** Keep one renderer. Compile at most one replacement; newer requests supersede it. */
  async select(id: RoomId) {
    this.requested = id;
    if (this.status === "loading") await this.pending;
    if (this.status === "disposed" || this.status === "idle") return;
    if (this.status === "fallback") {
      this.kind = id;
      this.lastPose.x = Infinity;
      this.loss();
      return;
    }
    if (this.switchTask) return this.switchTask;
    if (this.kind === id) return;
    this.switching = true;
    this.loss();
    this.switchTask = this.switchRooms().finally(() => {
      this.switchTask = null;
      this.switching = false;
      this.loss();
    });
    return this.switchTask;
  }
  private async switchRooms() {
    while (this.status === "ready" && this.requested !== this.kind) {
      const id = this.requested,
        engine = this.engine!;
      const surfaces = createRoomSurfaces(id);
      const model = createArchitecture(surfaces.materials, id);
      model.scene.environment = surfaces.environment;
      model.scene.environmentIntensity = roomDefinition(id).environment;
      model.scene.add(surfaces.reflection.target);
      model.sun.shadow.autoUpdate = false;
      model.sun.shadow.needsUpdate = true;
      let adopted = false;
      try {
        await engine.compileAsync(model.scene, model.camera);
        if (
          this.status !== "ready" ||
          this.engine !== engine ||
          id !== this.requested
        )
          continue;
        if (this.resolution) {
          this.previous.width = this.frame.canvas.width;
          this.previous.height = this.frame.canvas.height;
          this.previous.getContext("2d")!.drawImage(this.frame.canvas, 0, 0);
        }
        disposeArchitecture(this.model!);
        this.surfaces!.dispose();
        this.model = model;
        this.surfaces = surfaces;
        adopted = true;
        this.kind = id;
        this.blend = this.resolution ? 0 : 1;
        this.lastPose.x = Infinity;
        this.lastLight = Infinity;
        this.loss();
      } catch (error) {
        console.warn("Room change unavailable:", String(error));
        if (this.status === "ready") this.useFallback();
      } finally {
        if (!adopted) {
          disposeArchitecture(model);
          surfaces.dispose();
        }
      }
    }
  }
  /** Called only by the studio's existing animation clock. */
  step(dt: number, reduced = false) {
    if (this.blend < 1)
      this.blend = reduced
        ? 1
        : Math.min(1, this.blend + Math.min(dt, 0.25) / 0.85);
  }
  get moving() {
    return this.blend < 1;
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
    this.surfaces?.dispose();
    this.surfaces = null;
    return this.cleanup;
  }
  private useFallback() {
    if (this.status === "disposed" || this.status === "fallback") return;
    this.status = "fallback";
    this.kind = this.requested;
    this.blend = 1;
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
    lightTime = 0,
    aspect = 1,
    immersion = 0,
  ) {
    if (this.status !== "ready" && this.status !== "fallback") return;
    const dimensions = roomFrameSize(size, aspect, immersion > 0);
    const w = dimensions.width,
      h = dimensions.height;
    size = dimensions.longEdge;
    const changedSize =
      this.frame.canvas.width !== w || this.frame.canvas.height !== h;
    roomPose(this.pose, lookX, lookY, lensX, lensY, pressure, depth, immersion);
    const changedPose =
      changedSize ||
      Math.abs(this.pose.x - this.lastPose.x) >= 0.00025 ||
      Math.abs(this.pose.y - this.lastPose.y) >= 0.00025 ||
      Math.abs(this.pose.z - this.lastPose.z) >= 0.00025 ||
      Math.abs(lightTime - this.lastLight) >= 0.07;
    if (!changedPose && this.blend === this.lastBlend) return;
    const start = performance.now();
    if (this.engine && this.model) {
      if (changedSize) {
        this.engine.setSize(w, h, false);
      }
      if (this.model.camera.aspect !== w / h) {
        this.model.camera.aspect = w / h;
        this.model.camera.updateProjectionMatrix();
      }
      this.model.camera.position.set(this.pose.x, this.pose.y, this.pose.z);
      this.model.camera.lookAt(0, 1.65, -5.5);
      try {
        if (changedPose) {
          if (Math.abs(lightTime - this.lastLight) >= 0.07) {
            this.model.sun.position.x = 3.2 + Math.sin(lightTime * 0.22) * 1.2;
            this.model.sun.shadow.needsUpdate = true;
          }
          this.engine.render(this.model.scene, this.model.camera);
          if (
            changedSize ||
            this.current.width !== w ||
            this.current.height !== h
          ) {
            this.current.width = w;
            this.current.height = h;
          }
          this.current
            .getContext("2d")!
            .drawImage(this.engine.domElement, 0, 0, w, h);
          this.lastLight = lightTime;
        }
        if (changedSize) {
          this.frame.canvas.width = w;
          this.frame.canvas.height = h;
        }
        const c = this.frame.canvas.getContext("2d")!;
        c.globalAlpha = 1;
        c.drawImage(this.current, 0, 0, w, h);
        if (this.blend < 1) {
          const t = this.blend * this.blend * (3 - 2 * this.blend);
          c.globalAlpha = 1 - t;
          c.drawImage(this.previous, 0, 0, w, h);
          c.globalAlpha = 1;
        }
      } catch (error) {
        console.warn("Room rendering stopped:", String(error));
        this.useFallback();
        return;
      }
    } else this.poster(w, h);
    this.resolution = size;
    Object.assign(this.lastPose, this.pose);
    this.lastBlend = this.blend;
    this.submitMs = performance.now() - start;
    this.draws++;
    this.frame.version++;
  }
  private poster(width: number, height: number) {
    const canvas = this.frame.canvas;
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext("2d")!;
    const size = Math.max(width, height);
    c.translate((width - size) / 2, (height - size) / 2);
    c.fillStyle = "#292929";
    c.fillRect(0, 0, size, size);
    if (this.kind === "nocturne") {
      c.fillStyle = "#101923";
      c.fillRect(0, 0, size, size);
      c.strokeStyle = "#aebccc";
      c.lineWidth = size * 0.012;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(
          size * 0.5,
          size * 0.46,
          size * 0.33 * (1 - i * 0.23),
          size * 0.33 * (1 - i * 0.23),
          0,
          0,
          Math.PI * 2,
        );
        c.stroke();
      }
      return;
    }
    if (this.kind === "veil") {
      c.fillStyle = "#9f978b";
      c.fillRect(0, 0, size, size);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? "#dcd3c2" : "#bab1a0";
        c.beginPath();
        c.ellipse(
          size * (0.1 + i * 0.115),
          size * 0.45,
          size * 0.07,
          size * 0.44,
          i % 2 ? 0.08 : -0.08,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      return;
    }
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
    await this.switchTask;
    await this.release();
  }
}
