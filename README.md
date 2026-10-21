# FORM — Optical Interaction Studio

A local, monochrome optical playground built with TypeScript, Vite, and browser graphics APIs. No account, API key, backend, remote assets, or uploaded media required.

## Run

Requires Node.js **22.12+** (validated with Node 24.19) and npm.

```sh
cd /workspace/vvv
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
```

The development server binds to all interfaces. Use the environment's port-preview facility if available. For production output:

```sh
npm run build
npm run preview -- --port 4173
```

## Use

- Press the lens to expose **Scene**, **Sound**, and **Focus**. Drag to a labeled action and release, or activate its button. Release outside the lens and targets to cancel. Enter/Space exposes the same actions; left/right arrows navigate them.
- Open **Material** to choose water, glass, or crystal; adjust refraction and frost; compare the original scene; or enable inspection. Inspection drags move the lens without triggering actions. Arrow keys move it; Escape exits inspection.
- **Media** accepts local images, videos, and audio up to 150 MB. Images and videos cover the viewport in grayscale. Playback, scrubbing, and elapsed time appear for video/audio. Failed replacements preserve the previous selection. Remove restores the generated scene.
- **Interaction** controls magnetic response and reduced motion. System reduced motion always takes precedence.
- **Details** explains the approximation and reports active renderer, measured frame intervals, resolution, and quality scale.
- Sound starts only after an explicit user action. Focus mode has an exit button. Escape closes panels and restores focus.

## Architecture

| Module                    | Responsibility                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `src/main.ts`, `state.ts` | Application/workspace state, controls, on-demand orchestration                        |
| `gestures.ts`             | Pointer capture, pressure where available, drag selection, inspection                 |
| `motion.ts`               | Shared damped springs, bounded time steps, exact settling                             |
| `transitions.ts`          | Native modal lifecycle, optical morph coordination, inert controls, focus restoration |
| `render/renderer.ts`      | Typed renderer contract, WebGPU, WebGL 2, Canvas fallback, disposal                   |
| `render/shaders.ts`       | WGSL/GLSL analytical optics consuming the same uniforms                               |
| `render/scene.ts`         | Shared backdrop texture, interrupted radial reveals, grayscale media cover crop       |
| `media.ts`                | Local URLs, cancelable replacement, playback, Web Audio analysis and cleanup          |
| `ui.ts`, `style.css`      | Accessible controls, minimal composition, responsive presentation                     |
| `performance.ts`          | Active-frame measurements and adaptive resolution with hysteresis                     |

The lens bends samples from the **actual displayed backdrop**, using a rounded surface profile and refractive index. A view-dependent edge term approximates Fresnel reflection; neighboring samples approximate roughness. Position, deformation, compression, wake, and workspace morph use the same motion state. This is **analytical screen-space optics**, not physical ray tracing; caustics and thickness are approximate. Text fades into the expanded surface without being stretched.

Renderer selection is WebGPU → WebGL 2 → Canvas 2D. Initialization failures are caught; graphics loss switches to Canvas while navigation and controls remain usable. For diagnosis, append `?renderer=webgl` or `?renderer=canvas`. WebGPU requires a secure context and a supported adapter. The Canvas renderer uses clipped magnification and blur rather than the GPU surface model.

## Validation

```sh
npm test                 # 5 focused simulation/state/performance tests
npm run test:browser     # 12 Chromium functional, shader, media and lifecycle tests
npm run build            # strict TypeScript + production build
```

The browser suite uses `/usr/bin/chromium`; override `CHROMIUM_PATH` for another system install. It explicitly enables software graphics for headless shader tests. The WebGPU test also uses `--use-vulkan=swiftshader`; these flags belong to the test runner, not the app. A 12 KB generated WebM fixture makes video tests independent of external services.

Browser coverage includes modal containment and focus restoration, interrupted dismissal, material/reset controls, pointer selection and cancellation, keyboard/touch navigation, inspection, repeated scenes, opt-in sound/focus, grayscale image refraction versus original, local URL revocation, malformed/unsupported/oversized files, concurrent replacement, video/audio transport, mobile rotation, reduced motion, context-loss fallback, both shader paths, and stopping settled frame loops.

## Performance budget and limits

- Target: **60 fps / 16.7 ms** on capable desktop/mobile graphics. This is a target, not a certified hardware result.
- Raster output is capped at **3 million pixels**, device pixel ratio at **1.75**, and backdrop/media texture at **1600 pixels on its longest side**.
- Three sustained slow measurement windows reduce quality; ten fast windows are needed for recovery. Quality stays within 55–100% to prevent oscillation.
- Static scenes reuse textures; GPU uniforms reuse buffers. Settled scenes stop requesting frames. Playback/interaction restart rendering; hidden tabs pause playback, audio, and frame work.
- Cloud Chromium with **software Vulkan / SwiftShader**, at a **1100 × 800** viewport: measured active-frame windows were **20–25 fps / 39.7–50.0 ms**, rendering at **770 × 560 (70%)**. This does **not** establish the 60 fps target; screenshot readback and shared CPU load can reduce cloud results further.
- Chromium desktop and emulated mobile are tested. Physical iOS/Android devices, Safari/Firefox, thermal behavior, and hardware-GPU frame budgets remain unverified.
- Browser codec support determines accepted formats. Large-file decoding is managed by the browser, even though the uploaded GPU texture is bounded. Files never leave the device.

## GitHub Pages deployment

The user has authorized a public preview. `.github/workflows/deploy.yml` builds and deploys pushes to `main`, using the repository name as Vite's base path. The repository's Pages source must be set to **GitHub Actions**. The workflow declares only read access to contents, Pages write, and an OIDC deployment token; no hosting secret is required.

To reproduce the Pages build locally:

```sh
npm run build -- --base=/vvv/
npm run preview -- --base=/vvv/ --port 4173
```

Use the `/vvv/` path when inspecting that build. The intended Pages URL is `https://ejaubashi.github.io/vvv/`; the URL is not live until a GitHub Pages deployment succeeds. GitHub API access and repository administration permissions are needed to configure Pages automatically.

The cloud development server must be restarted in a new session; installed files and the production build can be retained in the environment snapshot.
