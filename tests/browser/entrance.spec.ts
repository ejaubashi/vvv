import { test, expect } from "@playwright/test";

test("the glass object leads into the visible room, settles, and restores keyboard focus on return", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?studies=1&room=1&renderer=webgl&roomRenderer=none");
  const canvas = page.locator("#scene canvas"),
    orb = page.locator("#entry-orb");
  await expect(canvas).toHaveAttribute("data-room-status", "fallback");
  await expect(orb).toBeVisible();
  await page.evaluate(() => {
    const samples: { phase?: string; immersion: number; portal: string }[] = [];
    (window as any).entranceSamples = samples;
    const sample = () => {
      const c = document.querySelector("#scene canvas") as HTMLCanvasElement;
      samples.push({
        phase: c.dataset.entrance,
        immersion: Number(c.dataset.immersion),
        portal: c.dataset.roomStatus!,
      });
      if (c.dataset.entrance !== "inside") requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await orb.focus();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-entrance", "inside");
  await expect(canvas).toHaveAttribute("data-immersion", "1");
  const samples = await page.evaluate(() => (window as any).entranceSamples);
  expect(
    samples.some((s: any) => s.phase === "approach" && s.immersion === 0),
  ).toBe(true);
  expect(samples.some((s: any) => s.immersion > 0 && s.immersion < 1)).toBe(
    true,
  );
  expect(samples.every((s: any) => s.portal === "fallback")).toBe(true);
  await expect(orb).not.toBeVisible();
  await page.waitForTimeout(300);
  const draws = await canvas.getAttribute("data-room-draws");
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute("data-room-draws", draws!);
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-immersion", "0");
  await expect(orb).toBeFocused();
  expect(errors).toEqual([]);
});

test("Escape interrupts the effect and replay works; reduced motion can finish an entry already in flight", async ({
  page,
}) => {
  await page.goto("/?studies=1&room=1&renderer=canvas&roomRenderer=none");
  const canvas = page.locator("#scene canvas");
  await page.locator("#entry-orb").click();
  await expect(canvas).toHaveAttribute(
    "data-entrance",
    /approach|contact|expanding/,
  );
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-immersion", "0");
  await expect(page.locator("#entry-orb")).toBeFocused();
  await page.locator("#entry-orb").press("Enter");
  await expect(canvas).toHaveAttribute(
    "data-entrance",
    /approach|contact|expanding/,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-entrance", "inside");
  await expect(canvas).toHaveAttribute("data-immersion", "1");
});

test("the object stays touchable on a narrow screen and reduced motion skips the effect", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 700 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/?studies=1&room=1&renderer=canvas&roomRenderer=none");
  const orb = page.locator("#entry-orb");
  const bounds = await orb.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  await orb.tap();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-immersion",
    "1",
  );
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-entrance-progress",
    "1",
  );
  await page.keyboard.press("Escape");
  await expect(orb).toBeFocused();
  await context.close();
});

test("the entrance presents through WebGPU without shader or validation errors", async ({
  playwright,
}) => {
  test.setTimeout(60000);
  const browser = await playwright.chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--use-vulkan=swiftshader",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--enable-features=Vulkan",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 640 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/?studies=1&room=1&roomRenderer=none");
    const canvas = page.locator("#scene canvas");
    await expect(canvas).toHaveAttribute("data-room-status", "fallback");
    expect(
      await canvas.evaluate((c) =>
        Boolean((c as HTMLCanvasElement).getContext("webgpu")),
      ),
    ).toBe(true);
    await page.locator("#entry-orb").click();
    await expect(canvas).toHaveAttribute("data-entrance", "inside", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute("data-immersion", "1");
    await page.keyboard.press("Escape");
    await expect(page.locator("#entry-orb")).toBeFocused();
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});

test("the contact sound uses the existing opt-in sound setting and releases its audio nodes", async ({
  page,
}) => {
  await page.goto("/?studies=1&renderer=canvas");
  await page.mouse.click(25, 180);
  const result = await page.evaluate(async () => {
    const { MediaManager } = await import("/src/media.ts");
    const media = new MediaManager();
    media.playEntranceCue();
    const silent = media.context === null;
    await media.toggleDemo();
    media.playEntranceCue();
    const started = (media as any).entranceCue !== null;
    media.stopDemo();
    const released = (media as any).entranceCue === null;
    media.playEntranceCue();
    const stayedSilent = (media as any).entranceCue === null;
    media.dispose();
    return { silent, started, released, stayedSilent };
  });
  expect(result).toEqual({
    silent: true,
    started: true,
    released: true,
    stayedSilent: true,
  });
});

test("the optical shader refracts the room at contact and removes every ripple at rest", async ({
  page,
}) => {
  await page.goto("/?studies=1&renderer=canvas");
  const result = await page.evaluate(async () => {
    const { WebGLRenderer } = await import("/src/render/renderer.ts");
    const { LensEntrance } = await import("/src/room/entrance.ts");
    const renderer = new WebGLRenderer(() => {});
    renderer.resize(512, 384, 1);
    const source = document.createElement("canvas");
    source.width = 512;
    source.height = 384;
    const ctx = source.getContext("2d")!;
    for (let x = 0; x < 512; x += 8) {
      ctx.fillStyle = x % 16 ? "#172f53" : "#efe8d2";
      ctx.fillRect(x, 0, 8, 384);
    }
    const state = {
      x: 256,
      y: 192,
      radius: 120,
      width: 240,
      height: 240,
      round: 120,
      dx: 0,
      dy: 0,
      intensity: 0,
      ior: 1.52,
      roughness: 0,
      depth: 0.85,
      compare: false,
      lightAngle: -2,
      composition: 0,
      scene: 0,
      previousScene: 0,
      reveal: 1,
      revealX: 0.5,
      revealY: 0.5,
      energy: 0,
      room: 1,
      immersion: 0,
    } as any;
    const frame = { canvas: source, version: 1 };
    const pixels = () => {
      renderer.draw(state, source, 1, frame);
      const data = new Uint8Array(512 * 384 * 4);
      renderer.gl.readPixels(
        0,
        0,
        512,
        384,
        renderer.gl.RGBA,
        renderer.gl.UNSIGNED_BYTE,
        data,
      );
      return data;
    };
    const baseline = pixels();
    const score = new LensEntrance();
    score.begin(false);
    for (let i = 0; i < 40; i++) score.step(1 / 60, false, true);
    state.entrance = { ...score.layout(256, 192, 120, 512, true), opacity: 0 };
    const wave = pixels();
    state.entrance.rippleStrength = 0;
    const restored = pixels();
    state.entrance.opacity = 1;
    state.entrance.x = 412;
    state.entrance.y = 140;
    const orb = pixels();
    const difference = (a: Uint8Array, b: Uint8Array) =>
      a.reduce((n, v, i) => n + Number(Math.abs(v - b[i]) > 3), 0);
    const result = {
      wave: difference(baseline, wave),
      restored: difference(baseline, restored),
      orb: difference(restored, orb),
      error: renderer.gl.getError(),
    };
    renderer.dispose();
    return result;
  });
  expect(result.wave).toBeGreaterThan(1000);
  expect(result.orb).toBeGreaterThan(500);
  expect(result.restored).toBe(0);
  expect(result.error).toBe(0);
});
