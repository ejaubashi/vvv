# FORM: an immersive optical artwork

Research and implementation decisions, **21 October 2026**. Direction selected by the user: **an immersive interactive art experience**.

FORM should become a small world that responds coherently to touch, light, and sound. Keep the monochrome resting view, the lens as its primary object, and the ability to become completely still. Richer scenes belong behind the lens; controls remain inside requested workspaces.

## What the research supports now

| Technology                     | Evidence and practical decision                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebGPU + WGSL                  | The GPUWeb specification remains active. Use standard `refract`/`reflect` operations and a shared typed material state. Detect adapter availability and limits, handle device loss, and retain WebGL 2 / Canvas. A browser version alone does not guarantee an adapter.                                                                                                                                                                                       |
| Three.js WebGPURenderer / TSL  | The latest release returned by the official releases API during research was **r186**, published **24 September 2026**. Its WebGPURenderer supports WebGPU with WebGL 2 fallback. It becomes useful when FORM has actual 3D sets, geometry, cameras and node materials; adding it solely for one optical surface would add migration cost without solving the current artwork's main limitations. Keep the renderer contract ready for a later scene backend. |
| Decoded-frame video scheduling | `HTMLVideoElement.requestVideoFrameCallback` is widely implemented according to MDN's current compatibility data. It runs for frames submitted to the compositor, rather than simply whenever the display refreshes. Use it to invalidate the shared backdrop, cancel it on replacement, and fall back to time-based invalidation when unavailable. This can reduce redundant uploads; actual savings depend on media and browser behavior.                   |
| Native Web Audio               | Oscillator, gain and analysis nodes provide an evolving local soundscape without a remote model, audio downloads, or a custom audio engine. Start only on explicit user input, smooth the analyzed energy in the shared motion system, and suspend unnecessary work when hidden. AudioWorklet is justified only when custom DSP is actually needed.                                                                                                           |
| WebCodecs, later               | Low-level frame encoding is a good fit for short local art films. It does not provide container muxing. Codec availability, encoder support, queue limits, frame closure, and output muxing must be designed explicitly. PNG export is the reliable first deliverable; recording is not implemented or promised as universally available.                                                                                                                     |

MDN's compatibility snapshot reports WebGPU in Safari 26, Chrome Android 121, Chrome 144 with platform restrictions, and partial Firefox support beginning at 141. These are research observations, **not a hardware compatibility guarantee**. Runtime capability detection remains necessary.

## Implemented in this iteration

- **Convex optical transmission:** Snell-law refraction through an analytical surface, controlled optical depth, and bounded displacement of the actual displayed scene.
- **Material-linked reflection:** Schlick's dielectric approximation changes with refractive index and viewing angle. Surface roughness softens transmitted samples and the specular lobe. Movable light influences highlights and the approximate wake.
- **Three atmospheres:** Fold, a sculptural ring with a cached analytical tube-normal profile, and Veil. Each can combine with Paper, Silver or Graphite. They are authored/generated scene textures, not full 3D geometry.
- **Living light:** an explicit optional slow lighting drift, governed by the shared motion controller and disabled by reduced-motion preferences. The default artwork still settles and stops rendering.
- **Breathing sound:** three quiet sine harmonics with low-frequency gain modulation; audio energy is smoothed by the same authoritative spring system as the object.
- **A keepsake:** save the restored optical scene as a local PNG without the control panel or chrome. Temporary download URLs are revoked.
- **Frame-paced video:** decoded-frame invalidation with callback cancellation on media replacement.
- **Bounded optics passes:** one inexpensive full-frame backdrop pass, then expensive optics only over the object's deformation bounds and light halo. WebGPU and WebGL use the same approach. Raster output is additionally limited to 4096 pixels on either axis.

The renderers continue to use screen-space analytical optics. They do **not** trace rays through arbitrary scene geometry, simulate spectral dispersion, or solve physical multi-bounce caustics. The light halo is an approximation. The canvas fallback uses simpler magnification, blur, and directional rim lighting.

## Larger releases and current status

| Release               | Experience                                                                                                                                                   | Implementation and acceptance gate                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Living Rooms**      | A small sequence of immersive rooms: sculpted glass, folded light, soft veils, and resonant darkness. Transitions feel like moving through one installation. | Author compositions and choreography as data; keep time, motion, light and sound under a single clock. Add pause/replay, touch alternatives and reduced-motion equivalents. No ambient loop unless explicitly enabled.                                                              |
| **Light Instruments** | Touch changes the object's curvature and optical depth. A gesture becomes a brief light composition rather than a menu trick.                                | Introduce authored depth/normal fields and a GPU optical-displacement pass. Prototype with existing renderers first. Adopt Three.js WebGPU/TSL when real geometry, depth-aware occlusion and cameras justify it. Verify real-device performance before increasing scene complexity. |
| **Motion Editions**   | Capture a 5–15 second local film of a personal interaction, optionally with the soundscape.                                                                  | Capability-test MediaRecorder/WebCodecs configurations, choose a valid codec/container pair, bound frame queues and memory, and release VideoFrames. Start with a supported WebM path; do not assume universal AV1 or H.264 encoding. No upload required.                           |
| **Exhibition Mode**   | A focused installation for large screens with accessible exit controls, predictable idle behavior and recovery after interruption.                           | Add user-initiated fullscreen, authored idle/recovery states and real hardware testing. Consider optional XR only after the desktop/touch artwork is coherent; headset support and permissions are a separate project.                                                              |

The first [Living Rooms release](LIVING-ROOMS.md) is now implemented with Limestone, Nocturne and Veil, optional paced playback, pause/replay, manual navigation and reduced-motion behavior. The remaining milestones are proposals, **not implemented features or a fixed delivery estimate**. The near-term priority is Living Rooms, because authored spatial composition and pacing will improve immersion more than adding another rendering API.

## Performance research and validation

Budget: target a 16.7 ms frame on capable hardware, with a usable reduced-quality path and no continuous idle work by default. Both CPU costs and GPU costs matter. `requestAnimationFrame` intervals are end-to-end display scheduling observations, not GPU-only timings.

Validation completed for this iteration: **8 focused tests**, **16 Chromium browser tests**, strict TypeScript and the production build all passed. Separate WebGL and WebGPU export checks produced nonblank 900 × 700 PNGs without page errors. The single-file edition executed with zero external requests in Chromium, and a 390-pixel touch viewport was visually inspected. These browser tests emulate mobile and do not establish physical-device compatibility. `scripts/benchmark.mjs` compares full-frame optical evaluation with the bounded optical pass at an identical 770 × 560 output, with 12 warmup submissions and 40 measured submissions for each mode. It awaits GPU queue completion and reports mean/median/p95. This is a software-Vulkan microbenchmark, **not a claim about physical desktop/mobile frame rate or GPU timestamp duration**. Run with the dev server on port 5173:

```sh
node scripts/benchmark.mjs
```

Before the bounded pass, one richer-shader cloud sample measured about 15 fps; after, one sample measured about 31 fps. Shared CPU load, screenshot readbacks and warmup affect these observations. Use the controlled report in `docs/benchmark-results.json` for the like-for-like comparison. Hardware, battery, thermal, Safari and physical mobile testing remain outstanding.

## Sources checked

1. [GPUWeb specification repository](https://github.com/gpuweb/gpuweb), [observed specification revision](https://github.com/gpuweb/gpuweb/commit/3c1276a4a148a0a3c790112b5a4d37b9f20f0acd), [WGSL refraction](https://www.w3.org/TR/WGSL/#refract-builtin).
2. [MDN browser compatibility snapshot](https://github.com/mdn/browser-compat-data/tree/5da921db97989a173e1d94bd8de48dae268e5738), including [`GPU`](https://github.com/mdn/browser-compat-data/blob/5da921db97989a173e1d94bd8de48dae268e5738/api/GPU.json) and [`HTMLVideoElement`](https://github.com/mdn/browser-compat-data/blob/5da921db97989a173e1d94bd8de48dae268e5738/api/HTMLVideoElement.json).
3. [MDN requestVideoFrameCallback documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).
4. [Three.js r186](https://github.com/mrdoob/three.js/releases/tag/r186) and [official WebGPURenderer documentation](https://github.com/mrdoob/three.js/blob/r186/docs/pages/WebGPURenderer.html).
5. [MDN WebCodecs overview](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), including processing queues, codec support, and container limitations.

That art-environment iteration added no paid services, remote assets, application runtime dependencies, generative-model endpoints, camera access, or microphone access. The subsequent [room prototype](ROOM-PROTOTYPE.md) adds Three.js r186 for actual geometry, depth-buffered rendering and TSL materials.
