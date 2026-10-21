import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--enable-features=Vulkan",
    "--use-vulkan=swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.route("**/form-benchmark", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>FORM controlled benchmark</title>",
    }),
  );
  await page.goto("http://127.0.0.1:5173/form-benchmark");
  const results = await page.evaluate(async () => {
    const { WebGPURenderer } = await import("/src/render/renderer.ts");
    const { SceneTexture } = await import("/src/render/scene.ts");
    const renderer = new WebGPURenderer();
    await renderer.init(() => {});
    renderer.resize(1100, 800, 0.7);
    document.body.append(renderer.canvas);
    const scene = new SceneTexture();
    scene.resize(1100, 800);
    const state = {
      x: 550,
      y: 368,
      radius: 128,
      width: 256,
      height: 256,
      round: 128,
      dx: 0.1,
      dy: 0.1,
      intensity: 0.2,
      ior: 1.52,
      roughness: 0.08,
      compare: false,
      depth: 0.85,
      lightAngle: -2.35,
      composition: 0,
      scene: 0,
      previousScene: 0,
      reveal: 1,
      revealX: 0.5,
      revealY: 0.5,
      energy: 0.2,
    };
    scene.draw(state, null);
    const original = GPURenderPassEncoder.prototype.setScissorRect;
    const sample = async (full) => {
      GPURenderPassEncoder.prototype.setScissorRect = full
        ? function () {
            return original.call(
              this,
              0,
              0,
              renderer.canvas.width,
              renderer.canvas.height,
            );
          }
        : original;
      const timings = [];
      for (let i = 0; i < 52; i++) {
        state.lightAngle = -2.35 + Math.sin(i * 0.08) * 0.2;
        const start = performance.now();
        renderer.draw(state, scene.canvas, scene.version);
        await renderer.device.queue.onSubmittedWorkDone();
        if (i >= 12) timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      return {
        samples: timings.length,
        meanMs: Number(
          (timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(2),
        ),
        p50Ms: Number(timings[20].toFixed(2)),
        p95Ms: Number(timings[38].toFixed(2)),
      };
    };
    try {
      return {
        renderer: "WebGPU / SwiftShader software Vulkan",
        viewport: "1100x800",
        output: `${renderer.canvas.width}x${renderer.canvas.height}`,
        fullFrame: await sample(true),
        boundedOptics: await sample(false),
        metric:
          "CPU submission plus awaited GPU queue completion; not GPU timestamp duration or display FPS",
      };
    } finally {
      GPURenderPassEncoder.prototype.setScissorRect = original;
      renderer.dispose();
    }
  });
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
