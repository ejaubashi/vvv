import { fresnelReflectance, refractedOffset } from "../optics";
import type { PortalFrame } from "./portal-frame";
import type { OpticalState } from "../state";
import { glVertex, glFragment, glBackground, wgsl } from "./shaders";
import { liquidOutline, SPLASH_DROPS } from "./splash";
export interface Renderer {
  name: string;
  maxDimension: number;
  canvas: HTMLCanvasElement;
  resize(w: number, h: number, dpr: number): void;
  draw(
    state: OpticalState,
    scene: HTMLCanvasElement,
    version?: number,
    portal?: PortalFrame,
  ): void;
  dispose(): void;
}
function values(
  target: Float32Array<ArrayBuffer>,
  s: OpticalState,
  w: number,
  h: number,
  ratio: number,
) {
  target[0] = w;
  target[1] = h;
  target[2] = s.x * ratio;
  target[3] = s.y * ratio;
  target[4] = s.width * 0.5 * ratio;
  target[5] = s.height * 0.5 * ratio;
  target[6] = s.round * ratio;
  target[7] = s.ior;
  target[8] = s.dx;
  target[9] = s.dy;
  target[10] = s.intensity;
  target[11] = s.radius;
  target[12] = s.roughness;
  target[13] = s.compare ? 1 : 0;
  target[14] = s.energy;
  target[15] = ratio;
  target[16] = s.depth;
  target[17] = s.lightAngle;
  target[18] = s.room ?? 0;
  target[19] = s.immersion ?? 0;
  const entry = s.entrance;
  target[20] = (entry?.x ?? 0) * ratio;
  target[21] = (entry?.y ?? 0) * ratio;
  target[22] = (entry?.radius ?? 0) * ratio;
  target[23] = entry?.stretch ?? 1;
  target[24] = entry?.angle ?? 0;
  target[25] = entry?.opacity ?? 0;
  target[26] = (entry?.rippleRadius ?? 0) * ratio;
  target[27] = entry?.rippleStrength ?? 0;
  target[28] = (entry?.impactX ?? 0) * ratio;
  target[29] = (entry?.impactY ?? 0) * ratio;
  target[30] = s.splash ?? 0;
  return target;
}
/** Expensive optics only cover the object plus a 96 CSS-pixel light/shadow halo. */
function bounds(
  s: OpticalState,
  w: number,
  h: number,
  ratio: number,
  out: Int32Array,
) {
  out[0] = Math.max(0, Math.floor((s.x - s.width * 0.6 - 96) * ratio));
  out[1] = Math.max(0, Math.floor((s.y - s.height * 0.6 - 96) * ratio));
  out[2] = Math.max(
    1,
    Math.min(w, Math.ceil((s.x + s.width * 0.6 + 96) * ratio)) - out[0],
  );
  out[3] = Math.max(
    1,
    Math.min(h, Math.ceil((s.y + s.height * 0.6 + 96) * ratio)) - out[1],
  );
  return out;
}
abstract class Base {
  canvas = document.createElement("canvas");
  ratio = 1;
  maxDimension = 4096;
  name = "";
  data = new Float32Array(32);
  rect = new Int32Array(4);
  chunks = Array.from({ length: 8 }, (_, i) =>
    this.data.subarray(i * 4, i * 4 + 4),
  );
  version = -1;
  resize(w: number, h: number, dpr: number) {
    this.ratio = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }
}
export class WebGLRenderer extends Base implements Renderer {
  name = "WebGL 2";
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  background: WebGLProgram;
  backgroundUniform: WebGLUniformLocation;
  texture: WebGLTexture;
  portalTexture: WebGLTexture;
  portalVersion = -1;
  uniforms: WebGLUniformLocation[];
  constructor(onLoss: () => void) {
    super();
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) throw Error("WebGL unavailable");
    this.gl = gl;
    this.maxDimension = Math.min(
      4096,
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    );
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
      return shader;
    };
    this.program = gl.createProgram()!;
    const vertex = compile(gl.VERTEX_SHADER, glVertex),
      fragment = compile(gl.FRAGMENT_SHADER, glFragment);
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    this.background = gl.createProgram()!;
    const backgroundShader = compile(gl.FRAGMENT_SHADER, glBackground);
    gl.attachShader(this.background, vertex);
    gl.attachShader(this.background, backgroundShader);
    gl.linkProgram(this.background);
    if (!gl.getProgramParameter(this.background, gl.LINK_STATUS))
      throw Error("Background shader link failed");
    this.backgroundUniform = gl.getUniformLocation(this.background, "a")!;
    gl.deleteShader(backgroundShader);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error("Shader link failed");
    gl.useProgram(this.program);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.portalTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.portalTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "room"), 1);
    gl.activeTexture(gl.TEXTURE0);
    this.uniforms = ["a", "b", "c", "d", "e", "f", "g", "h"].map((n) =>
      gl.getUniformLocation(this.program, n)!,
    );
    this.canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        onLoss();
      },
      { once: true },
    );
  }
  draw(
    s: OpticalState,
    scene: HTMLCanvasElement,
    version = 0,
    portal?: PortalFrame,
  ) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.portalTexture);
    if (portal && this.portalVersion !== portal.version) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        portal.canvas,
      );
      this.portalVersion = portal.version;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.version !== version) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        scene,
      );
      this.version = version;
    }
    values(this.data, s, this.canvas.width, this.canvas.height, this.ratio);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.background);
    gl.uniform4fv(this.backgroundUniform, this.chunks[0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(this.program);
    const rect = bounds(
      s,
      this.canvas.width,
      this.canvas.height,
      this.ratio,
      this.rect,
    );
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      rect[0],
      this.canvas.height - rect[1] - rect[3],
      rect[2],
      rect[3],
    );
    for (let i = 0; i < this.uniforms.length; i++)
      gl.uniform4fv(this.uniforms[i], this.chunks[i]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  dispose() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteTexture(this.portalTexture);
    this.gl.deleteProgram(this.program);
    this.gl.deleteProgram(this.background);
  }
}
export class WebGPURenderer extends Base implements Renderer {
  name = "WebGPU";
  gpu: GPU | null = null;
  adapter: GPUAdapter | null = null;
  device!: GPUDevice;
  context!: GPUCanvasContext;
  pipeline!: GPURenderPipeline;
  backgroundPipeline!: GPURenderPipeline;
  uniform!: GPUBuffer;
  sampler!: GPUSampler;
  texture: GPUTexture | null = null;
  portalTexture: GPUTexture | null = null;
  portalVersion = -1;
  portalWidth = 0;
  portalHeight = 0;
  bind: GPUBindGroup | null = null;
  tw = 0;
  th = 0;
  disposed = false;
  async init(onLoss: () => void) {
    if (!navigator.gpu) throw Error("WebGPU unavailable");
    this.gpu = navigator.gpu;
    const adapter = await this.gpu.requestAdapter({
      powerPreference: "low-power",
    });
    if (!adapter || adapter.limits.maxTextureDimension2D < 2048)
      throw Error("Insufficient GPU limits");
    this.adapter = adapter;
    this.device = await adapter.requestDevice();
    this.maxDimension = Math.min(
      4096,
      this.device.limits.maxTextureDimension2D,
    );
    this.device.lost.then((info) => {
      if (!this.disposed) {
        console.warn("WebGPU device lost:", info.reason, info.message);
        onLoss();
      }
    });
    this.context = this.canvas.getContext("webgpu")!;
    if (!this.context) throw Error("No WebGPU context");
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format,
      alphaMode: "opaque",
    });
    const shader = this.device.createShaderModule({ code: wgsl });
    const info = await shader.getCompilationInfo();
    if (info.messages.some((m) => m.type === "error"))
      throw Error(info.messages.map((m) => m.message).join("\n"));
    const layout = this.device.createPipelineLayout({
      bindGroupLayouts: [
        this.device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.FRAGMENT,
              buffer: { type: "uniform", minBindingSize: 128 },
            },
            {
              binding: 1,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: "float" },
            },
            {
              binding: 2,
              visibility: GPUShaderStage.FRAGMENT,
              sampler: { type: "filtering" },
            },
            {
              binding: 3,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: "float" },
            },
          ],
        }),
      ],
    });
    this.backgroundPipeline = await this.device.createRenderPipelineAsync({
      layout,
      vertex: { module: shader, entryPoint: "vs" },
      fragment: {
        module: shader,
        entryPoint: "fsBackground",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.pipeline = await this.device.createRenderPipelineAsync({
      layout,
      vertex: { module: shader, entryPoint: "vs" },
      fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.uniform = this.device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
  }
  draw(
    s: OpticalState,
    scene: HTMLCanvasElement,
    version = 0,
    portal?: PortalFrame,
  ) {
    const d = this.device;
    const portalWidth = portal?.canvas.width ?? 1,
      portalHeight = portal?.canvas.height ?? 1;
    if (
      !this.portalTexture ||
      this.portalWidth !== portalWidth ||
      this.portalHeight !== portalHeight
    ) {
      this.portalTexture?.destroy();
      this.portalWidth = portalWidth;
      this.portalHeight = portalHeight;
      this.portalVersion = -1;
      this.portalTexture = d.createTexture({
        size: [portalWidth, portalHeight],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.bind = null;
      if (!portal)
        d.queue.writeTexture(
          { texture: this.portalTexture },
          new Uint8Array([0, 0, 0, 255]),
          { bytesPerRow: 4 },
          { width: 1, height: 1 },
        );
    }
    if (portal && this.portalVersion !== portal.version) {
      d.queue.copyExternalImageToTexture(
        { source: portal.canvas },
        { texture: this.portalTexture },
        { width: portalWidth, height: portalHeight },
      );
      this.portalVersion = portal.version;
    }
    if (!this.texture || this.tw !== scene.width || this.th !== scene.height) {
      this.texture?.destroy();
      this.tw = scene.width;
      this.th = scene.height;
      this.version = -1;
      this.bind = null;
      this.texture = d.createTexture({
        size: [this.tw, this.th],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    if (!this.bind)
      this.bind = d.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniform } },
          { binding: 1, resource: this.texture.createView() },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: this.portalTexture.createView() },
        ],
      });
    if (this.version !== version) {
      d.queue.copyExternalImageToTexture(
        { source: scene },
        { texture: this.texture },
        { width: this.tw, height: this.th },
      );
      this.version = version;
    }
    d.queue.writeBuffer(
      this.uniform,
      0,
      values(this.data, s, this.canvas.width, this.canvas.height, this.ratio),
    );
    const encoder = d.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(this.backgroundPipeline);
    pass.setBindGroup(0, this.bind);
    pass.draw(3);
    const rect = bounds(
      s,
      this.canvas.width,
      this.canvas.height,
      this.ratio,
      this.rect,
    );
    pass.setScissorRect(rect[0], rect[1], rect[2], rect[3]);
    pass.setPipeline(this.pipeline);
    pass.draw(3);
    pass.end();
    d.queue.submit([encoder.finish()]);
  }
  dispose() {
    this.disposed = true;
    this.texture?.destroy();
    this.portalTexture?.destroy();
    this.uniform?.destroy();
    this.context?.unconfigure();
    this.device?.destroy();
  }
}
export class CanvasRenderer extends Base implements Renderer {
  name = "Canvas 2D fallback";
  ctx = this.canvas.getContext("2d", { alpha: false })!;
  private outlineKey = "";
  private outline = new Path2D();
  private rims: {
    path: Path2D;
    x: number;
    y: number;
    radius: number;
    bevel: number;
  }[] = [];
  draw(
    s: OpticalState,
    scene: HTMLCanvasElement,
    _version = 0,
    portal?: PortalFrame,
  ) {
    const c = this.ctx,
      r = this.ratio;
    c.setTransform(r, 0, 0, r, 0, 0);
    c.drawImage(scene, 0, 0, this.canvas.width / r, this.canvas.height / r);
    const outlineKey = `${s.width},${s.height},${s.round},${s.splash ?? 0}`;
    if (outlineKey !== this.outlineKey) {
      this.outlineKey = outlineKey;
      const amount = s.splash ?? 0;
      const outline = liquidOutline(s.width, s.height, s.round, amount);
      this.outline = new Path2D(outline);
      const half = Math.min(s.width, s.height) / 2;
      // Cache each contour so even the smallest fragment gets a scaled bevel.
      this.rims = (outline.match(/M[^Z]+Z/g) ?? []).map((part, index) => {
        const drop = SPLASH_DROPS[index - 1];
        const radius = index
          ? Math.min(drop.rx, drop.ry) * half * amount
          : half;
        return {
          path: new Path2D(part),
          x:
            s.width / 2 +
            (index ? (drop.x * (0.75 + 0.25 * amount) * s.width) / 2 : 0),
          y:
            s.height / 2 +
            (index ? (drop.y * (0.75 + 0.25 * amount) * s.height) / 2 : 0),
          radius,
          bevel: Math.max(0.8, Math.min(7, radius * 0.065)),
        };
      });
    }
    const path = new Path2D();
    path.addPath(
      this.outline,
      new DOMMatrix().translate(s.x - s.width / 2, s.y - s.height / 2),
    );
    const material = s.compare
      ? 0
      : Math.min(1, Math.sqrt(fresnelReflectance(s.ior, 1)) * 5);
    const lightX = Math.cos(s.lightAngle),
      lightY = Math.sin(s.lightAngle);
    c.save();
    if (material > 0 && s.immersion < 1) {
      c.save();
      c.translate(s.x - s.width / 2, s.y - s.height / 2);
      for (const rim of this.rims) {
        const lift = Math.max(1.2, Math.min(14, rim.radius * 0.07));
        c.shadowColor = `rgba(42,39,34,${material * (1 - s.immersion) * 0.22})`;
        c.shadowBlur = Math.max(1, Math.min(12, rim.radius * 0.055)) * r;
        c.shadowOffsetX = -lightX * lift * r;
        c.shadowOffsetY = -lightY * lift * r;
        c.fillStyle = "#eeeae1";
        c.fill(rim.path);
      }
      c.restore();
    }
    c.clip(path);
    if (!s.compare || (portal && s.room > 0)) {
      const scale = 1 + Math.abs(refractedOffset(0.7, s.ior, s.depth));
      c.translate(s.x, s.y);
      c.scale(s.compare ? 1 : scale, s.compare ? 1 : scale);
      c.translate(-s.x, -s.y);
      c.filter = `blur(${s.compare ? 0 : s.roughness * 5}px)`;
      c.drawImage(scene, 0, 0, this.canvas.width / r, this.canvas.height / r);
      if (portal && s.room > 0) {
        const cover = Math.max(
          s.width / portal.canvas.width,
          s.height / portal.canvas.height,
        );
        const pw = portal.canvas.width * cover,
          ph = portal.canvas.height * cover;
        c.globalAlpha = s.room;
        c.drawImage(portal.canvas, s.x - pw / 2, s.y - ph / 2, pw, ph);
      }
    }
    c.restore();
    if (material > 0) {
      c.save();
      c.translate(s.x - s.width / 2, s.y - s.height / 2);
      for (const rim of this.rims) {
        c.save();
        c.clip(rim.path);
        const span = Math.max(1, rim.radius);
        const shine = c.createLinearGradient(
          rim.x + lightX * span,
          rim.y + lightY * span,
          rim.x - lightX * span,
          rim.y - lightY * span,
        );
        shine.addColorStop(0, `rgba(255,252,241,${material * 0.85})`);
        shine.addColorStop(0.4, `rgba(233,242,250,${material * 0.2})`);
        shine.addColorStop(1, `rgba(47,51,57,${material * 0.3})`);
        c.strokeStyle = shine;
        c.lineWidth = rim.bevel * 2;
        c.stroke(rim.path);
        c.lineWidth = 1.1;
        c.strokeStyle = `rgba(255,255,249,${material * 0.48})`;
        c.stroke(rim.path);
        c.restore();
      }
      c.restore();
    }
    const entry = s.entrance;
    if (entry && entry.rippleStrength > 0) {
      c.save();
      c.clip(path);
      c.beginPath();
      c.arc(entry.impactX, entry.impactY, entry.rippleRadius, 0, Math.PI * 2);
      c.lineWidth = 3;
      c.strokeStyle = `rgba(255,183,77,${entry.rippleStrength * 0.35})`;
      c.stroke();
      c.restore();
    }
    if (entry && entry.opacity > 0) {
      c.save();
      c.globalAlpha = entry.opacity;
      c.translate(entry.x, entry.y);
      c.rotate(entry.angle);
      c.scale(entry.stretch, 1 / Math.sqrt(entry.stretch));
      const halo = c.createRadialGradient(
        0,
        0,
        entry.radius,
        0,
        0,
        entry.radius * 1.65,
      );
      halo.addColorStop(0, "#ffad261e");
      halo.addColorStop(1, "#ff8a0000");
      c.fillStyle = halo;
      c.fillRect(
        -entry.radius * 1.65,
        -entry.radius * 1.65,
        entry.radius * 3.3,
        entry.radius * 3.3,
      );
      c.beginPath();
      c.arc(0, 0, entry.radius, 0, Math.PI * 2);
      c.shadowColor = "rgba(74,40,16,.24)";
      c.shadowBlur = entry.radius * 0.28 * r;
      c.shadowOffsetX = -lightX * entry.radius * 0.48 * r;
      c.shadowOffsetY = -lightY * entry.radius * 0.48 * r;
      c.fillStyle = "#ed8d15";
      c.fill();
      c.shadowColor = "transparent";
      c.clip();
      const source = portal && s.room > 0 ? portal.canvas : scene;
      const side = Math.min(source.width, source.height) * 0.22;
      c.drawImage(
        source,
        (source.width - side) / 2,
        (source.height - side) / 2,
        side,
        side,
        -entry.radius,
        -entry.radius,
        entry.radius * 2,
        entry.radius * 2,
      );
      const lx = Math.cos(s.lightAngle - entry.angle) * entry.radius * 0.42;
      const ly = Math.sin(s.lightAngle - entry.angle) * entry.radius * 0.42;
      const solar = c.createRadialGradient(lx, ly, 0, 0, 0, entry.radius);
      solar.addColorStop(0, "#ffcc55dd");
      solar.addColorStop(0.55, "#ff9b16cf");
      solar.addColorStop(0.88, "#d95706e8");
      solar.addColorStop(1, "#ffc46bd9");
      c.fillStyle = solar;
      c.fill();
      const glaze = c.createRadialGradient(
        lx,
        ly,
        0,
        lx,
        ly,
        entry.radius * 0.48,
      );
      glaze.addColorStop(0, "#fffcebd9");
      glaze.addColorStop(0.25, "#fff5d182");
      glaze.addColorStop(0.65, "#ffeab91c");
      glaze.addColorStop(1, "#ffe7b000");
      c.fillStyle = glaze;
      c.fill();
      c.restore();
    }
  }
  dispose() {}
}
export async function createRenderer(
  onLoss: () => void,
  preference = new URLSearchParams(location.search).get("renderer"),
): Promise<Renderer> {
  if (preference !== "canvas" && preference !== "webgl") {
    const gpu = new WebGPURenderer();
    try {
      await gpu.init(onLoss);
      return gpu;
    } catch (error) {
      gpu.dispose();
      console.info("WebGPU not active:", String(error));
    }
  }
  if (preference !== "canvas")
    try {
      return new WebGLRenderer(onLoss);
    } catch (error) {
      console.info("WebGL not active:", String(error));
    }
  return new CanvasRenderer();
}
