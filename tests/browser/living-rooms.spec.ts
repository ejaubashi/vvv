import { test, expect, type Page } from "@playwright/test";

const canvas = (page: Page) => page.locator("#scene canvas");
async function ready(page: Page, query = "") {
  await page.goto("/?room=1&renderer=webgl" + query);
  await expect(canvas(page)).toHaveAttribute("data-room-status", "ready", {
    timeout: 45000,
  });
  await expect
    .poll(() => canvas(page).getAttribute("data-room-draws"))
    .not.toBe("0");
}
async function room(page: Page, id: string) {
  await expect(canvas(page)).toHaveAttribute("data-room-id", id, {
    timeout: 30000,
  });
  await expect(canvas(page)).toHaveAttribute("data-room-switching", "false");
  await expect(canvas(page)).toHaveAttribute("data-room-blend", "1", {
    timeout: 10000,
  });
}
test("room navigation changes actual imagery, follows the latest request and shares the current room URL", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const limestone = await canvas(page).screenshot();
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await room(page, "nocturne");
  const nocturne = await canvas(page).screenshot();
  expect(Buffer.compare(limestone, nocturne)).not.toBe(0);
  await expect(page).toHaveURL(/space=nocturne/);
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await page
    .getByRole("button", { name: "Previous room", exact: true })
    .click();
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await room(page, "veil");
  expect(Buffer.compare(nocturne, await canvas(page).screenshot())).not.toBe(0);
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await expect(page.locator('[data-room="veil"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-room="gallery"]').click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await room(page, "gallery");
  expect(errors).toEqual([]);
});
test("the opt-in journey advances, can pause and resume, and manual exploration pauses it", async ({
  page,
}) => {
  test.setTimeout(50000);
  await ready(page);
  await expect(page.locator("#room-nav")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await page.getByRole("button", { name: "Play rooms", exact: true }).click();
  await expect(page.locator("#room-nav")).toHaveAttribute(
    "data-playing",
    "true",
  );
  await expect(canvas(page)).toHaveAttribute("data-room-id", "nocturne", {
    timeout: 25000,
  });
  await room(page, "nocturne");
  await page.getByRole("button", { name: "Pause rooms", exact: true }).click();
  await expect(page.locator("#room-nav")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await page.waitForTimeout(1200);
  const draws = await canvas(page).getAttribute("data-room-draws");
  await page.waitForTimeout(300);
  await expect(canvas(page)).toHaveAttribute("data-room-draws", draws!);
  await page.getByRole("button", { name: "Play rooms", exact: true }).click();
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await room(page, "veil");
  await expect(page.locator("#room-nav")).toHaveAttribute(
    "data-playing",
    "false",
  );
});
test("mobile reduced motion keeps manual keyboard room exploration and disables automatic playback", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await ready(page, "&space=veil");
  await room(page, "veil");
  await expect(
    page.getByRole("button", { name: "Play rooms", exact: true }),
  ).toBeDisabled();
  const previous = page.getByRole("button", {
    name: "Previous room",
    exact: true,
  });
  await previous.focus();
  await page.keyboard.press("Enter");
  await room(page, "nocturne");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("#room-nav")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
test("room replacement reuses one renderer, disposes old geometry and cancels during disposal", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { PortalRoom } = await import("/src/room/room.ts");
    const room = new PortalRoom(() => {});
    await room.init(true);
    room.render(0, 0, 0, 0, 0, 0.85, 512);
    const internal = room as any,
      engine = internal.engine;
    let disposed = 0;
    const geometries = new Set<any>(
      internal.model.meshes.map((m: any) => m.geometry),
    );
    for (const geometry of geometries)
      geometry.addEventListener("dispose", () => disposed++);
    await Promise.all([room.select("nocturne"), room.select("veil")]);
    room.step(1, true);
    room.render(0, 0, 0, 0, 0, 0.85, 512);
    const kind = room.kind,
      reused = internal.engine === engine;
    const pending = room.select("gallery");
    await room.dispose();
    await pending;
    return {
      kind,
      reused,
      disposed,
      expected: geometries.size,
      status: room.status,
      meshes: room.meshCount,
      surfaces: internal.surfaces,
    };
  });
  expect(result.kind).toBe("veil");
  expect(result.reused).toBe(true);
  expect(result.disposed).toBe(result.expected);
  expect(result.status).toBe("disposed");
  expect(result.meshes).toBe(0);
  expect(result.surfaces).toBeNull();
});
test("architectural fallback editions remain selectable and leave room mode cleanly", async ({
  page,
}) => {
  await page.goto("/?room=1&renderer=canvas&roomRenderer=none");
  await expect(canvas(page)).toHaveAttribute("data-room-status", "fallback");
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await room(page, "nocturne");
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await room(page, "veil");
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#room-nav")).not.toBeVisible();
});

test("a reduced-motion preference change pauses playback and restores room navigation after a panel closes", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Play rooms", exact: true }).click();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#journey-toggle")).toBeDisabled();
  await expect(page.locator("#journey-replay")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#room-nav")).toBeVisible();
  await expect(page.locator("#room-nav")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Play rooms", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next room", exact: true }).click();
  await room(page, "nocturne");
});
test("optional living light updates the actual room and stops drawing when disabled", async ({
  page,
}) => {
  await ready(page);
  const control = async (enabled: boolean) => {
    await page
      .getByRole("button", { name: "Interaction", exact: true })
      .click();
    await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
    await page
      .getByRole("switch", { name: /Living light/ })
      .setChecked(enabled);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).not.toBeVisible();
  };
  await control(true);
  await page.waitForTimeout(1200);
  const active = Number(await canvas(page).getAttribute("data-room-draws"));
  await expect
    .poll(async () =>
      Number(await canvas(page).getAttribute("data-room-draws")),
    )
    .toBeGreaterThan(active);
  await control(false);
  await page.waitForTimeout(1800);
  const settled = await canvas(page).getAttribute("data-room-draws");
  await page.waitForTimeout(350);
  await expect(canvas(page)).toHaveAttribute("data-room-draws", settled!);
});
