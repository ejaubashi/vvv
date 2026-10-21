# Living Rooms

Three authored spaces behind one lens. Open `?room=1&renderer=webgl`, use the arrows below the lens, or choose **Media → Room** and select an edition. Add `&space=nocturne` or `&space=veil` to open a particular room. Manual room choices update the current URL without adding browser-history entries.

| Room      | Architecture and atmosphere                                                             | Meshes |
| --------- | --------------------------------------------------------------------------------------- | ------ |
| Limestone | Beveled stone arcade, warm directional light and a distant metal sphere                 | 12     |
| Nocturne  | Dark chamber, two suspended reflective rings and narrow light seams                     | 12     |
| Veil      | Four suspended cloth panels with actual modeled folds, ceiling rails and pale sculpture | 14     |

These are different 3D sets, with perspective, depth occlusion and shadows. The fabric is sculpted geometry, not a cloth simulation. The light seams are visible luminous materials; illumination comes from the authored light rig rather than a physical emissive-light solver. The existing optical glass and floor-reflection approximations still apply.

## Explore or play

- **Previous room / Next room:** explore freely, with an approximately 0.85-second image crossfade. A manual choice pauses sequence playback. Touch and keyboard activation are supported.
- **Play rooms:** opt into a finite sequence starting from the selected room. Each room rests for 14 seconds before proceeding. Loading and room transitions do not consume that dwell time. Playback stops after Veil rather than looping forever.
- **Pause rooms:** stops progression. An in-flight visual transition can finish. Resume continues the remaining dwell time.
- **Replay rooms**, or **Media → Start again:** starts a new sequence at Limestone.
- **Interaction → Living light:** optionally drifts the room's directional light as well as the glass highlight. This is independent of room-sequence playback and is off by default.
- **Reduced motion:** pauses the sequence, disables automatic playback, and replaces room crossfades with immediate changes. Manual room selection and lens inspection remain available.

Opening a workspace pauses sequence time. Hidden tabs pause the application clock and rendering. Choosing an art environment or successfully loading personal media exits room mode and pauses playback. No room motion, sound or automatic progression starts by default; sound still requires the existing explicit sound action.

## Rendering and ownership

`src/room/catalog.ts` holds the typed edition definitions and finite journey state. The studio's existing animation clock supplies bounded time to both the journey and room transition; no additional animation loop or background timer is introduced. The existing shared view springs continue to govern camera movement.

`architecture.ts` builds each geometry graph; `materials.ts` authors its surfaces and environment lighting. `PortalRoom.select()` keeps the same Three.js renderer across editions and compiles at most one replacement at a time. Rapid choices supersede an older pending selection. The old image remains visible while the next graph compiles. On adoption, the previous geometry/material/texture/reflector resources are disposed, while a bounded canvas snapshot supports the crossfade. A superseded or cancelled candidate is disposed without becoming visible. At most one active and one compiling geometry graph are owned at once.

During a transition, the cached new room image and old snapshot are blended. A blend-only change does not rerender geometry. The room frame remains bounded to 512–1024 pixels; the floor reflection uses half that resolution. The last image is reused when the camera and optional light stop moving. Graphics failure retains clearly labeled architectural illustrations of all three editions and manual navigation.

## Validation and limits

The focused suite has **14 tests** covering geometry, shared-resource disposal, camera bounds and the finite journey's pause/resume/replay/end behavior. The browser suite has **32 tests**, including all earlier optical-studio regressions, actual room-image changes, latest-selection behavior, paced progression, mobile/reduced motion, replacement cancellation, fallback navigation and all three editions through WebGPU.

Production TypeScript and Vite build checks are included. Desktop and emulated mobile are tested with Chromium software graphics. Physical devices, Safari/Firefox and hardware GPU performance remain unverified. The refined default room's software WebGPU benchmark in [ROOM-PROTOTYPE.md](ROOM-PROTOTYPE.md) is a known performance limitation; it does not certify the other rooms or a hardware frame budget. The supplied preview uses WebGL for responsiveness. The application still supports its normal WebGPU-first selection.

The bundle is approximately 986 KB minified / 277 KB gzip, including Three.js. All procedural assets are created locally; no texture, audio, model or API downloads are needed. Code splitting for conventional production hosting remains future work; the published single-file preview intentionally embeds the complete application.

## Preview captures

The self-contained preview is checked at desktop and mobile sizes, including a 667-pixel landscape viewport and PNG export. Captures: [Limestone](previews/living-gallery.png), [Nocturne](previews/living-nocturne.png), [Veil](previews/living-veil.png), [room chooser](previews/living-chooser.png), and [mobile](previews/living-mobile.png).
