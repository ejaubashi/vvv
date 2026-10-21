import { test, expect, type Page } from "@playwright/test";
async function open(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/);
}
async function close(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#lens")).toBeVisible();
}
async function go(page: Page, path = "/?renderer=canvas") {
  await page.goto(path);
  await expect(page.locator("#scene canvas")).toBeVisible();
}
const svg = (stripe = 80) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="white"/><rect x="${stripe}" width="100" height="400" fill="black"/></svg>`,
  );
function wav() {
  const n = 8000;
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(
      Math.sin((i / 8000) * 220 * Math.PI * 2) * 2000,
      44 + i * 2,
    );
  return data;
}
test("material controls, modal containment, focus restoration, interrupted close", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await go(page);
  await open(page, "Material");
  await expect(
    page.getByRole("button", { name: "Close workspace" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Water n 1.33" }).click();
  await expect(page.locator("#ior")).toHaveValue("1.33");
  await page.locator("#ior").fill("1.78");
  await expect(page.locator("#ior-value")).toHaveText("1.78");
  await page.getByRole("switch", { name: /Original scene/ }).check();
  await expect(page.locator("#compare")).toBeChecked();
  await page.keyboard.press("Tab");
  expect(
    await page
      .locator("dialog")
      .evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await close(page);
  await expect(
    page.getByRole("button", { name: "Material", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await open(page, "Material");
  await page.getByRole("button", { name: "Reset material & position" }).click();
  await expect(page.locator("#ior")).toHaveValue("1.52");
  await expect(page.locator("#compare")).not.toBeChecked();
  expect(errors).toEqual([]);
});
test("lens actions support keyboard, scene cycling, focus and opt-in sound", async ({
  page,
}) => {
  await go(page);
  for (let i = 0; i < 4; i++) {
    await page.locator("#lens").focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Cycle scene" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page.locator("#scene-label")).toHaveText("SILVER");
  await page.locator("#lens").press("Enter");
  await page
    .getByRole("button", { name: "Enable sound demonstration" })
    .click();
  await expect(page.locator("#toast")).toContainText("Sound on");
  await page.locator("#lens").press("Enter");
  await page
    .getByRole("button", { name: "Disable sound demonstration" })
    .click();
  await expect(page.locator("#toast")).toContainText("Sound off");
  await page.locator("#lens").press("Enter");
  await page.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(page.locator("#exit-focus")).toBeVisible();
  await expect(page.locator("header")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("header")).toBeVisible();
});
test("inspection drag never executes actions; navigation drag previews, executes and cancels", async ({
  page,
}) => {
  await go(page);
  await open(page, "Material");
  await page.getByRole("switch", { name: /Inspect the lens/ }).check();
  await expect(page.locator("dialog")).not.toBeVisible();
  let box = (await page.locator("#lens").boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 50, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const moved = (await page.locator("#lens").boundingBox())!;
  expect(moved.x).toBeGreaterThan(box.x + 70);
  await expect(page.locator("#actions")).toBeHidden();
  await page.keyboard.press("Escape");
  box = (await page.locator("#lens").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const scene = (await page
    .getByRole("button", { name: "Cycle scene" })
    .boundingBox())!;
  await page.mouse.move(scene.x + scene.width / 2, scene.y + scene.height / 2, {
    steps: 6,
  });
  await expect(page.getByRole("button", { name: "Cycle scene" })).toHaveClass(
    /preview/,
  );
  await page.mouse.up();
  await expect(page.locator("#scene-label")).toHaveText("SILVER");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(25, 130, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#actions")).toBeHidden();
  await expect(page.locator("#scene-label")).toHaveText("SILVER");
});
test("local images replace and release URLs; unsupported and malformed files recover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL;
    const tracked: string[] = [];
    (window as any).__revoked = tracked;
    URL.revokeObjectURL = function (url: string) {
      tracked.push(url);
      original.call(URL, url);
    };
  });
  await go(page);
  await open(page, "Media");
  await page.locator("#file").setInputFiles({
    name: "first.svg",
    mimeType: "image/svg+xml",
    buffer: svg(),
  });
  await expect(page.locator("#filename")).toHaveText("first.svg");
  await page.locator("#file").setInputFiles({
    name: "second.svg",
    mimeType: "image/svg+xml",
    buffer: svg(200),
  });
  await expect(page.locator("#filename")).toHaveText("second.svg");
  expect(await page.evaluate(() => (window as any).__revoked.length)).toBe(1);
  await page.locator("#file").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator("#toast")).toContainText("could not be decoded");
  await expect(page.locator("#filename")).toHaveText("second.svg");
  await page.locator("#file").setInputFiles({
    name: "text.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.locator("#toast")).toContainText("Choose an image");
  await page.getByRole("button", { name: "Remove media" }).click();
  await expect(page.locator("#filename")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__revoked.length)).toBe(3);
});
test("audio playback, seeking, and replacement work", async ({ page }) => {
  await go(page);
  await open(page, "Media");
  await page
    .locator("#file")
    .setInputFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: wav() });
  await expect(page.locator("#filename")).toHaveText("tone.wav");
  await page.getByRole("button", { name: "Play media" }).click();
  await expect(page.getByRole("button", { name: "Pause media" })).toBeVisible();
  await page.getByRole("button", { name: "Pause media" }).click();
  await page.locator("#scrub").fill("60");
  await expect(page.locator("#time")).toHaveText("0:00 / 0:01");
  await page.getByRole("button", { name: "Remove media" }).click();
  await expect(page.locator("#play")).toHaveCount(0);
});
test("mobile touch, reduced motion, resize, and fallback retain controls", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await go(page);
  await page.locator("#lens").tap();
  await expect(page.locator("#actions")).toBeVisible();
  await page.getByRole("button", { name: "Cycle scene" }).tap();
  await expect(page.locator("#scene-label")).toHaveText("SILVER");
  await open(page, "Material");
  await expect(page.locator("#ior")).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: "Reset material & position" }).click();
  await close(page);
  await open(page, "Interaction");
  await expect(page.locator("#reduce-motion")).toBeChecked();
  await close(page);
  await open(page, "Details");
  await expect(page.locator("#renderer-name")).toHaveText("Canvas 2D fallback");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
test("WebGL shader renders optical differences and material changes without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await go(page, "/?renderer=webgl");
  await open(page, "Details");
  await expect(page.locator("#renderer-name")).toHaveText("WebGL 2");
  await close(page);
  await open(page, "Media");
  await page.locator("#file").setInputFiles({
    name: "stripes.svg",
    mimeType: "image/svg+xml",
    buffer: svg(150),
  });
  await expect(page.locator("#filename")).toHaveText("stripes.svg");
  await close(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(900);
  const refracted = await page.locator("#scene canvas").screenshot();
  await open(page, "Material");
  await page.getByRole("switch", { name: /Original scene/ }).check();
  await close(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(900);
  const original = await page.locator("#scene canvas").screenshot();
  expect(Buffer.compare(refracted, original)).not.toBe(0);
  expect(errors).toEqual([]);
});
test("video playback, elapsed time and scrubbing are functional", async ({
  page,
}) => {
  await go(page);
  await open(page, "Media");
  await page.locator("#file").setInputFiles("tests/fixtures/study.webm");
  await expect(page.locator("#filename")).toHaveText("study.webm");
  await page.getByRole("button", { name: "Play media" }).click();
  await expect(page.getByRole("button", { name: "Pause media" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Pause media" }).click();
  await page.locator("#scrub").fill("70");
  await expect(page.locator("#time")).toHaveText("0:02 / 0:03");
  await close(page);
  await open(page, "Media");
  await page.getByRole("button", { name: "Remove media" }).click();
  await expect(page.locator("#play")).toHaveCount(0);
});
test("GPU context loss switches to the functional fallback", async ({
  page,
}) => {
  await go(page, "/?renderer=webgl");
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas")!;
    canvas
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext();
  });
  await open(page, "Details");
  await expect(page.locator("#renderer-name")).toHaveText("Canvas 2D fallback");
  await close(page);
  await open(page, "Material");
  await page.getByRole("button", { name: "Crystal n 1.62" }).click();
  await expect(page.locator("#ior")).toHaveValue("1.62");
});
test("WebGPU shaders compile and present; measured active frames are recorded", async ({
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
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await go(page, "/");
  await open(page, "Details");
  await expect(page.locator("#renderer-name")).toHaveText("WebGPU");
  await close(page);
  await page.locator("#lens").press("Enter");
  await page
    .getByRole("button", { name: "Enable sound demonstration" })
    .click();
  await page.waitForTimeout(4500);
  await open(page, "Details");
  const measurement = await page.locator("#fps").innerText();
  console.log(
    "WebGPU, software Vulkan, 1100×800:",
    measurement,
    "resolution:",
    await page.locator("#resolution").innerText(),
    "quality:",
    await page.locator("#quality").innerText(),
  );
  await expect(page.locator("#fps")).toContainText("fps");
  await page.screenshot({ path: "/tmp/form-webgpu-details.png" });
  expect(errors).toEqual([]);
  await browser.close();
});

test("superseded media loads and oversized selections clean up without replacing the current file", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL;
    (window as any).__releases = 0;
    URL.revokeObjectURL = function (url) {
      (window as any).__releases++;
      original.call(URL, url);
    };
  });
  await go(page);
  await open(page, "Media");
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#file")!;
    for (const name of ["obsolete.svg", "current.svg"]) {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="gray"/></svg>',
          ],
          name,
          { type: "image/svg+xml" },
        ),
      );
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
    }
  });
  await expect(page.locator("#filename")).toHaveText("current.svg");
  expect(await page.evaluate(() => (window as any).__releases)).toBe(1);
  await page.evaluate(() => {
    const file = new File(["x"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 151 * 1024 * 1024 });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector<HTMLInputElement>("#file")!;
    input.files = transfer.files;
    input.dispatchEvent(new Event("change"));
  });
  await expect(page.locator("#toast")).toContainText("smaller than 150 MB");
  await expect(page.locator("#filename")).toHaveText("current.svg");
  await page.getByRole("button", { name: "Remove media" }).click();
  expect(await page.evaluate(() => (window as any).__releases)).toBe(2);
});

test("the renderer stops requesting frames after the interaction settles", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame;
    (window as any).__frames = 0;
    window.requestAnimationFrame = (callback) => {
      (window as any).__frames++;
      return original.call(window, callback);
    };
  });
  await go(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1800);
  const before = await page.evaluate(() => (window as any).__frames);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__frames)).toBe(before);
  await page.mouse.move(550, 350);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).__frames)).toBeGreaterThan(
    before,
  );
});
