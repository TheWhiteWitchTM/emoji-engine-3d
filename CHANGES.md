# Changes

emoji-engine-3d is alpha, at package version 0.1.0. Entries here describe behavior a caller can observe. Until a release candidate, a later version may change any of this again. See the status note in [README.md](README.md).

## 0.1.0

First release. This package is the WebGL supplement to [emoji-engine-2d](https://github.com/TheWhiteWitchTM/emoji-engine-2d). It does not depend on that package. Load both script builds on one page when a game wants both: the 2D global is `EmojiEngine`, and this one is `EmojiEngine3D`. Each engine draws on its own canvas.

The four pieces, the build, and the chrome class names match the 2D package. `npm run build` writes `dist/` and `browser/emoji-engine-3d.js` plus `browser/emoji-engine-3d.min.js`. Node 20 or newer. No runtime dependencies.

### World

Axes are y-up and right-handed. Yaw 0 looks down world −z. Positive yaw turns counter-clockwise from above. `Canvas.forward` and `Canvas.right` are the direction helpers. `right(yaw)` is the horizontal right of that yaw.

`sprite` is `(emoji, x, y, z, size = 1, layer = 'default')`. `size` is world units, the height of the billboard. It is not the 2D engine's 32 pixels. `z` is required. `radius` is always `size / 2`. Velocity is world units per `update`, with no delta-time scale.

A box is centered on `(x, y, z)`. `w`, `h`, and `d` are full edge lengths and default to 1. The yaw in the shader is the yaw in the collision test: local `(x, y, z)` becomes `(cos·x + sin·z, y, −sin·x + cos·z)`.

### Canvas

WebGL2 is required. The constructor throws `WebGL2 is unavailable`. The context is opaque, depth on, stencil off, antialias on unless `antialias: false`, and `powerPreference: 'high-performance'`. The CSS size defaults to 800×600. `pixelRatio` defaults to 1 and scales the drawing buffer. The clear color defaults to `#1c2430`.

The eye starts at `(0, 2, 6)`. The vertical field of view defaults to 60°, near to 0.05, and far to 300. Pitch is clamped to ±1.5 radians when `setCamera` or `follow` writes it, and again while a frame is built. A bad field of view, near, or far is replaced for that frame only and the stored numbers stay put.

`follow(target)` wins over `setCamera` on `draw`, `project`, and `drawEmoji` until `follow(null)`. The eye is `followDistance` (default 6) behind the target's horizontal forward and `followHeight` (default 2.5) above it.

Paint order is boxes per layer, then custom drawables in that layer, then every emoji far to near, then every terminal glass. The glass is an overlay. Its layer does not tuck it behind the world. Emoji depth-test and do not write depth. Alpha below 0.2 is discarded. Boxes use one instanced draw per layer. Each atlas page uses one instanced draw. The glass uses one quad and reuploads only when the cells or the caret change.

### Terminal

The cell glass is a subset. Newline mode is always on. `write` wraps, scrolls, and understands BS, HT, LF, VT, FF, CR, index (`ESC D`), next line (`ESC E`), reverse index (`ESC M`), reset (`ESC c`), CUP (`H` and `f`), CUU, CUD, CUF, CUB, CHA (`G`), and SGR 0, 1, 22, 30–37, 39, 40–47, 49, 90–97, and 100–107. OSC is discarded through BEL or through ESC and the next character. A private CSI is ignored. An unknown CSI is consumed and ignored. `ESC c` clears the cells and the pen and leaves the paper and the caret settings alone.

Indexes 0–15 are the classic ANSI palette. There is no C64 palette, no 256-color cube, no direct color, no device report, no border API, and no blink timer. The caret is steady. `color` changes the pen and does not redraw. `setCursorStyle` stores the shape; the next `draw` reads it.

`examples/demo.js` checks this subset. The browser page checks that a red cell (index 1, `#aa0000`) lands at the top-left of the glass.

### Engine

`onCollision` reports sprite pairs and a sprite touching a sensor box. A solid box pushes the sprite out and does not call the handler. Box-versus-box pairs are skipped. A push within 1e-4 of the surface is left alone. A sprite buried in the middle leaves through the nearest face, preferring local +x when the distances tie. Velocity is not cancelled.

Handler registration matches emoji-engine-2d. Unsubscribe removes one registration. A handler added during `update` waits. Two registrations of one function are removed separately. `update` throws `Engine.update cannot be called from a collision handler` when a handler calls it. A non-finite position is skipped. `alive === false` skips motion, collision, and paint, and the body stays in the list.

`start` throws when `requestAnimationFrame` is missing. A second `start` does nothing. `stop` during `update` still draws that frame. A throw from `update` or `draw` stops the loop. `beep` swallows a missing or rejected audio context. `isKeyDown` is false when there is no `window`.

### Utilities

`wrap` builds the same column as emoji-engine-2d: header, target, footer. Class names are `ee-wrap`, `ee-header`, `ee-title`, `ee-middle`, `ee-fullscreen`, and `ee-footer`. The button reads `F11 Fullscreen` until the document is fullscreen, then `Esc Exit`. It checks at creation. `header: false` or `footer: false` returns null for that bar.

## Unreleased

No changes since 0.1.0.
