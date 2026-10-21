# Enter the lens

An explicit **Enter the lens** button opens the small optical window into a large framed architectural view. The same bounded spring drives the glass bounds, a gentle camera approach and the changing optical surface. All three Living Rooms remain available inside the expanded view.

## Use

- Activate **Enter the lens**, including from the ordinary entry URL. Room graphics initialize on demand. The new view starts only after that request finishes; returning during initialization cancels the intent to enter.
- Move the pointer, drag the room view, or focus the room region and use the arrow keys to look around. Intentional dragging and keyboard exploration remain available with reduced motion.
- Use **Return to lens**, or Escape, to restore the resting lens's position, responsive size, inspection state and previous backdrop/room mode. If the visitor entered from a room, the currently selected room remains in the lens.
- **Studio** exposes the existing Media, Material, Interaction and Details controls. Escape closes a workspace first, then the studio dock if open, then returns to the lens. Panel focus returns to the visible Studio button; exiting restores focus to Enter the lens.
- Room arrows and the opt-in journey remain available. Entering and returning pause sequence playback. Playback can be started again after entry settles.
- Choosing an art environment or successfully loading personal media from Studio exits the expanded view and room mode. PNG export captures the current view without the controls, including the expanded view when entered.
- Reduced motion replaces entry and return animation with immediate state changes. The room is framed within the browser viewport; the feature does not request operating-system fullscreen.

## Rendering

`src/room/visit.ts` computes the frame bounds and rectangular render dimensions, and owns direct exploration input listeners. Its inputs set the existing view-spring targets; no second animation loop is created. `Motion.immersion` is part of the authoritative spring collection. `roomPose()` applies a bounded 1.15-unit camera approach at full entry.

The optical shaders soften their convex slope toward a flatter surface as the frame opens. Room-specific low-frost sampling is further reduced while entered. Room images use a cover mapping based on their actual dimensions in WebGL, WebGPU and Canvas. Three.js cameras use the render frame's actual aspect ratio, including after replacing a room without resizing the frame. This preserves perspective rather than stretching a square image across the viewport.

The room render adopts the viewport aspect during the transition; the shrinking/growing glass reveals a cropped portion of that view. This avoids continuously reallocating its backing texture for every intermediate frame aspect. Camera motion is still rendered in actual 3D. Motion uses a bounded 768-pixel long edge; when settled, the requested resolution follows viewport size, bounded device ratio and adaptive quality, capped at 1536 pixels on the long edge. The resting lens keeps its previous 512–1024-pixel budget. The optical output retains its existing overall raster and device bounds.

The WebGPU compositor now tracks both portal texture dimensions and rebuilds its bind group when either changes. Geometry and scene resources still belong to the one existing room renderer. Room changes reuse that renderer and retain their cached-image transitions. Graphics failure keeps a clearly labeled architectural illustration with entry, manual navigation and an exit.

## Interaction and lifecycle

The expanded experience is separate from workspace-modal state. Opening a workspace overlays its controls without shrinking the architectural frame. During entry/return, lens gestures and room navigation are inert. Hidden background header controls are inert while visiting, avoiding invisible keyboard targets. The visible Return control remains available during initialization and transitions. A request token prevents late initialization from reopening a cancelled visit.

Entry preserves the prior lens/inspection context; viewport rotation still applies the existing responsive bounds. New direct-input listeners use an AbortController and are disposed on page hide. Hidden-tab behavior, room disposal and the existing on-demand frame scheduler remain in use. Settled views stop requesting frames unless optional light, sound, playback or sequence progression requires them.

## Validation and limits

- **17 focused tests** cover the original optics/motion/geometry/journey behavior plus frame endpoints, portrait/landscape render allocation, entry reversal, reduced motion and camera bounds.
- **39 browser tests** include original regressions and entry from both ordinary and room URLs, in-flight cancellation, late initialization, restoration/focus, Studio panels, real touch dragging, keyboard input, mobile rotation, room changes and illustrated fallback.
- The WebGPU case enters and returns from the expanded view, changes viewport height and checks for graphics/page errors. A separate camera test verifies rectangular aspect before and after a room replacement and confirms settled rendering stops.
- Strict TypeScript and the production build are checked. The standalone delivery is also inspected at desktop/mobile sizes and exercised for PNG export with no external asset requests.

The room remains perspective-rasterized geometry through analytical screen-space glass. It does not implement free-flight navigation, ray-traced refraction or a physical walk-through connection between separate rooms. The larger view costs more pixels than the small portal; the earlier software WebGPU limitations remain relevant. Physical-device performance, Safari/Firefox and thermal behavior remain unverified. No hardware frame-rate guarantee is made.

The bundle is approximately **992 KB minified / 279 KB gzip**, including Three.js, with no added dependencies or remote assets. Code splitting for conventional hosting remains future work; the single-file preview embeds its application code and styles.

Preview captures: [desktop](previews/enter-desktop.png), [Nocturne](previews/enter-nocturne.png), [mobile](previews/enter-mobile.png), and [landscape](previews/enter-landscape.png). The tested standalone export produced a nonblank 1440 × 1000 PNG and made no external application asset requests.
