import { test, expect } from "@playwright/test";

for (const backend of ["WebGL", "Canvas"] as const) {
  test(`${backend} splash fragments reveal different regions of one continuous media frame`, async ({
    page,
  }) => {
    await page.goto("/?renderer=canvas");
    const result = await page.evaluate(async (backend) => {
      const { WebGLRenderer, CanvasRenderer } =
        await import("/src/render/renderer.ts");
      const { SPLASH_DROPS, liquidDistance } =
        await import("/src/render/splash.ts");
      const renderer =
        backend === "WebGL"
          ? new WebGLRenderer(() => {})
          : new CanvasRenderer();
      renderer.resize(512, 512, 1);
      const source = document.createElement("canvas");
      source.width = source.height = 512;
      const ctx = source.getContext("2d")!;
      const image = ctx.createImageData(512, 512);
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          const i = (y * 512 + x) * 4;
          image.data.set(
            [Math.round((x / 511) * 255), Math.round((y / 511) * 255), 96, 255],
            i,
          );
        }
      ctx.putImageData(image, 0, 0);
      const background = document.createElement("canvas");
      background.width = background.height = 512;
      const bg = background.getContext("2d")!;
      bg.fillStyle = "#f4f1ea";
      bg.fillRect(0, 0, 512, 512);
      const state = {
        x: 256,
        y: 256,
        radius: 180,
        width: 360,
        height: 360,
        round: 180,
        dx: 0,
        dy: 0,
        intensity: 0,
        ior: 1,
        roughness: 0,
        depth: 0,
        compare: true,
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
        splash: 1,
      } as any;
      renderer.draw(state, background, 1, { canvas: source, version: 1 });
      const pixels = new Uint8Array(512 * 512 * 4);
      if ("gl" in renderer) {
        renderer.gl.readPixels(
          0,
          0,
          512,
          512,
          renderer.gl.RGBA,
          renderer.gl.UNSIGNED_BYTE,
          pixels,
        );
      } else pixels.set(renderer.ctx.getImageData(0, 0, 512, 512).data);
      const pixel = (x: number, y: number) => {
        const index = ((backend === "WebGL" ? 511 - y : y) * 512 + x) * 4;
        return Array.from(pixels.slice(index, index + 3));
      };
      const pieces = [{ x: 0, y: 0 }, ...SPLASH_DROPS].map((drop) => {
        const x = Math.round(256 + drop.x * 180),
          y = Math.round(256 + drop.y * 180);
        return {
          actual: pixel(x, y),
          expected: [
            ((x - 76 + 0.5) / 360) * 255,
            ((y - 76 + 0.5) / 360) * 255,
            96,
          ],
        };
      });
      const gap = { x: 256 + 0.94 * 180, y: 256 - 0.62 * 180 };
      const result = {
        pieces,
        gap: pixel(Math.round(gap.x), Math.round(gap.y)),
        gapDistance: liquidDistance(gap.x - 256, gap.y - 256, 180, 180, 180, 1),
        error: "gl" in renderer ? renderer.gl.getError() : 0,
      };
      renderer.dispose();
      return result;
    }, backend);
    for (const piece of result.pieces)
      for (let channel = 0; channel < 3; channel++)
        expect(
          Math.abs(piece.actual[channel] - piece.expected[channel]),
        ).toBeLessThan(4);
    expect(result.gapDistance).toBeGreaterThan(10);
    expect(result.gap[0]).toBeGreaterThan(225);
    expect(result.gap[1]).toBeGreaterThan(225);
    expect(result.error).toBe(0);
  });
}

test("the splash hit area includes droplets and leaves the spaces between them open", async ({
  page,
}) => {
  await page.goto("/?room=1&renderer=canvas&roomRenderer=none");
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-splash",
    "1",
  );
  const hits = await page.evaluate(async () => {
    const { SPLASH_DROPS } = await import("/src/render/splash.ts");
    const lens = document.querySelector("#lens")!;
    const rect = lens.getBoundingClientRect(),
      radius = rect.width / 2;
    const hit = (x: number, y: number) =>
      document.elementFromPoint(
        rect.x + radius + x * radius,
        rect.y + radius + y * radius,
      ) === lens;
    return {
      pieces: [{ x: 0, y: 0 }, ...SPLASH_DROPS].map((p) => hit(p.x, p.y)),
      gap: hit(0.94, -0.62),
    };
  });
  expect(hits.pieces).toEqual(Array(7).fill(true));
  expect(hits.gap).toBe(false);
  await page.locator("#lens").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cycle scene" })).toBeFocused();
});
