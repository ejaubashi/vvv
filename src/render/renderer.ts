import type { OpticalState } from "../state";
import { glVertex, glFragment, wgsl } from "./shaders";
export interface Renderer {
  name: string;
  canvas: HTMLCanvasElement;
  resize(w: number, h: number, dpr: number): void;
  draw(state: OpticalState, scene: HTMLCanvasElement, version?: number): void;
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
  return target;
}
abstract class Base {
  canvas = document.createElement("canvas");
  ratio = 1;
  name = "";
  data = new Float32Array(20);
  chunks = Array.from({ length: 5 }, (_, i) =>
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
  texture: WebGLTexture;
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
    this.uniforms = ["a", "b", "c", "d", "e"].map((n) =>
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
  draw(s: OpticalState, scene: HTMLCanvasElement, version = 0) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
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
    for (let i = 0; i < this.uniforms.length; i++)
      gl.uniform4fv(this.uniforms[i], this.chunks[i]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  dispose() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
  }
}
export class WebGPURenderer extends Base implements Renderer {
  name = "WebGPU";
  gpu: GPU | null = null;
  adapter: GPUAdapter | null = null;
  device!: GPUDevice;
  context!: GPUCanvasContext;
  pipeline!: GPURenderPipeline;
  uniform!: GPUBuffer;
  sampler!: GPUSampler;
  texture: GPUTexture | null = null;
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
    this.pipeline = await this.device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs" },
      fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.uniform = this.device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
  }
  draw(s: OpticalState, scene: HTMLCanvasElement, version = 0) {
    const d = this.device;
    if (!this.texture || this.tw !== scene.width || this.th !== scene.height) {
      this.texture?.destroy();
      this.tw = scene.width;
      this.th = scene.height;
      this.version = -1;
      this.texture = d.createTexture({
        size: [this.tw, this.th],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.bind = d.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniform } },
          { binding: 1, resource: this.texture.createView() },
          { binding: 2, resource: this.sampler },
        ],
      });
    }
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
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bind);
    pass.draw(3);
    pass.end();
    d.queue.submit([encoder.finish()]);
  }
  dispose() {
    this.disposed = true;
    this.texture?.destroy();
    this.uniform?.destroy();
    this.context?.unconfigure();
    this.device?.destroy();
  }
}
export class CanvasRenderer extends Base implements Renderer {
  name = "Canvas 2D fallback";
  ctx = this.canvas.getContext("2d", { alpha: false })!;
  draw(s: OpticalState, scene: HTMLCanvasElement) {
    const c = this.ctx,
      r = this.ratio;
    c.setTransform(r, 0, 0, r, 0, 0);
    c.drawImage(scene, 0, 0, this.canvas.width / r, this.canvas.height / r);
    c.save();
    c.beginPath();
    c.roundRect(
      s.x - s.width / 2,
      s.y - s.height / 2,
      s.width,
      s.height,
      s.round,
    );
    c.shadowColor = "rgba(0,0,0,.15)";
    c.shadowBlur = 24;
    c.shadowOffsetY = 12;
    c.fillStyle = "rgba(255,255,255,.08)";
    c.fill();
    c.shadowColor = "transparent";
    c.clip();
    if (!s.compare) {
      const scale = 1 + (s.ior - 1) * 0.2;
      c.translate(s.x, s.y);
      c.scale(scale, scale);
      c.translate(-s.x, -s.y);
      c.filter = `blur(${s.roughness * 5}px)`;
      c.drawImage(scene, 0, 0, this.canvas.width / r, this.canvas.height / r);
    }
    c.restore();
    c.beginPath();
    c.roundRect(
      s.x - s.width / 2,
      s.y - s.height / 2,
      s.width,
      s.height,
      s.round,
    );
    c.strokeStyle = "rgba(255,255,255,.65)";
    c.lineWidth = 1;
    c.stroke();
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
