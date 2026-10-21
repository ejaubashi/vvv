import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--use-vulkan=swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.route("**/room-benchmark", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Room benchmark</title>",
    }),
  );
  await page.goto("http://127.0.0.1:5173/room-benchmark");
  const results = await page.evaluate(async () => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const results = [];
    for (const forceWebGL of [true, false]) {
      const room = new PortalRoom(() => {}),
        start = performance.now();
      await room.init(forceWebGL);
      const initializationMs = performance.now() - start;
      if (room.status !== "ready") throw Error("Room graphics unavailable");
      const durations = [];
      for (let i = 0; i < 38; i++) {
        const start = performance.now();
        room.render(
          Math.sin(i * 0.13) * 0.8,
          Math.cos(i * 0.1) * 0.3,
          0,
          0,
          0,
          0.85,
          384,
        );
        const backend = room.engine.backend;
        if (backend.device) await backend.device.queue.onSubmittedWorkDone();
        else backend.gl.finish();
        if (i >= 8) durations.push(performance.now() - start);
      }
      durations.sort((a, b) => a - b);
      results.push({
        backend: room.backend,
        resolution: room.resolution,
        meshes: room.meshCount,
        initializationMs: Number(initializationMs.toFixed(2)),
        samples: durations.length,
        meanMs: Number(
          (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2),
        ),
        p50Ms: Number(durations[15].toFixed(2)),
        p95Ms: Number(durations[28].toFixed(2)),
      });
      await room.dispose();
    }
    return results;
  });
  console.log(
    JSON.stringify(
      {
        date: "2026-10-21",
        environment: "Headless Chromium, SwiftShader software graphics",
        metric:
          "Room draw plus persistent-canvas copy and explicit GPU completion; excludes optical compositing, UI, JavaScript download and display scheduling",
        method:
          "8 warmups then 30 measured camera changes per backend, WebGL first; single run on shared cloud hardware",
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
