import { test, expect } from "@playwright/test";
const scene = (page: import("@playwright/test").Page) =>
  page.locator("#scene canvas");

test("a failed capture preserves the room; retry loads real splats, supports entry, PNG export and return", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 900, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let downloads = 0;
  await page.route("**/captures/pantheon/pantheon.sog", async (route) => {
    downloads++;
    if (downloads === 1)
      await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto("/?room=1&renderer=webgl");
  await expect(scene(page)).toHaveAttribute("data-room-status", "ready", {
    timeout: 45000,
  });
  expect(downloads).toBe(0);
  await page
    .getByRole("button", { name: "Previous room", exact: true })
    .click();
  await expect(scene(page)).toHaveAttribute("data-capture-error", "true", {
    timeout: 20000,
  });
  await expect(scene(page)).toHaveAttribute("data-room-id", "gallery");
  await expect(scene(page)).toHaveAttribute("data-room-status", "ready");
  await expect(page).toHaveURL(/space=gallery/);
  await expect(page.locator("#capture-state")).toContainText("still open");
  await page
    .getByRole("button", { name: "Retry capture", exact: true })
    .click();
  await expect(scene(page)).toHaveAttribute("data-room-id", "pantheon", {
    timeout: 80000,
  });
  await expect(scene(page)).toHaveAttribute("data-room-switching", "false");
  await expect(scene(page)).toHaveAttribute(
    "data-room-renderer",
    "Spark / Gaussian splats / WebGL 2",
  );
  await expect(page.locator("#capture-note a").first()).toHaveAttribute(
    "href",
    "https://superspl.at/scene/dac6e508",
  );
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(scene(page)).toHaveAttribute("data-immersion", "1", {
    timeout: 20000,
  });
  const before = await scene(page).screenshot();
  await page.locator("#room-view").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1400);
  expect(Buffer.compare(before, await scene(page).screenshot())).not.toBe(0);
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await expect(page.locator('[data-room="pantheon"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const download = page.waitForEvent("download");
  await page.locator("#export-frame").click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(scene(page)).toHaveAttribute("data-immersion", "1");
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await expect(scene(page)).toHaveAttribute("data-room-id", "gallery", {
    timeout: 45000,
  });
  await expect(scene(page)).toHaveAttribute(
    "data-room-renderer",
    "Three.js / WebGL 2",
  );
  await page
    .getByRole("button", { name: "Return to lens", exact: true })
    .click();
  await expect(scene(page)).toHaveAttribute("data-immersion", "0", {
    timeout: 30000,
  });
  expect(downloads).toBe(2);
  expect(errors).toEqual([]);
});

test("superseding an in-flight capture aborts the download and keeps the latest authored room", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release: () => void = () => {};
  let arrived: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/captures/pantheon/pantheon.sog", async (route) => {
    arrived();
    await pending;
    await route.abort().catch(() => {});
  });
  await page.goto("/?room=1&renderer=webgl");
  await expect(scene(page)).toHaveAttribute("data-room-status", "ready", {
    timeout: 45000,
  });
  await page
    .getByRole("button", { name: "Previous room", exact: true })
    .click();
  await requested;
  await expect(page.locator("#capture-state")).toContainText("Downloading");
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  release();
  await expect(scene(page)).toHaveAttribute("data-room-id", "gallery");
  await expect(scene(page)).toHaveAttribute("data-room-switching", "false");
  await expect(scene(page)).toHaveAttribute("data-capture-error", "false");
  await expect(page).toHaveURL(/space=gallery/);
  await expect(page.locator("#capture-note")).toBeHidden();
});

test("a corrupt capture cannot masquerade as a ready captured room", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/captures/pantheon/pantheon.sog", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: Buffer.alloc(10577976, 42),
    }),
  );
  await page.goto("/?room=1&space=pantheon&renderer=webgl");
  await expect(scene(page)).toHaveAttribute("data-room-status", "ready", {
    timeout: 45000,
  });
  await expect(scene(page)).toHaveAttribute("data-room-id", "gallery");
  await expect(scene(page)).toHaveAttribute("data-capture-error", "true");
  await expect(
    page.getByRole("button", { name: "Retry capture" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("the captured room supports mobile touch exploration, reduced motion and rotation", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?room=1&space=pantheon&renderer=webgl");
  await expect(scene(page)).toHaveAttribute("data-room-status", "ready", {
    timeout: 70000,
  });
  await expect(scene(page)).toHaveAttribute("data-room-id", "pantheon");
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(scene(page)).toHaveAttribute("data-immersion", "1", {
    timeout: 20000,
  });
  const before = Number(await scene(page).getAttribute("data-room-draws"));
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
  await expect
    .poll(
      async () => Number(await scene(page).getAttribute("data-room-draws")),
      { timeout: 30000 },
    )
    .toBeGreaterThan(before);
  await expect(page.locator("#capture-note")).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.getByRole("button", { name: "Return to lens", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Return to lens", exact: true })
    .click();
  await expect(scene(page)).toHaveAttribute("data-immersion", "0", {
    timeout: 30000,
  });
  expect(errors).toEqual([]);
  await context.close();
});
