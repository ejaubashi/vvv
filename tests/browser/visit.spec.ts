import { test, expect, type Page } from "@playwright/test";
const canvas = (page: Page) => page.locator("#scene canvas");
async function enter(page: Page, path = "/?studies=1&room=1&renderer=webgl") {
  await page.goto(path);
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1", {
    timeout: 20000,
  });
  await expect(page.locator("#room-view")).toBeVisible();
}
test("entering coordinates the view, studio panels and return to the original lens", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?studies=1&room=1&renderer=webgl");
  await expect(canvas(page)).toHaveAttribute("data-room-status", "ready", {
    timeout: 45000,
  });
  const initial = await page.locator("#lens").boundingBox();
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1", {
    timeout: 20000,
  });
  await expect(page.locator("#lens")).not.toBeVisible();
  await expect(page.locator("header")).toHaveJSProperty("inert", true);
  await expect(page.locator("#studio-dock")).not.toBeVisible();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Material", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1");
  await expect(page.locator("#inspect")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Studio", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0", {
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "Enter the lens", exact: true }),
  ).toBeFocused();
  expect(await page.locator("#lens").boundingBox()).toEqual(initial);
  await expect(page.locator("header")).toHaveJSProperty("inert", false);
  expect(errors).toEqual([]);
});
test("the ordinary entry URL initializes the room explicitly and returns to the original backdrop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?studies=1&renderer=webgl");
  await expect(canvas(page)).toHaveAttribute("data-room-status", "idle");
  const initial = await page.locator("#lens").boundingBox();
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1", {
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Return to lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0");
  expect(await page.locator("#lens").boundingBox()).toEqual(initial);
  await expect(page.locator("#room-nav")).not.toBeVisible();
});
test("Escape reverses an entry in progress and a cancelled initialization cannot reopen it", async ({
  page,
}) => {
  await page.goto("/?studies=1&renderer=webgl");
  await page.evaluate(async () => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const original = PortalRoom.prototype.init;
    PortalRoom.prototype.init = async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return original.apply(this, args);
    };
  });
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Enter the lens", exact: true }),
  ).toBeFocused({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0");
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect
    .poll(async () => Number(await canvas(page).getAttribute("data-immersion")))
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0", {
    timeout: 15000,
  });
});
test("mobile touch and keyboard explore the entered room with reduced motion and rotation", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await enter(page);
  const before = Number(await canvas(page).getAttribute("data-room-draws"));
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
    .poll(async () =>
      Number(await canvas(page).getAttribute("data-room-draws")),
    )
    .toBeGreaterThan(before);
  await expect(page.locator("#actions")).not.toBeVisible();
  await expect(page.locator("#room-view")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.getByRole("button", { name: "Return to lens", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0");
  await context.close();
});
test("room switching and leaving room mode remain usable inside the expanded view", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-room-id", "nocturne", {
    timeout: 20000,
  });
  await expect(canvas(page)).toHaveAttribute("data-room-switching", "false");
  await expect(canvas(page)).toHaveAttribute("data-immersion", "1");
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0");
  await expect(page.locator("#visit-bar")).not.toBeVisible();
});
test("the expanded architectural illustration retains its label and exit when graphics fail", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page, "/?studies=1&renderer=canvas&roomRenderer=none");
  await expect(canvas(page)).toHaveAttribute("data-room-status", "fallback");
  await expect(page.locator("#room-count")).toContainText("ILLUSTRATED ROOMS");
  await page
    .getByRole("button", { name: "Return to lens", exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-immersion", "0");
});
test("room cameras render rectangular frames without stretching and stop when the view settles", async ({
  page,
}) => {
  await page.goto("/?studies=1");
  const result = await page.evaluate(async () => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const room = new PortalRoom(() => {});
    await room.init(true);
    room.render(0, 0, 0, 0, 0, 0.85, 1100, 0, 1.6, 1);
    const internal = room as any;
    const frame = {
      width: room.frame.canvas.width,
      height: room.frame.canvas.height,
      aspect: internal.model.camera.aspect,
      z: internal.model.camera.position.z,
    };
    const draws = room.draws;
    room.render(0, 0, 0, 0, 0, 0.85, 1100, 0, 1.6, 1);
    const settled = room.draws === draws;
    await room.select("nocturne");
    room.step(1, true);
    room.render(0, 0, 0, 0, 0, 0.85, 1100, 0, 1.6, 1);
    const replacementAspect = internal.model.camera.aspect;
    await room.dispose();
    return { frame, settled, replacementAspect };
  });
  expect(result.frame.width).toBeGreaterThan(result.frame.height);
  expect(result.frame.aspect).toBe(result.frame.width / result.frame.height);
  expect(result.replacementAspect).toBe(result.frame.aspect);
  expect(result.frame.z).toBeLessThan(5);
  expect(result.settled).toBe(true);
});
