import { test, expect, type Page } from "@playwright/test";
const canvas = (page: Page) => page.locator("#scene canvas");
async function ready(page: Page, id: string) {
  await expect(canvas(page)).toHaveAttribute("data-room-id", id, {
    timeout: 90000,
  });
  await expect(canvas(page)).toHaveAttribute("data-room-status", "ready", {
    timeout: 90000,
  });
  await expect(canvas(page)).toHaveAttribute("data-room-switching", "false", {
    timeout: 30000,
  });
}

test("the public collection replaces the studies and only downloads the selected scene", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 700, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const downloads: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(".sog")) downloads.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?room=1&space=apartment&renderer=webgl");
  await ready(page, "apartment");
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1", {
    timeout: 30000,
  });
  await expect(page.locator("#capture-credit")).toHaveText(
    "Apartment · Stephane Agullo",
  );
  await expect(page.locator("#threshold-tools")).not.toBeVisible();
  await expect(page.locator("#unravel-tools")).toBeVisible();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/, {
    timeout: 30000,
  });
  await expect(page.locator("[data-room]")).toHaveCount(4);
  expect(
    await page
      .locator("[data-room]")
      .evaluateAll((items) =>
        items.map((i) => (i as HTMLElement).dataset.room),
      ),
  ).toEqual(["pantheon", "apartment", "small-garden", "la-night"]);
  await expect(
    page.getByRole("link", { name: "Authored studies · threshold experiment" }),
  ).toHaveAttribute("href", /studies=1/);
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toContain("/apartment/apartment.sog");
  const download = page.waitForEvent("download");
  await page.locator("#export-frame").click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  expect(errors).toEqual([]);
});

test("changing rooms during the initial capture aborts it and opens the latest capture", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void, arrive!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (arrive = r));
  await page.route("**/captures/pantheon/pantheon.sog", async (route) => {
    arrive();
    await held;
    await route.abort().catch(() => {});
  });
  await page.goto("/?room=1&renderer=webgl");
  await arrived;
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  release();
  await ready(page, "apartment");
  await expect(page).toHaveURL(/space=apartment/);
  await expect(canvas(page)).toHaveAttribute("data-capture-error", "false");
});

test("a failed replacement preserves the current capture and retries the failed scene with its own credit", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 640, height: 540 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let garden = 0;
  await page.route(
    "**/captures/small-garden/small-garden.sog",
    async (route) => {
      garden++;
      if (garden === 1)
        await route.fulfill({ status: 503, body: "unavailable" });
      else await route.continue();
    },
  );
  await page.goto("/?room=1&space=apartment&renderer=webgl");
  await ready(page, "apartment");
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-capture-error", "true", {
    timeout: 30000,
  });
  await expect(canvas(page)).toHaveAttribute("data-room-id", "apartment");
  await expect(page.locator("#capture-credit")).toHaveText(
    "Small Garden · scbenoit",
  );
  await page
    .getByRole("button", { name: "Retry capture", exact: true })
    .click();
  await ready(page, "small-garden");
  await expect(page.locator("#capture-credit")).toHaveText(
    "Small Garden · scbenoit",
  );
  expect(garden).toBe(2);
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await ready(page, "la-night");
  await expect(page.locator("#capture-credit")).toHaveText(
    "LA Night · matousekfoto",
  );
});

test("each new scene renders distinct pixels, navigates, deforms and restores exactly", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.route("**/collection-harness", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<body style="margin:0"></body>',
    }),
  );
  await page.goto("/collection-harness");
  const signatures: string[] = [];
  for (const id of ["apartment", "small-garden", "la-night"]) {
    await page.evaluate(async (id) => {
      const { CapturedRoom } = await import("/src/room/capture.ts");
      const { captureDefinition } = await import("/src/room/capture-source.ts");
      const room = await CapturedRoom.load(
        new AbortController().signal,
        () => {},
        () => {},
        () => {},
        captureDefinition(id as any),
      );
      room.spark.autoUpdate = false;
      (window as any).capture = room;
      room.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
      await room.spark.update({ scene: room.scene, camera: room.camera });
      document.body.replaceChildren(room.engine.domElement);
    }, id);
    await page.waitForFunction(
      () =>
        !(window as any).capture.spark.sorting &&
        !(window as any).capture.spark.sortDirty,
    );
    const before = await page.evaluate(() => {
      const r = (window as any).capture;
      r.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
      return r.engine.domElement.toDataURL();
    });
    signatures.push(before.slice(-1000));
    await page.evaluate(async () => {
      const r = (window as any).capture;
      r.setUnravel({
        amount: 1,
        phase: 1.8,
        brushX: 0,
        brushY: 0,
        flowX: 0.3,
        flowY: 0.1,
      });
      await r.spark.update({ scene: r.scene, camera: r.camera });
      r.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
    });
    await page.waitForFunction(
      () =>
        !(window as any).capture.spark.sorting &&
        !(window as any).capture.spark.sortDirty,
    );
    const held = await page.evaluate(() => {
      const r = (window as any).capture;
      r.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
      return r.engine.domElement.toDataURL();
    });
    expect(held).not.toBe(before);
    await page.evaluate(async () => {
      const r = (window as any).capture;
      r.setUnravel({
        amount: 0,
        phase: 0,
        brushX: 0,
        brushY: 0,
        flowX: 0,
        flowY: 0,
      });
      await r.spark.update({ scene: r.scene, camera: r.camera });
      r.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
    });
    await page.waitForFunction(
      () =>
        !(window as any).capture.spark.sorting &&
        !(window as any).capture.spark.sortDirty,
    );
    const restored = await page.evaluate(() => {
      const r = (window as any).capture;
      r.render({ x: 0, y: 1.55, z: 6.2 }, 512, 512);
      return r.engine.domElement.toDataURL();
    });
    expect(restored).toBe(before);
    const stats = await page.evaluate(() => {
      const r = (window as any).capture;
      r.render({ x: 0.7, y: 1.55, z: 6.2 }, 512, 512);
      const splats = r.spark.activeSplats;
      const changed = r.engine.domElement.toDataURL();
      r.dispose();
      return { splats, changed, disposed: r.disposed };
    });
    expect(stats.splats).toBeGreaterThan(600000);
    expect(stats.changed).not.toBe(before);
    expect(stats.disposed).toBe(true);
  }
  expect(new Set(signatures).size).toBe(3);
});

test("a new scene supports mobile entry, touch, rotation, reduced motion and return", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/?room=1&space=la-night&renderer=webgl");
  await ready(page, "la-night");
  await page.getByRole("button", { name: "Enter the lens", exact: true }).tap();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1", {
    timeout: 30000,
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 130, y: 330 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 210, y: 365 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("#unravel-toggle")).toBeDisabled();
  await expect(page.locator("#capture-credit")).toContainText("matousekfoto");
  await page.getByRole("button", { name: "Return to lens", exact: true }).tap();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0", {
    timeout: 30000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
