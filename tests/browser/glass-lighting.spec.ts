import { test, expect } from "@playwright/test";

for (const backend of ["WebGL", "Canvas"] as const) {
  test(`${backend} glass and sun highlights and shadows follow the material light`, async ({
    page,
  }) => {
    await page.goto("/?renderer=canvas");
    const result = await page.evaluate(async (backend) => {
      const { WebGLRenderer, CanvasRenderer } =
        await import("/src/render/renderer.ts");
      const { liquidDistance } = await import("/src/render/splash.ts");
      const renderer =
        backend === "WebGL"
          ? new WebGLRenderer(() => {})
          : new CanvasRenderer();
      renderer.resize(640, 480, 1);
      const scene = document.createElement("canvas");
      scene.width = 640;
      scene.height = 480;
      const ctx = scene.getContext("2d")!;
      ctx.fillStyle = "rgb(233,233,233)";
      ctx.fillRect(0, 0, 640, 480);
      const state = {
        x: 250,
        y: 240,
        radius: 105,
        width: 210,
        height: 210,
        round: 105,
        dx: 0,
        dy: 0,
        intensity: 0,
        ior: 1.52,
        roughness: 0,
        depth: 0.85,
        compare: false,
        lightAngle: -Math.PI / 2,
        energy: 0,
        room: 0,
        immersion: 0,
        entrance: {
          x: 470,
          y: 160,
          radius: 23,
          stretch: 1,
          angle: -0.35,
          opacity: 1,
          impactX: 0,
          impactY: 0,
          rippleRadius: 0,
          rippleStrength: 0,
        },
      } as any;
      const render = () => {
        renderer.draw(state, scene, 1);
        const data = new Uint8Array(640 * 480 * 4);
        if ("gl" in renderer)
          renderer.gl.readPixels(
            0,
            0,
            640,
            480,
            renderer.gl.RGBA,
            renderer.gl.UNSIGNED_BYTE,
            data,
          );
        else data.set(renderer.ctx.getImageData(0, 0, 640, 480).data);
        const pixel = (x: number, y: number) => {
          const i = ((backend === "WebGL" ? 479 - y : y) * 640 + x) * 4;
          return Array.from(data.slice(i, i + 3));
        };
        let outerShadowMaxStep = 0;
        if (state.splash === 1) {
          const outside = (x: number, y: number) =>
            liquidDistance(
              x + 0.5 - state.x,
              y + 0.5 - state.y,
              105,
              105,
              105,
              1,
            ) > 6;
          // The soft body shadow must stay continuous across the empty areas
          // nearest to different fragments; no visible Voronoi seams.
          for (let y = 100; y < 390; y++)
            for (let x = 100; x < 400; x++)
              if (outside(x, y))
                for (const [nx, ny] of [
                  [x + 1, y],
                  [x, y + 1],
                ])
                  if (outside(nx, ny))
                    outerShadowMaxStep = Math.max(
                      outerShadowMaxStep,
                      Math.abs(pixel(x, y)[1] - pixel(nx, ny)[1]),
                    );
        }
        return {
          outerShadowMaxStep,
          rim: pixel(250, 137),
          shadow: pixel(250, 351),
          center: pixel(250, 240),
          sunHighlight: pixel(470, 146),
          sunShadow: pixel(470, 190),
        };
      };
      const topLight = render();
      state.lightAngle = Math.PI / 2;
      const bottomLight = render();
      state.ior = 1;
      state.entrance.opacity = 0;
      const neutral = render();
      state.ior = 1.52;
      state.lightAngle = -Math.PI * 0.75;
      state.splash = 1;
      const fragmented = render();
      const error = "gl" in renderer ? renderer.gl.getError() : 0;
      renderer.dispose();
      return { topLight, bottomLight, neutral, fragmented, error };
    }, backend);
    expect(result.topLight.rim[1] - result.bottomLight.rim[1]).toBeGreaterThan(
      10,
    );
    expect(
      result.bottomLight.shadow[1] - result.topLight.shadow[1],
    ).toBeGreaterThan(10);
    expect(
      result.topLight.sunHighlight[1] - result.bottomLight.sunHighlight[1],
    ).toBeGreaterThan(20);
    expect(
      result.bottomLight.sunShadow[1] - result.topLight.sunShadow[1],
    ).toBeGreaterThan(10);
    for (const pixel of [
      result.topLight.center,
      result.bottomLight.center,
      result.neutral.rim,
      result.neutral.shadow,
    ])
      for (const value of pixel)
        expect(Math.abs(value - 233)).toBeLessThanOrEqual(1);
    expect(result.error).toBe(0);
    expect(result.fragmented.outerShadowMaxStep).toBeLessThan(12);
  });
}
