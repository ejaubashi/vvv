# Captured-reality experiment: Pantheon

FORM now has a fourth, explicitly selected space: **Pantheon**. Open
`?room=1&space=pantheon&renderer=webgl` and choose **Enter the lens**. It can also
be selected through Studio → Media, or Previous from Limestone. The automatic
14-second exhibition remains Limestone → Nocturne → Veil; it does not download
this experiment.

## The capture

**The Pantheon Interior**, by **artfletch**:
<https://superspl.at/scene/dac6e508>, CC BY 4.0
(<https://creativecommons.org/licenses/by/4.0/>).

The SOG comes from Oculo's redistribution at revision
`2543e2388671f6d5252acd60357abcb5a5ec0895`, path
`apps/mobile/public/scenes/pantheon/`. Its asset-specific attribution and provenance
are retained in `public/captures/pantheon/`. The downloaded file is byte-identical
to that mirror: **10,577,976 bytes**, SHA-256
`bb8c454d78197ae9077215b9e1386af5d3cf8d922c3f983beb33817a9b846185`.
The upstream credits specify reduction from 3,999,998 to **700,000 splats**, degree-1
spherical harmonics, NaN removal and SOG re-encoding. FORM makes no further changes
to these bytes; it applies the viewer orientation and constrained camera at runtime.

This is a **hybrid reconstruction**, rather than an unmodified survey. The source's
floor is described as reconstructed in the linked acquisition research. The scene
contains the capture's soft/motion-blurred visitors; it is not an empty, cleaned
architectural model. Visible source/license links and the hybrid description appear
in the room and Media panel.

Acquisition evidence: the creator page and CloudFront download were blocked from
this environment. The license evidence used here is the mirror's **asset-specific**
`UPSTREAM-ATTRIBUTION.txt`, not the application's code license. The independently
accessible acquisition report also lists the creator, CC BY 4.0 and reconstructed
floor: <https://github.com/ryanjosephkamp/splashery/blob/main/docs/research/real-places-2026-10.md>.
The botanical conservatory was considered first; its attribution and thumbnail were
available, but the mirror did not contain its scene file. No conservatory thumbnail
is presented as a working room.

## Mesh versus splats

| Approach | Strength | Cost / limitation in FORM |
| --- | --- | --- |
| Textured scanned mesh / glTF | Ordinary depth buffer, useful collision geometry, direct fit with the current WebGPURenderer; can support new light if materials are de-lit | A suitable architectural scan with redistribution rights was not acquired. Photo textures often bake shadows and cannot be convincingly relit as-is. Download depends on mesh/texture budgets. |
| Gaussian splats / SOG — selected | Captured material variation, real spatial parallax and view-dependent appearance, no hand-modeled replacement | Captured lighting, alpha sorting, incomplete unseen surfaces; this asset costs 10.6 MB plus its renderer. No free walking, physical collision, accurate glass refraction or new dynamic shadows. |
| Panoramic photograph | Lightweight renderer; excellent captured surface appearance | No translational parallax or geometric occlusion. Not used for this experiment. |

The capture uses **Spark 2.4.0** (MIT, <https://github.com/sparkjsdev/spark>) with
Three r186's **WebGLRenderer**. Spark's documented integration takes a WebGLRenderer;
it is not plugged into the app's WebGPURenderer. The authored rooms retain their
WebGPU/WebGL implementation. The capture adapter copies a rendered frame into the
same origin-clean 2D portal canvas, so both optical compositors and PNG export use
the existing path. There is no viewer iframe or third-party runtime asset host.

## Loading and lifecycle

- Spark and the capture adapter are dynamically imported only on selection. The
  SOG is fetched from the deployment itself, with byte limit and SHA-256 verification.
  Progress distinguishes downloading from decoding/preparing the scene.
- A pending capture leaves the current authored room visible. A failed request or
  integrity check keeps that room usable and exposes **Retry capture**. A direct
  failed capture entry opens Limestone and reports the failure.
- A newer room request aborts the download. If decoder work has already begun,
  its result is disposed when it settles; no stale capture is adopted. Disposal
  also aborts pending fetches. Sorting resources, textures, renderer and context are
  released when leaving the capture; the decoded room is not retained as a second
  resident scene. Spark's module/decoder infrastructure remains cached by the module.
- Spark's `onDirty` wakes the existing application clock when asynchronous sorting
  completes. There is no second animation loop. Once the view and sorting settle,
  capture frames stop. Ambient light animation does not relight this capture.
- Translation is limited to a small region around the published camera. Touch drag
  and arrow keys look around; reduced motion keeps deliberate navigation available.
  There is no first-person walking or implied coverage behind uncaptured surfaces.
- Renderer/context failure is labeled **Capture unavailable** and offers another
  room or retry; a procedural illustration is never labeled captured reality.

## Delivery and budget

`npm run build` produces a normal relative-path static site. Publish **all of `dist/`**,
including `assets/` and `captures/`; deploying only `index.html` will not work.
The capture is about 10.1 MiB, separate from the ordinary application download.
The current build reports the optional capture chunk at about **2.68 MB minified /
0.94 MB gzip**, including Spark's embedded workers/WASM. Initial entry/shared JS
are about **1.37 MB minified / 0.37 MB gzip** combined, versus roughly 0.99 MB /
0.28 MB before the adapter. The standard build does not fetch the capture chunk
or SOG until selected. These are transfer sizes, not decoded or GPU memory figures.

`node scripts/export-standalone.mjs /tmp/FORM-capture.html` also preserves the portable
file workflow. That optional file embeds the capture and bundles the lazy code, so
it is intentionally much larger and has a higher initial loading cost than the
normal deployment. PNG export remains a snapshot of the current optical view.

## Validation

Run `npm test`, `npm run test:browser`, and `npm run build`. Capture tests cover exact
asset provenance, exclusion from automatic playback, real splat loading, download
failure/retry, cancellation by a newer selection, integrity rejection, camera input,
PNG export and returning to authored rooms. Browser checks use Chromium/SwiftShader;
physical mobile GPU performance and Safari/Firefox remain unmeasured. Do not treat
software-GPU timings as a hardware frame-rate claim.

The format/renderer decision also uses Spark's documented WebGL integration and
SOG support (<https://github.com/sparkjsdev/spark/blob/main/README.md> and
<https://github.com/sparkjsdev/spark/blob/main/examples/sogs/index.html>), and
SuperSplat's editing/optimization workflow
(<https://github.com/playcanvas/supersplat>). These are implementation references,
not additional asset licenses. The underlying representation is described in
*3D Gaussian Splatting for Real-Time Radiance Field Rendering*
(<https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/>).

Validation record (2026-10-21): production build and all 19 unit tests passed.
The complete browser run passed 42 cases; the mobile capture case exceeded a
5-second software-GPU frame wait. With that wait aligned to the slow graphics
backend (30 seconds), its focused rerun passed, including touch, rotation and
return. All 43 browser cases have therefore passed against the final application
source. This does not establish interactive performance on physical devices.

For release-file checks, build, export the portable file, then run
`node scripts/check-capture-deployment.mjs /tmp/FORM-capture.html`. It serves the
normal bundle at a nested revision/preview path, checks capture entry and return,
and opens the portable copy while rejecting external application asset requests.

Release-file checks passed: the normal nested-path deployment rendered the capture,
entered and returned correctly. The **18,193,162-byte** portable edition loaded and
rendered the capture with **zero external asset requests**, zero external hosts and
zero browser errors. `docs/previews/capture-desktop.png` shows the production build.
