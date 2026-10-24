# FORM — Optical Interaction Studio

An immersive optical artwork built with TypeScript, Vite, and browser graphics APIs, with four Gaussian-splat scenes and a separate set of authored room studies. No account, API key, backend, or uploaded media is required. Capture assets are served with the site; rendering runs on the device.

## Online preview — PC and phone

[Open FORM online](https://rawcdn.githack.com/ejaubashi/vvv/c103629322b7c7f37173f9399a65beff2421c7dc/preview/index.html?room=1&space=apartment&renderer=webgl).

Use the same HTTPS link on a computer or phone. This published edition uses the bold “REAL. UNREAL.” typographic stage, a vertical studio index, direct photographic scene selection and a dark studio panel. Pointer and keyboard interaction reveal section purposes; the responsive type changes its weight on pointer input. The liquid glass fragments, amber sun and room entrance remain. GitHack serves the built files from GitHub; the cloud workspace and development server can be stopped.

The latest source is saved on [glass-object-entrance](https://github.com/ejaubashi/vvv/tree/glass-object-entrance). The published files are on [live-preview](https://github.com/ejaubashi/vvv/tree/live-preview/preview). The link above is pinned to the reviewed release; future editions can have their own links. See [the instrument exhibition release and checks](docs/INSTRUMENT-EXHIBITION.md).

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

A single-file edition can be generated after building with `node scripts/export-standalone.mjs`. It writes `dist/FORM.html` with JavaScript, CSS, thumbnail and captured room embedded (about 61 MB for the full collection); no external application asset requests are needed. The normal multi-file build keeps Spark and each scene lazy. Publish all of `dist/`, including `assets/` and `captures/`.

## Use

- **Enter the lens** opens a large architectural view with a coordinated camera approach. Drag or use arrow keys to look around. **Return to lens** (or Escape) restores the resting lens; **Studio** exposes its settings. See [Enter the lens](docs/ENTER-THE-LENS.md).

- Press the lens to expose **Scene**, **Sound**, and **Focus**. Drag to a labeled action and release, or activate its button. Release outside the lens and targets to cancel. Enter/Space exposes the same actions; left/right arrows navigate them.
- Open **Material** to choose water, glass, or crystal; adjust refraction and frost; expand **Depth & lighting** to change optical depth and highlight direction; compare the original scene; or enable inspection. Inspection drags move the lens without triggering actions. Arrow keys move it; Escape exits inspection.
- **Media → Room** opens the default **captured collection**: Pantheon, Apartment, Small Garden and LA Night. Enter the lens, use Previous/Next, or select one of four scene cards in Media. Every scene downloads only when selected, with its own camera and visible CC BY credit. See [the collection, provenance and controls](docs/CAPTURED-COLLECTION.md).
- **Unravel the room** works in all four scenes: enable it, hold and drag, then release to restore. Keyboard: hold Space and use arrows. Reduced motion disables deformation.
- **Authored studies · threshold experiment** in Media opens Limestone, Nocturne and Veil separately. Their spatial doorway remains available there; `?room=1&studies=1&space=gallery&threshold=1` opens that experiment. See [Impossible thresholds](docs/IMPOSSIBLE-THRESHOLDS.md).
- **Media** also offers three generated art environments: **Fold**, **Sculpture**, and **Veil**. It also accepts local images, videos, and audio up to 150 MB. Images and videos cover the viewport in grayscale. Playback, scrubbing, and elapsed time appear for video/audio. Failed replacements preserve the previous selection. Remove restores the generated scene.
- **Save this moment** in Media closes the workspace and downloads the current optical view as a local PNG, without controls or chrome. An entered room stays expanded for its export.
- **Interaction** controls magnetic response, optional slowly moving **Living light**, and reduced motion. System reduced motion always takes precedence.
- **Details** explains the approximation and reports active renderer, measured frame intervals, resolution, and quality scale.
- A slowly breathing, three-harmonic soundscape starts only after an explicit user action. Focus mode has an exit button. Escape closes panels and restores focus.

## Architecture

| Module                                                                                                          | Responsibility                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/main.ts`, `state.ts`                                                                                       | Application/workspace state, controls, on-demand orchestration                             |
| `gestures.ts`                                                                                                   | Pointer capture, pressure where available, drag selection, inspection                      |
| `motion.ts`                                                                                                     | Shared damped springs, bounded time steps, exact settling                                  |
| `transitions.ts`                                                                                                | Native modal lifecycle, optical morph coordination, inert controls, focus restoration      |
| `render/renderer.ts`                                                                                            | Typed renderer contract, WebGPU, WebGL 2, Canvas fallback, disposal                        |
| `optics.ts`, `export.ts`                                                                                        | Reference transmission/reflection math and local PNG download lifecycle                    |
| `render/shaders.ts`                                                                                             | WGSL/GLSL analytical optics consuming the same uniforms                                    |
| `room/catalog.ts`, `room/architecture.ts`, `room/materials.ts`, `room/pose.ts`, `room/room.ts`, `room/visit.ts` | Actual architectural geometry, bounded camera, Three.js WebGPU/TSL rendering and lifecycle |
| `render/scene.ts`                                                                                               | Shared backdrop texture, interrupted radial reveals, grayscale media cover crop            |
| `media.ts`                                                                                                      | Local URLs, cancelable replacement, playback, Web Audio analysis and cleanup               |
| `ui.ts`, `style.css`                                                                                            | Accessible controls, minimal composition, responsive presentation                          |
| `performance.ts`                                                                                                | Active-frame measurements and adaptive resolution with hysteresis                          |

The lens bends samples from the **actual displayed backdrop**, using a convex surface profile, Snell refraction, optical depth and refractive index. Schlick’s approximation links Fresnel reflection to the material and viewing angle; neighboring samples approximate roughness. Position, deformation, compression, wake, and workspace morph use the same motion state. This is **analytical screen-space optics**, not physical ray tracing; caustics and thickness are approximate. Text fades into the expanded surface without being stretched.

The room engine uses Three.js r186 WebGPURenderer and TSL node materials. Its actual meshes render with a depth buffer, antialiasing, procedural stone surfaces, environment lighting and a bounded floor reflection; lens refraction remains a screen-space approximation. The room frame is sampled only inside the lens.

Renderer selection is WebGPU → WebGL 2 → Canvas 2D. Initialization failures are caught; graphics loss switches to Canvas while navigation and controls remain usable. For diagnosis, append `?renderer=webgl` or `?renderer=canvas`. WebGPU requires a secure context and a supported adapter. The Canvas renderer uses clipped magnification and blur rather than the GPU surface model.

## Validation

```sh
npm test                 # 33 simulation/state/optics/geometry/provenance tests
npm run test:browser     # Chromium functional, room, shader, media and lifecycle tests
npm run build            # strict TypeScript + production build
```

The browser suite uses `/usr/bin/chromium`; override `CHROMIUM_PATH` for another system install. It explicitly enables software graphics for headless shader tests. The WebGPU test also uses `--use-vulkan=swiftshader`; these flags belong to the test runner, not the app. A 12 KB generated WebM fixture makes video tests independent of external services.

Browser coverage includes modal containment and focus restoration, interrupted dismissal, material/reset controls, pointer selection and cancellation, keyboard/touch navigation, inspection, repeated scenes, opt-in sound/focus, grayscale image refraction versus original, local URL revocation, malformed/unsupported/oversized files, concurrent replacement, video/audio transport, mobile rotation, reduced motion, context-loss fallback, both shader paths, and stopping settled frame loops.

## Performance budget and limits

- Target: **60 fps / 16.7 ms** on capable desktop/mobile graphics. This is a target, not a certified hardware result.
- Raster output is capped at **3 million pixels**, device pixel ratio at **1.75**, backdrop/media texture at **1600 pixels on its longest side**, and raster output at **4096 pixels on either axis** (or the active GPU’s lower device limit).
- Three sustained slow measurement windows reduce quality; ten fast windows are needed for recovery. Quality stays within 55–100% to prevent oscillation.
- A simple full-frame backdrop pass is followed by an optical pass bounded to the lens and its halo. Video backdrop invalidation follows decoded-frame callbacks where supported.
- Static scenes reuse textures; GPU uniforms reuse buffers. Settled scenes stop requesting frames. Playback/interaction restart rendering; hidden tabs pause playback, audio, and frame work.
- Earlier cloud Chromium / software Vulkan samples at a **1100 × 800** viewport ranged from 20–25 fps for the first renderer to 15 fps after richer optics; a bounded-pass sample reached 31 fps, rendering at **770 × 560 (70%)**. A controlled, identical-output microbenchmark measured mean submission-plus-queue-completion time of **27.38 ms** with full-frame optics and **13.33 ms** with bounded optics. See [benchmark results](docs/benchmark-results.json) for the exact method; these are not GPU-only timestamps or physical-device frame rates. This does **not** establish the 60 fps target; screenshot readback and shared CPU load can reduce cloud results further.
- Chromium desktop and emulated mobile are tested. Physical iOS/Android devices, Safari/Firefox, thermal behavior, and hardware-GPU frame budgets remain unverified.
- Browser codec support determines accepted formats. Large-file decoding is managed by the browser, even though the uploaded GPU texture is bounded. Files never leave the device.

## Art direction and current technology

See [the researched art direction and roadmap](docs/ART-DIRECTION-AND-TECHNOLOGY.md) for the implemented optical/art upgrades, official WebGPU and browser compatibility sources, Three.js r186/TSL evaluation, WebCodecs recording constraints, and the proposed next releases. Future recording, authored rooms and 3D/XR work are explicitly distinguished from implemented features.

## GitHub Pages deployment

The user has authorized a public preview. `.github/workflows/deploy.yml` builds and deploys pushes to `main`, using the repository name as Vite's base path. The repository's Pages source must be set to **GitHub Actions**. The workflow declares only read access to contents, Pages write, and an OIDC deployment token; no hosting secret is required.

To reproduce the Pages build locally:

```sh
npm run build -- --base=/vvv/
npm run preview -- --base=/vvv/ --port 4173
```

Use the `/vvv/` path when inspecting that build. The intended Pages URL is `https://ejaubashi.github.io/vvv/`; the URL is not live until a GitHub Pages deployment succeeds. GitHub API access and repository administration permissions are needed to configure Pages automatically.

As of 2026-10-23, Pages is not enabled. An attempt to enable it returned GitHub HTTP 403, “Resource not accessible by integration”: the current connection lacks Pages configuration access. The existing workflow is active and also supports manual deployment of a selected branch after Pages is enabled. Use the published online preview above until a Pages deployment succeeds. The execution proxy blocks the GitHack endpoint, so delivery verification uses GitHub refs and exact file hashes rather than a live-CDN browser audit.

The cloud development server must be restarted in a new session; installed files and the production build can be retained in the environment snapshot.
