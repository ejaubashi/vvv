import { test, expect, type Page } from "@playwright/test";

const panel = (page: Page, name: string) =>
  page.locator(`[data-panel="${name}"]`);
const running = (page: Page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" || a.pending).length,
  );

test("title motion settles; rapid section changes preserve controls, focus and current content", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?renderer=canvas");
  await expect(
    page.getByRole("heading", { name: "Look closer." }),
  ).toBeVisible();
  await expect(page.locator("#exhibition-title")).toHaveAttribute(
    "data-motion",
    "settled",
  );
  const copy = page.locator(".exhibition-copy");
  const bounds = (await copy.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.9,
    bounds.y + bounds.height * 0.3,
  );
  await expect
    .poll(() =>
      copy.evaluate((el) =>
        Number.parseFloat(el.style.getPropertyValue("--title-x") || "0"),
      ),
    )
    .toBeGreaterThan(0.5);
  await page.mouse.move(0, 0);
  await expect
    .poll(() => copy.evaluate((el) => el.style.getPropertyValue("--title-x")))
    .toBe("0px");
  const material = page.getByRole("button", { name: "Material", exact: true });
  await material.hover();
  await expect(page.locator("#studio-intent")).toHaveText(
    "02 / Shape the light.",
  );
  await page.mouse.move(0, 0);
  await expect(page.locator("#studio-intent")).toHaveText(
    "Real places. Seen differently.",
  );
  await material.focus();
  await expect(page.locator("#studio-intent")).toHaveText(
    "02 / Shape the light.",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await page.locator("#ior").fill("1.78");
  // Immediate changes must not enqueue stale content or wait for a visual exit.
  await page.evaluate(() => {
    for (const name of ["media", "interaction", "material", "details"])
      document
        .querySelector<HTMLButtonElement>(`[data-panel="${name}"]`)!
        .click();
  });
  await expect(
    page.getByRole("heading", { level: 1, name: "About FORM" }),
  ).toBeVisible();
  await expect(panel(page, "details")).toHaveAttribute("aria-pressed", "true");
  expect(
    await page
      .locator(".workspace-sections")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await expect(page.locator("#workspace")).toHaveAttribute(
    "data-motion-direction",
    "forward",
  );
  await panel(page, "material").focus();
  await page.keyboard.press("Enter");
  await expect(panel(page, "material")).toBeFocused();
  await expect(page.locator("#workspace")).toHaveAttribute(
    "data-motion-direction",
    "backward",
  );
  await expect(page.locator("#ior")).toHaveValue("1.78");
  await expect(page.locator(".workspace-content")).toHaveAttribute(
    "data-motion",
    "settled",
  );
  await expect.poll(() => running(page)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Material", exact: true }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test("system reduced motion finishes an in-flight panel score and restores stable text", async ({
  page,
}) => {
  await page.goto("/?renderer=canvas");
  await page.getByRole("button", { name: "Material", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await panel(page, "details").click();
  await expect(page.locator(".workspace-content")).toHaveAttribute(
    "data-motion",
    "revealing",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("body")).toHaveClass(/reduced/);
  await expect(page.locator(".workspace-content")).toHaveAttribute(
    "data-motion",
    "settled",
  );
  await expect(page.getByRole("heading", { name: "About FORM" })).toBeVisible();
  await expect.poll(() => running(page)).toBe(0);
  await panel(page, "media").click();
  await expect(page.locator("#file")).toBeAttached();
  await expect(page.locator(".workspace-content")).toHaveAttribute(
    "data-motion",
    "settled",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#exhibition-title")).toHaveAttribute(
    "data-motion",
    "settled",
  );
});

test("touch section navigation honors application reduced motion and keeps the close control available", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/?renderer=canvas");
  await page.getByRole("button", { name: "Interaction", exact: true }).tap();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await page.getByRole("switch", { name: /Reduced motion/ }).check();
  await expect(page.locator("body")).toHaveClass(/reduced/);
  await panel(page, "media").tap();
  await expect(
    page.getByRole("heading", { name: "Scenes & media", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-content")).toHaveAttribute(
    "data-motion",
    "settled",
  );
  await panel(page, "material").tap();
  await expect(page.locator("#ior")).toBeVisible();
  await expect.poll(() => running(page)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("dialog")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.getByRole("button", { name: "Close workspace" }).tap();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Interaction", exact: true }),
  ).toBeFocused();
  await page.locator("#browse-collection").tap();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await expect(
    page.getByRole("heading", { name: "Scenes & media", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#browse-collection")).toBeFocused();
  await context.close();
});

test("sections remain functional without the Web Animations API", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("/?renderer=canvas");
  await expect(page.locator("#exhibition-title")).toHaveAttribute(
    "data-motion",
    "settled",
  );
  await page.getByRole("button", { name: "Material", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await panel(page, "details").click();
  await expect(page.getByRole("heading", { name: "About FORM" })).toBeVisible();
  await expect(page.locator(".workspace-content")).toHaveAttribute(
    "data-motion",
    "settled",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
});
