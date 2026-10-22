import { test, expect, type Page } from "@playwright/test";
async function harness(page: Page, touch = false) {
  await page.route("**/interaction-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0"><button id="outside">Outside</button><div id="surface" tabindex="0" style="position:fixed;inset:80px 20px 20px;touch-action:none;background:#ddd">Room</div></body></html>',
    }),
  );
  await page.goto("/interaction-harness");
  await page.evaluate(async () => {
    const { Motion } = await import("/src/motion.ts");
    const { Unravel, UnravelInputs } = await import("/src/room/unravel.ts");
    const { RoomViewInputs } = await import("/src/room/visit.ts");
    const motion = new Motion(),
      state = new Unravel(motion),
      surface = document.querySelector("#surface") as HTMLElement;
    let wakes = 0;
    const view = new RoomViewInputs(
      surface,
      motion,
      () => !state.enabled,
      () => wakes++,
    );
    const inputs = new UnravelInputs(
      surface,
      state,
      () => true,
      () => wakes++,
    );
    (window as any).sculptTest = {
      motion,
      state,
      inputs,
      view,
      tick(n = 240) {
        for (let i = 0; i < n; i++) {
          motion.step(1 / 60);
          state.step(1 / 60);
        }
      },
      get wakes() {
        return wakes;
      },
    };
  });
}
async function tick(page: Page, n = 240) {
  await page.evaluate((n) => (window as any).sculptTest.tick(n), n);
}
async function stats(page: Page) {
  return page.evaluate(() => {
    const h = (window as any).sculptTest;
    return {
      ...h.state.frame,
      active: h.state.active,
      holding: h.state.holding,
      enabled: h.state.enabled,
      lookX: h.motion.viewX.x,
      wakes: h.wakes,
    };
  });
}

test("pointer sculpting is isolated from navigation, releases outside the view and returns to rest", async ({
  page,
}) => {
  await harness(page);
  await page.evaluate(() => (window as any).sculptTest.state.setEnabled(true));
  await page.mouse.move(350, 300);
  await page.mouse.down();
  await tick(page);
  expect((await stats(page)).amount).toBe(1);
  await page.mouse.move(460, 250);
  await tick(page);
  const held = await stats(page);
  expect(held.flowX).toBeGreaterThan(0);
  expect(held.flowY).toBeGreaterThan(0);
  expect(held.lookX).toBe(0);
  await page.mouse.move(10, 10);
  await page.mouse.up();
  await tick(page);
  expect((await stats(page)).active).toBe(false);
  expect((await stats(page)).amount).toBe(0);
  await page.evaluate(() => (window as any).sculptTest.state.setEnabled(false));
  await page.mouse.move(350, 300);
  await page.mouse.down();
  await page.mouse.move(410, 300);
  await page.mouse.up();
  await tick(page);
  expect((await stats(page)).lookX).toBeGreaterThan(0);
});

test("Space and arrows sculpt; Escape, blur and reduced motion cancel safely", async ({
  page,
}) => {
  await harness(page);
  await page.evaluate(() => (window as any).sculptTest.state.setEnabled(true));
  await page.locator("#surface").focus();
  await page.keyboard.down("Space");
  await tick(page);
  await page.keyboard.press("ArrowRight");
  await tick(page);
  expect((await stats(page)).flowX).toBeGreaterThan(0);
  expect((await stats(page)).lookX).toBe(0);
  await page.keyboard.up("Space");
  await tick(page);
  expect((await stats(page)).amount).toBe(0);
  await page.keyboard.down("Space");
  await tick(page);
  await page.keyboard.press("Escape");
  await page.keyboard.up("Space");
  expect((await stats(page)).enabled).toBe(false);
  expect((await stats(page)).amount).toBe(0);
  await page.evaluate(() => (window as any).sculptTest.state.setEnabled(true));
  await page.keyboard.down("Space");
  await tick(page);
  await page.locator("#outside").focus();
  await page.keyboard.up("Space");
  expect((await stats(page)).amount).toBe(0);
  await page.locator("#surface").focus();
  await page.keyboard.down("Space");
  await tick(page);
  await page.evaluate(() => ((window as any).sculptTest.motion.reduced = true));
  await tick(page, 1);
  await page.keyboard.up("Space");
  expect((await stats(page)).amount).toBe(0);
  expect((await stats(page)).enabled).toBe(false);
});

test("touch uses the same hold, drag and release behavior", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await harness(page, true);
  await page.evaluate(() => (window as any).sculptTest.state.setEnabled(true));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 150, y: 340 }],
  });
  await tick(page);
  expect((await stats(page)).holding).toBe(true);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 240, y: 300 }],
  });
  await tick(page);
  expect((await stats(page)).flowX).toBeGreaterThan(0);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await tick(page);
  expect((await stats(page)).amount).toBe(0);
  expect((await stats(page)).active).toBe(false);
  await context.close();
});

test("the real capture changes on the GPU and reconstructs its exact original pixels", async ({
  page,
}) => {
  test.setTimeout(160000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 512, height: 512 });
  await page.route("**/gpu-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0;background:#171510"></body></html>',
    }),
  );
  await page.goto("/gpu-harness");
  await page.evaluate(async () => {
    const { CapturedRoom } = await import("/src/room/capture.ts");
    const room = await CapturedRoom.load(
      new AbortController().signal,
      () => {},
      () => {},
      () => {},
    );
    room.spark.autoUpdate = false;
    (window as any).captureTest = room;
    room.engine.domElement.id = "capture-test";
    document.body.append(room.engine.domElement);
    room.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
  });
  await page.waitForFunction(() => {
    const c = (window as any).captureTest;
    return !c.spark.sorting && !c.spark.sortDirty;
  });
  const before = await page.locator("#capture-test").screenshot();
  await page.evaluate(async () => {
    const c = (window as any).captureTest;
    c.setUnravel({
      amount: 1,
      phase: 1.8,
      brushX: 0,
      brushY: 0,
      flowX: 0.45,
      flowY: 0.15,
    });
    await c.spark.update({ scene: c.scene, camera: c.camera });
    c.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
  });
  await page.waitForFunction(() => {
    const c = (window as any).captureTest;
    return !c.spark.sorting && !c.spark.sortDirty;
  });
  const held = await page.locator("#capture-test").screenshot();
  const change = await page.evaluate(
    async (images) => {
      const pixels = async (base64: string) => {
        const bitmap = await createImageBitmap(
          await (await fetch("data:image/png;base64," + base64)).blob(),
        );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const a = await pixels(images[0]),
        b = await pixels(images[1]);
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
      return sum / a.length;
    },
    [before.toString("base64"), held.toString("base64")],
  );
  expect(change).toBeGreaterThan(3);
  await page.evaluate(async () => {
    const c = (window as any).captureTest;
    c.setUnravel({
      amount: 0,
      phase: 0,
      brushX: 0,
      brushY: 0,
      flowX: 0.45,
      flowY: 0.15,
    });
    await c.spark.update({ scene: c.scene, camera: c.camera });
    c.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
  });
  await page.waitForFunction(() => {
    const c = (window as any).captureTest;
    return !c.spark.sorting && !c.spark.sortDirty;
  });
  const restored = await page.locator("#capture-test").screenshot();
  expect(Buffer.compare(before, restored)).toBe(0);
  const count = await page.evaluate(
    () => (window as any).captureTest.spark.activeSplats,
  );
  expect(count).toBeGreaterThan(100000);
  await page.evaluate(() => (window as any).captureTest.dispose());
  expect(errors).toEqual([]);
});

test("the app exposes deliberate sculpting, honors reduced motion, and cancels before opening Studio", async ({
  page,
}) => {
  test.setTimeout(200000);
  await page.setViewportSize({ width: 700, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const canvas = page.locator("#scene canvas");
  await page.goto("/?room=1&space=pantheon&renderer=webgl");
  await expect(canvas).toHaveAttribute("data-room-status", "ready", {
    timeout: 70000,
  });
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-immersion", "1", {
    timeout: 45000,
  });
  const toggle = page.locator("#unravel-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeDisabled();
  await expect(page.locator("#unravel-hint")).toContainText("reduced motion");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(toggle).toBeEnabled({ timeout: 30000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true", {
    timeout: 30000,
  });
  await expect(page.locator("#room-view")).toBeFocused();
  await page.keyboard.down("Space");
  await expect(canvas).toHaveAttribute("data-unravel-holding", "true", {
    timeout: 30000,
  });
  await expect
    .poll(
      async () => Number(await canvas.getAttribute("data-unravel-amount")),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  await page.keyboard.up("Space");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-unravel-mode", "false", {
    timeout: 45000,
  });
  await expect(canvas).toHaveAttribute("data-unravel-amount", "0");
  await expect(canvas).toHaveAttribute("data-immersion", "1");
  await toggle.click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-unravel-mode", "false", {
    timeout: 30000,
  });
  await expect(page.locator("#unravel-tools")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Return to lens", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-immersion", "0", {
    timeout: 45000,
  });
  await expect(page.locator("#unravel-tools")).toBeHidden();
  expect(errors).toEqual([]);
});
