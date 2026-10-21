import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page, path = "/?room=1&renderer=webgl") {
  await page.goto(path);
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-status",
    "ready",
    { timeout: 45000 },
  );
  await expect
    .poll(() => page.locator("#scene canvas").getAttribute("data-room-draws"))
    .not.toBe("0");
}
async function open(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
}
async function close(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
}
test("the real room renders inside the lens, responds to view movement and stops when settled", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-renderer",
    "Three.js / WebGL 2",
  );
  const first = await page.locator("#scene canvas").screenshot();
  const draws = Number(
    await page.locator("#scene canvas").getAttribute("data-room-draws"),
  );
  await page.mouse.move(200, 300);
  await expect
    .poll(async () =>
      Number(
        await page.locator("#scene canvas").getAttribute("data-room-draws"),
      ),
    )
    .toBeGreaterThan(draws);
  await page.waitForTimeout(1600);
  const second = await page.locator("#scene canvas").screenshot();
  expect(Buffer.compare(first, second)).not.toBe(0);
  const stats = await page.evaluate(
    async (images) => {
      const pixels = async (base64: string) => {
        const bitmap = await createImageBitmap(
          await (await fetch("data:image/png;base64," + base64)).blob(),
        );
        const c = document.createElement("canvas");
        c.width = bitmap.width;
        c.height = bitmap.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const a = await pixels(images[0]),
        b = await pixels(images[1]);
      let different = 0;
      for (let i = 0; i < 400; i++)
        different = Math.max(different, Math.abs(a[i] - b[i]));
      return different;
    },
    [first.toString("base64"), second.toString("base64")],
  );
  // Adaptive resampling may round a backdrop channel by one 8-bit step.
  expect(stats).toBeLessThanOrEqual(1);
  await page.waitForTimeout(500);
  const settled = await page
    .locator("#scene canvas")
    .getAttribute("data-room-draws");
  await page.waitForTimeout(350);
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-draws",
    settled!,
  );
  expect(errors).toEqual([]);
});
test("room selection, material controls and switching back to a normal environment work", async ({
  page,
}) => {
  await ready(page);
  await open(page, "Material");
  await page.getByText("Depth & lighting", { exact: false }).click();
  await page.locator("#depth").fill("1.4");
  await close(page);
  await open(page, "Media");
  await expect(
    page.getByRole("button", { name: "Room", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Veil", exact: true }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.waitForTimeout(1300);
  const outside = await page.locator("#scene canvas").screenshot();
  await open(page, "Media");
  await page.getByRole("button", { name: "Room", exact: true }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.waitForTimeout(1300);
  const inside = await page.locator("#scene canvas").screenshot();
  expect(Buffer.compare(outside, inside)).not.toBe(0);
  await open(page, "Details");
  await expect(page.locator("#room-renderer")).toHaveText("Three.js / WebGL 2");
  await expect(page.locator("#room-measurement")).toContainText("12 meshes");
});
test("the room retains keyboard/touch inspection and reduced-motion behavior on mobile", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await ready(page);
  const draws = await page
    .locator("#scene canvas")
    .getAttribute("data-room-draws");
  await page.mouse.move(80, 280);
  await page.waitForTimeout(200);
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-draws",
    draws!,
  );
  await open(page, "Material");
  await page.getByRole("switch", { name: /Inspect the lens/ }).check();
  await expect(page.locator("dialog")).not.toBeVisible();
  const box = (await page.locator("#lens").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(
        await page.locator("#scene canvas").getAttribute("data-room-draws"),
      ),
    )
    .toBeGreaterThan(Number(draws));
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("#lens")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
test("room initialization failure keeps an architectural fallback and functional navigation", async ({
  page,
}) => {
  await page.goto("/?room=1&renderer=canvas&roomRenderer=none");
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-status",
    "fallback",
  );
  await open(page, "Details");
  await expect(page.locator("#room-renderer")).toContainText("illustration");
  await close(page);
  await open(page, "Media");
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#lens")).toBeVisible();
});
test("disposing during initialization releases room geometry and the graphics renderer", async ({
  page,
}) => {
  await page.goto("/");
  const state = await page.evaluate(async () => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const room = new PortalRoom(() => {});
    const pending = room.init(true);
    room.dispose();
    await pending;
    return { status: room.status, meshes: room.meshCount };
  });
  expect(state).toEqual({ status: "disposed", meshes: 0 });
});
test("WebGPU renders the architectural scene through the WebGPU lens", async ({
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
  const page = await browser.newPage({
    viewport: { width: 1000, height: 760 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await ready(page, "/?room=1");
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-renderer",
    "Three.js / WebGPU",
  );
  await open(page, "Details");
  await expect(page.locator("#renderer-name")).toHaveText("WebGPU");
  await expect(page.locator("#room-measurement")).toContainText("12 meshes");
  await close(page);
  for (const id of ["nocturne", "veil"]) {
    await page.getByRole("button", { name: "Next room", exact: true }).click();
    await expect(page.locator("#scene canvas")).toHaveAttribute(
      "data-room-id",
      id,
      { timeout: 30000 },
    );
    await expect(page.locator("#scene canvas")).toHaveAttribute(
      "data-room-switching",
      "false",
    );
    await expect(page.locator("#scene canvas")).toHaveAttribute(
      "data-room-blend",
      "1",
    );
  }
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-immersion",
    "1",
    { timeout: 30000 },
  );
  await page.setViewportSize({ width: 1000, height: 600 });
  await expect(page.locator("#room-view")).toBeVisible();
  await page.screenshot({ path: "/tmp/form-room-webgpu-entered.png" });
  await page
    .getByRole("button", { name: "Return to lens", exact: true })
    .click();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-immersion",
    "0",
    { timeout: 20000 },
  );
  await page.screenshot({ path: "/tmp/form-room-webgpu-test.png" });
  expect(errors).toEqual([]);
  await browser.close();
});

test("actual GPU unavailability retains the room illustration and studio controls", async ({
  playwright,
}) => {
  const browser = await playwright.chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-gpu", "--disable-webgl"],
  });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/?room=1");
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-status",
    "fallback",
    { timeout: 45000 },
  );
  await open(page, "Details");
  await expect(page.locator("#renderer-name")).toHaveText("Canvas 2D fallback");
  await expect(page.locator("#room-renderer")).toContainText("illustration");
  expect(errors).toEqual([]);
  await browser.close();
});

test("the rendered depth buffer actually hides the back sculpture behind the near column", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const room = new PortalRoom(() => {});
    await room.init(true);
    if (room.status !== "ready") throw Error("Real 3D rendering is required");
    const state = room as any;
    room.render(-1, 0, 0, 0, 0, 0.85, 512);
    const model = state.model,
      point = model.sculpture.position.clone().project(model.camera);
    const x = Math.round((point.x + 1) * 0.5 * room.resolution),
      y = Math.round((1 - point.y) * 0.5 * room.resolution);
    const sample = () =>
      Array.from(
        room.frame.canvas.getContext("2d")!.getImageData(x, y, 1, 1).data,
      );
    const occluded = sample();
    model.occluder.visible = false;
    state.lastPose.x = Infinity;
    room.render(-1, 0, 0, 0, 0, 0.85, 512);
    const revealed = sample();
    await room.dispose();
    return { occluded, revealed };
  });
  const difference = result.occluded
    .slice(0, 3)
    .reduce(
      (sum, value, index) => sum + Math.abs(value - result.revealed[index]),
      0,
    );
  console.log("Depth-buffer pixel test:", result);
  expect(difference).toBeGreaterThan(12);
});

test("losing the room graphics context releases geometry and preserves an architectural image", async ({
  page,
}) => {
  await page.goto("/");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const room = new PortalRoom(() => {});
    await room.init(true);
    room.render(0, 0, 0, 0, 0, 0.85, 512);
    const canvas = (room as any).engine.domElement;
    await new Promise<void>((resolve) => {
      canvas.addEventListener(
        "webglcontextlost",
        () => setTimeout(resolve, 30),
        { once: true },
      );
      canvas
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext();
    });
    room.render(0, 0, 0, 0, 0, 0.85, 512);
    const result = {
      status: room.status,
      meshes: room.meshCount,
      size: room.frame.canvas.width,
      version: room.frame.version,
    };
    await room.dispose();
    return result;
  });
  expect(result.status).toBe("fallback");
  expect(result.meshes).toBe(0);
  expect(result.size).toBe(512);
  expect(result.version).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
