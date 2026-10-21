# A room inside the lens

An architectural prototype built on Three.js **r186**, WebGPURenderer, and TSL node materials. It extends the immersive-art branch; the other environments remain available.

## Try it

Start with `npm run dev -- --port 5173`. Add `?room=1` to enter the room immediately, or choose **Media → Room**. Pointer movement changes the camera viewpoint. In **Material → Inspect the lens**, dragging or using arrow keys moves the lens and changes the view; this also provides touch and keyboard exploration. **Media → Look around** disables automatic pointer parallax. System and application reduced motion stop automatic camera movement.

The prototype is a quiet gallery: four extruded arches at different depths, a near column, a floor, side walls, ceiling, plinth and a sphere at the back. Camera movement reveals the relationships between these objects. The outer page stays minimal and the room is visible only inside the glass. Choosing another environment, or successfully loading visual media, exits room mode.

## What is real 3D

- Twelve actual meshes are projected by a perspective camera. Materials use depth testing, so near geometry occludes farther geometry.
- The arches are extruded concave shapes with curved openings and small bevels; the four instances share geometry.
- TSL node materials provide world-height shading, roughness and a material-lit sculpture. WebGPURenderer targets WebGPU when available, with WebGL 2 fallback.
- A directional light casts a 512 × 512 shadow map, with hemispheric fill and distance fog. Static geometry/light means the shadow map can be reused as the camera moves.
- The room camera follows the existing authoritative spring state; there is no second animation loop.

The room is rasterized with a depth buffer. The lens still uses the existing analytical screen-space optical model to sample the room image. It does **not** trace refracted rays through the room geometry, sample the room's depth texture for refraction, or simulate physical multi-bounce lighting. Those are possible later upgrades; the current feature demonstrates actual geometry, perspective parallax and occlusion.

## Rendering and lifecycle

`src/room/architecture.ts` builds and disposes the geometry/material graph. `pose.ts` derives a bounded camera from input and lens state. `room.ts` initializes graphics only when the room is requested, renders on pose/resolution changes, and retains the last room frame. The optical backends receive that frame through the shared `PortalFrame` contract.

The room is rendered to its own bounded square canvas, then copied into a persistent canvas frame. This preserves the image while its GPU drawing buffer is cleared, including when the optical renderer itself is using Canvas 2D. Both optical GPU shaders sample the room only within the lens surface. Workspaces retain the lens-to-panel transition and readable controls.

The room frame is 384–640 pixels per axis, selected from lens size, device ratio and adaptive quality. The room stops drawing once its camera settles, pauses with the application's hidden-tab handling, and caches the geometry when switching to another environment. Geometry, shared materials, shadow resources and the renderer are released on disposal, including cancellation during initialization. Graphics loss or failed initialization retains a clearly identified **architectural illustration**, not a claim of 3D rendering.

Diagnostics in **Details** identify the room backend, twelve meshes, resolution and the latest **CPU submission/copy** duration. This is not a GPU timestamp or an end-to-end frame-rate certification.

## Validation

- Unit tests verify finite geometry, camera bounds and an actual ray-geometry occlusion case: the near column blocks the back sculpture from one viewpoint and reveals it from another.
- A browser pixel test also verifies actual rasterized occlusion: hiding the near column changes the pixel at the projected center of the back sculpture.
- Browser tests verify WebGL and WebGPU room rendering, changing views, unchanged pixels outside the portal, settled rendering, environment switching, mobile inspection, reduced motion, initialization cancellation and fallback behavior.
- The full existing studio suite remains part of the regression run.

Run `npm test` (11 focused tests), `npm run test:browser` (25 browser tests), and `npm run build` from the repository root. Browser tests use system Chromium and software graphics; physical-device performance and Safari/Firefox rendering remain unverified.

## Delivery tradeoff

Three.js is a new, concrete runtime dependency for geometry, camera/depth rendering, lights and cross-backend node materials. The prototype currently ships one JavaScript bundle of approximately **972 KB minified / 272 KB gzip**, compared with the earlier small optical-only bundle. Graphics initialization is on demand, but the library bytes are included in the initial bundle. This keeps the single-file CDN preview self-contained. A later production pass should split the room engine for normal hosting while retaining a separate bundled single-file export.

## Reproducible room benchmark

With the development server on port 5173, run `node scripts/benchmark-room.mjs`. It measures 30 camera changes after 8 warmup renders per backend at 384 × 384, with the same twelve meshes. The measured duration includes the room draw, copy into the persistent room canvas, and explicit GPU completion. It excludes the final optical composition, UI, JavaScript download and display scheduling. Results in `room-benchmark-results.json` describe a single shared-cloud software-graphics run, not physical-device frame rates.

That run recorded means of **0.71 ms for WebGL 2** and **47.17 ms for WebGPU**, with p95 values of 3.1 ms and 60 ms respectively. Initialization took 212 ms and 164 ms after the JavaScript was already loaded. The large difference describes these software backends and their synchronization paths; it does not establish that either API is faster on a physical GPU. Full optical composition adds work beyond this measurement.
