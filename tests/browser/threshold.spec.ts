import { test, expect, type Page } from "@playwright/test";
const canvas = (page: Page) => page.locator("#scene canvas");
async function harness(page: Page, forceWebGL = true) {
  await page.route("**/threshold-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<body style="margin:0;background:#222"></body>',
    }),
  );
  await page.goto("/threshold-harness");
  await page.evaluate(async (force) => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const room = new PortalRoom(() => {});
    await room.init(force);
    (window as any).thresholdRoom = room;
    (window as any).drawThreshold = (x = 0) =>
      room.render(x, 0, 0, 0, 0, 0.85, 640, 0, 1.25, 1);
    (window as any).drawThreshold();
    document.body.append(room.frame.canvas);
  }, forceWebGL);
}

test("a live doorway preserves foreground occlusion, reveals lit metal, idles and adopts one destination", async ({
  page,
}) => {
  test.setTimeout(60000);
  await harness(page);
  const result = await page.evaluate(async () => {
    const room = (window as any).thresholdRoom,
      draw = (window as any).drawThreshold;
    const originalEngine = room.engine;
    const before = room.frame.canvas
      .getContext("2d")
      .getImageData(0, 0, 640, 512).data;
    await room.openThreshold();
    draw();
    const after = room.frame.canvas
      .getContext("2d")
      .getImageData(0, 0, 640, 512).data;
    let changed = 0;
    for (let i = 0; i < before.length; i += 4)
      if (
        Math.abs(before[i] - after[i]) +
          Math.abs(before[i + 1] - after[i + 1]) +
          Math.abs(before[i + 2] - after[i + 2]) >
        10
      )
        changed++;
    const column = room.model.occluder.position
      .clone()
      .project(room.model.camera);
    const ix = Math.round((column.x + 1) * 0.5 * 640),
      iy = Math.round((1 - column.y) * 0.5 * 512),
      k = (iy * 640 + ix) * 4;
    const blockerDifference =
      Math.abs(before[k] - after[k]) +
      Math.abs(before[k + 1] - after[k + 1]) +
      Math.abs(before[k + 2] - after[k + 2]);
    const threshold = room.threshold,
      destination = threshold.model;
    // Read the actual portal target. A ring's highlight must remain visible;
    // a background-only portal passed the geometry checks but lost metal detail.
    const target = threshold.target;
    const pixels = await room.engine.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      target.width,
      target.height,
    );
    let highlights = 0;
    for (
      let y = Math.floor(target.height * 0.43);
      y < Math.floor(target.height * 0.63);
      y++
    ) {
      for (
        let x = Math.floor(target.width * 0.56);
        x < Math.floor(target.width * 0.59);
        x++
      ) {
        const i = (y * target.width + x) * 4;
        if (pixels[i] > 95 && pixels[i + 1] > 95 && pixels[i + 2] > 95)
          highlights++;
      }
    }
    draw(0.6);
    const dx = threshold.camera.position.x - room.model.camera.position.x;
    const draws = room.draws;
    draw(0.6);
    const idle = draws === room.draws;
    room.crossThreshold();
    room.step(0.1, true);
    draw(0.6);
    const adopted =
      room.model === destination && room.engine === originalEngine;
    const arrivalZ = room.model.camera.position.z;
    const state = room.thresholdState,
      kind = room.kind;
    await room.dispose();
    return {
      changed,
      blockerDifference,
      highlights,
      dx,
      idle,
      adopted,
      arrivalZ,
      state,
      kind,
    };
  });
  expect(result.changed).toBeGreaterThan(1500);
  expect(result.blockerDifference).toBeLessThanOrEqual(3);
  expect(result.highlights).toBeGreaterThan(10);
  expect(result.dx).toBeCloseTo(0, 8);
  expect(result.idle).toBe(true);
  expect(result.adopted).toBe(true);
  expect(result.arrivalZ).toBeCloseTo(1.92, 6);
  expect(result.state).toBe("closed");
  expect(result.kind).toBe("nocturne");
});

test("mid-approach cancellation restores the original pose and releases the target", async ({
  page,
}) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const r = (window as any).thresholdRoom,
      draw = (window as any).drawThreshold;
    const before = r.model.camera.position.toArray();
    await r.openThreshold();
    draw();
    let disposed = 0;
    r.threshold.target.addEventListener("dispose", () => disposed++);
    r.crossThreshold();
    for (let i = 0; i < 10; i++) r.step(0.1, false);
    draw();
    const during = r.model.camera.position.z;
    r.closeThreshold();
    draw();
    const after = r.model.camera.position.toArray();
    r.closeThreshold();
    const state = r.thresholdState,
      kind = r.kind;
    await r.dispose();
    return { before, after, during, disposed, state, kind };
  });
  expect(result.during).toBeLessThan(result.before[2] - 1);
  expect(result.after).toEqual(result.before);
  expect(result.disposed).toBe(1);
  expect(result.kind).toBe("gallery");
  expect(result.state).toBe("closed");
});

test("cancelled preparations cannot reopen after a room change or disposal", async ({
  page,
}) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const r = (window as any).thresholdRoom;
    const compile = r.engine.compileAsync.bind(r.engine);
    let release!: () => void;
    r.engine.compileAsync = async (...args: any[]) => {
      await new Promise<void>((resolve) => (release = resolve));
      return compile(...args);
    };
    const opening = r.openThreshold();
    r.closeThreshold();
    release();
    await opening;
    const cancelled = r.thresholdState === "closed" && !r.threshold;
    r.engine.compileAsync = compile;
    await r.select("nocturne");
    await r.openThreshold();
    const target = r.threshold.target;
    let released = 0;
    target.addEventListener("dispose", () => released++);
    await r.dispose();
    return {
      cancelled,
      released,
      state: r.status,
      threshold: r.thresholdState,
    };
  });
  expect(result).toEqual({
    cancelled: true,
    released: 1,
    state: "disposed",
    threshold: "closed",
  });
});

test("entered controls cross with reduced motion, update the room URL, and Escape closes an opening first", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 800, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?room=1&threshold=1&renderer=webgl");
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-threshold", "open", {
    timeout: 30000,
  });
  await expect(page.locator("#threshold-hint")).toContainText("reduced motion");
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-threshold", "closed");
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1");
  await page
    .getByRole("button", { name: "Open a threshold", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step into Nocturne", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-room-id", "nocturne", {
    timeout: 20000,
  });
  await expect(page).toHaveURL(/space=nocturne/);
  await expect(page.locator("#room-view")).toBeFocused();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page
    .getByRole("button", { name: "Open a threshold", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step into Veil", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-threshold", "crossing");
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-threshold", "closed");
  await expect(canvas(page)).toHaveAttribute("data-room-id", "nocturne");
  await expect(page.locator("#room-view")).toBeFocused();
  await page
    .getByRole("button", { name: "Open a threshold", exact: true })
    .click();
  await expect(page.locator("#room-view")).toHaveAttribute(
    "aria-label",
    /Escape closes the threshold/,
  );
  await page
    .getByRole("button", { name: "Step into Veil", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-room-id", "veil", {
    timeout: 45000,
  });
  await expect(page.locator("#room-view")).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Open a threshold", exact: true })
    .click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-threshold", "closed");
  await expect(page.locator("#threshold-tools")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0");
  expect(errors).toEqual([]);
});

test("touch controls remain usable after rotation and the illustration has no false portal control", async ({
  browser,
  page,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const mobile = await context.newPage();
  await mobile.goto("/?room=1&renderer=webgl");
  await mobile
    .getByRole("button", { name: "Enter the lens", exact: true })
    .tap();
  await mobile
    .getByRole("button", { name: "Open a threshold", exact: true })
    .tap();
  await expect(canvas(mobile)).toHaveAttribute("data-threshold", "open", {
    timeout: 30000,
  });
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile
    .getByRole("button", { name: "Step into Nocturne", exact: true })
    .tap();
  await expect(canvas(mobile)).toHaveAttribute("data-room-id", "nocturne", {
    timeout: 20000,
  });
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?room=1&renderer=canvas&roomRenderer=none");
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1");
  await expect(page.locator("#threshold-tools")).not.toBeVisible();
});

test("WebGPU draws the portal target and crosses without shader errors", async ({
  playwright,
}) => {
  test.setTimeout(90000);
  const browser = await playwright.chromium.launch({
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
  const page = await browser.newPage({ viewport: { width: 700, height: 560 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await harness(page, false);
  const state = await page.evaluate(async () => {
    const r = (window as any).thresholdRoom,
      draw = (window as any).drawThreshold;
    await r.openThreshold();
    draw();
    const state = r.thresholdState,
      backend = r.backend;
    const target = r.threshold.target;
    const pixels = await r.engine.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      target.width,
      target.height,
    );
    const nonempty = pixels.some(
      (v: number, i: number) => i % 4 !== 3 && v > 100,
    );
    r.crossThreshold();
    r.step(0.1, true);
    draw();
    const kind = r.kind;
    await r.dispose();
    return { state, backend, nonempty, kind };
  });
  expect(state).toEqual({
    state: "open",
    backend: "Three.js / WebGPU",
    nonempty: true,
    kind: "nocturne",
  });
  expect(errors).toEqual([]);
  await browser.close();
});
