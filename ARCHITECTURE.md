# Architecture

emoji-engine-3d is four pieces. Each one owns a single job. Application code is the only thing that may compose all four. The shape matches [emoji-engine-2d](https://github.com/TheWhiteWitchTM/emoji-engine-2d). This package draws with WebGL2. It does not import the 2D package, and a single canvas cannot be both a 2D context and a WebGL context.

```text
application
  ├─ Utilities.wrap(canvas | engine | terminal | element)
  ├─ Engine  ── uses ──▶ Canvas
  └─ Terminal ─ uses ─▶ Canvas
```

| Piece | Owns | Leaves alone |
| --- | --- | --- |
| Canvas | The `HTMLCanvasElement`, the WebGL2 context, named layers, the camera, the emoji atlas | Sprites, input, audio, header, footer |
| Terminal | The cell buffer and the screen-space glass | Motion, collision, chrome |
| Engine | Sprites, boxes, velocity, sphere tests, the frame loop, keys, beep | Creating a header or footer |
| Utilities | The optional title bar and footer | Drawing and game rules |

Canvas, Terminal, and Engine do not import Utilities. Utilities does not import them. It accepts a target by shape: an element, an object with `element` (a Canvas), or an object with `canvas.element` (an Engine or a Terminal).

## World

The world is y-up and right-handed. One formula builds every direction.

`Canvas.forward(yaw, pitch)` is the look direction. `forward(0, 0)` is `(0, 0, −1)`. `forward(π/2, 0)` is `(−1, 0, 0)`. Positive yaw turns counter-clockwise seen from above. Positive pitch looks up.

`Canvas.right(yaw)` is the horizontal right, `forward(yaw, 0) × (0, 1, 0)`. `right(0)` is `(1, 0, 0)`. `right(π/2)` is `(0, 0, −1)`.

A box uses that same yaw in the shader and in the collision test. Local `(x, y, z)` becomes `(cos·x + sin·z, y, −sin·x + cos·z)`. Yaw `π/2` sends local +x to world −z and local +z to world +x.

Emoji billboards stand upright. They use the horizontal right and world up, so pitching the camera does not tip the glyphs.

## Canvas

`src/canvas.ts` creates the bitmap and a WebGL2 context and does not insert them into the document. The context is `alpha: false`, depth on, stencil off, `powerPreference: 'high-performance'`. Antialiasing defaults to on. The constructor throws `WebGL2 is unavailable` when the host has no such context.

The CSS size defaults to 800×600. The drawing buffer is that size times `pixelRatio`, which defaults to 1. `resize` updates both.

Drawables register on named layers. A layer is created the first time something is added to it. Layers are visited in that first-seen order, and an emptied layer keeps its place. Adding a drawable that is already attached moves it to the end of the destination layer.

Inside a frame the paint is three passes:

1. For each layer, one instanced draw covers the living boxes, then custom drawables run in insertion order.
2. Every living emoji, from every layer, is sorted far to near and drawn per atlas page. Depth test stays on. Depth write is off. Fragments with alpha below 0.2 are discarded.
3. Every terminal glass is drawn after the world, depth off, as a screen-space overlay. The layer name does not put the HUD behind the scene. That is the difference from emoji-engine-2d, where the terminal is just another layer.

`draw` applies `follow`, clears color and depth, then runs those passes. `clear` wipes the buffers and leaves the layer lists alone. The clear color defaults to `#1c2430`.

The camera eye starts at `(0, 2, 6)`, yaw 0, pitch 0, a 60° vertical field of view, near 0.05, far 300. `setCamera` stores the eye and, when passed, the yaw and pitch. `follow(target)` wins on `draw`, `project`, and `drawEmoji` until `follow(null)`. The eye sits `followDistance` (default 6) behind the target's horizontal forward and `followHeight` (default 2.5) above the target. The stored yaw and pitch then look at the target. Pitch is clamped to about ±86° (`±1.5` radians) when it is written and when a frame is built. A field of view, near, or far that cannot make a projection is replaced for that frame only. The fields themselves stay as assigned.

`project` returns normalized device coordinates, `x` to the right and `y` up, plus `behind` when the point is on the camera's back side. `drawEmoji` paints one billboard immediately. It is not retained.

Boxes are a unit cube of half-extent 0.5, 24 vertices, faces wound counter-clockwise from the outside. The module throws at load if a face would face inward. The instance is origin, full size, color, and yaw. A Lambert term from `normalize(0.35, 0.85, 0.40)` shades the face. `#rrggbb` and `#rgb` are accepted. Any other string draws as light gray.

Emoji are stamped once into a 1024² atlas of 64² cells. A full page holds 256 glyphs, and the next glyph opens another page. The upload flips Y and does not premultiply. Each page is one instanced draw.

## Terminal

`src/terminal.ts` is a cell buffer and a glass overlay. It always has a `canvas`. Pass one in to share a surface with the engine, or omit it and the terminal creates a canvas sized to the grid.

The everyday sequences match emoji-engine-2d. Newline mode is on: `\n`, vertical tab, and form feed return to column 0 and move down. The cursor wraps at the last column and scrolls at the bottom. `write` and `put` understand backspace, tab, carriage return, `ESC D` (index, no return), `ESC E` (next line), `ESC M` (reverse index), `ESC c` (reset the pen and the cells), CUP, CUU, CUD, CUF, CUB, CHA, and SGR for bold, bright, and the 16 ANSI colors. OSC strings and private CSI sequences are consumed and ignored. The rest of ECMA-48 — 256-color and direct color, the C64 palette, device reports, the border, blink, and VT100 line drawing — stays in emoji-engine-2d.

`set` stores its string as one cell and does not parse controls. A printable code point occupies one cell. `get` returns a copy.

Cells remember a color index from 0 to 15, the bright flag, and bold. Indexes 0–15 are the classic ANSI palette, brown included, so index 7 is gray. `bright` shifts foreground indexes 0–7 to 8–15. SGR 1 sets that flag and a separate bold face. SGR 22 clears both. A missing cell background stays transparent, so the world shows through empty cells, unless `background` has painted a paper color behind them.

The grid is painted in screen space, at the top-left of the viewport. `draw` ignores the camera. Following a sprite does not scroll the text off the bitmap.

The glass keeps its own 2D bitmap and uploads it when the cells or the caret change. The caret is on by default, steady, and read on the next draw. `onKey` and `isKeyDown` listen on `window` when it exists. They keep their own key set.

After a mutation the terminal asks its canvas to `draw`, which repaints the whole surface. `beginFrame` / `endFrame` hold those redraws. The calls nest, and the outermost `endFrame` paints once if anything changed. `color` changes the pen and does not itself redraw.

## Engine

`src/engine.ts` is the game systems layer. The constructor uses the canvas you pass, or creates one. It never builds chrome.

`sprite(emoji, x, y, z, size, layer)` builds a sprite, stores it, and adds it to that canvas layer. Any layer name is valid. The default layer is `default`. `size` is the world height of the billboard and defaults to 1. The glyph faces the camera. `yaw` is the heading the game and `follow` read. It starts at 0, which faces world −z.

`box(x, y, z, w, h, d, color, layer)` builds a box centered on that point. The edges default to 1 and the color to `#c8c8d0`. `sensor` defaults to false. A solid box pushes living sprites out and does not report a collision. A sensor reports the overlap and does not push. There is no box-versus-box test.

`motion` writes `vx`, `vy`, and `vz` in world units per `update`. The frame loop does not scale by delta time, which keeps the demo and a headless check on the same numbers.

`update` moves every living body, pushes sprites out of solid boxes, then tests pairs. Two living sprites collide when the distance between centers is within `radius + radius`. `radius` is always `size / 2`. A sprite touches a sensor box when the sphere meets the oriented box. The layer is ignored. Positions and the sizes must be finite; otherwise that pair is not a hit. The test uses the positions after the move and the push, so a sprite that jumps completely past another in one update is not a hit. There is no sweep.

Each overlapping pair is collected once, with the body created earlier as `a`. Handlers then run for that fixed list. Moving or killing a body inside a handler does not add or drop pairs until the next update. The same pair is reported again on the next update while the shapes still overlap. `onCollision` returns a function that removes that registration. A handler removed before its turn does not run. A handler added during the update waits until the next update. Calling the returned function again does nothing. Two registrations of one function are removed separately. `update` throws if a handler calls it. A body with `alive === false` does not move, collide, or paint. It stays in the list so the game can revive it.

A push leaves a sprite that is already at rest within `1e-4`. Deeper contact slides out along the shortest way to the surface. A center that is buried picks the nearest face, and a tie prefers +x, then −x, then +y, then −y, then +z, then −z, in the box's local frame. Velocity is left as it was.

`start` schedules `requestAnimationFrame`. Each frame calls `update` and then `canvas.draw`. `stop` cancels the next frame. `start` does nothing if the loop is already running. If `update` or `canvas.draw` throws, the loop stops, and a later `start` runs again.

`isKeyDown` tracks `KeyboardEvent.key` on `window` when that exists. `beep(freq, duration)` plays a short square wave through the Web Audio API. With no `AudioContext`, or if playback is rejected, it returns without throwing.

## Utilities

`src/utilities.ts` exports one object, `Utilities`, with one method, `wrap(target, options)`. Call it from application code. The markup matches emoji-engine-2d, so one stylesheet covers both.

`wrap` returns `{ wrap, headerMiddle, footer, setTitle }`.

- `wrap` is a column.
- The header, when present, is a `header` element: title on the left, `headerMiddle` in the center, fullscreen button on the right.
- `footer` is a plain `div` under the target. The caller fills it.
- `setTitle` replaces the title text.

`header` and `footer` in the options both default to on. Set either to `false` and the matching node comes back `null`. `setTitle` is a no-op when the header was omitted. The fullscreen button requests fullscreen on the wrap column, or leaves fullscreen when the document is already there. A rejected fullscreen request is ignored. Its label is `F11 Fullscreen`, or `Esc Exit` while `document.fullscreenElement` is set, including when that element is not the wrap and including when fullscreen was already active at the moment `wrap` ran. A `fullscreenchange` event updates the label. The button does not listen for the F11 key.

`append` moves the target element into the column between the bars. `document.body.appendChild(ui.wrap)` is the call that puts the whole stack on the page.

## Source map

```text
src/canvas.ts       Canvas, camera, layers, atlas, boxes
src/terminal.ts     Terminal, Cell, glass overlay
src/engine.ts       Engine, Sprite, Box
src/utilities.ts    Utilities, wrap result
src/index.ts        public re-exports
dist/               plain JavaScript modules and declarations
browser/            script-tag bundle and its minified build
examples/demo.js    runnable scene and the math checks
examples/play.html  the same scene in a browser, plus a pixel check
examples/dom-shim.js
```

`package.json` is `"type": "module"`. `tsconfig.json` targets ES2022 and includes the DOM library. `npm run build` compiles `src/` to JavaScript and declarations in `dist/`, then bundles `browser/emoji-engine-3d.js` for a script tag and writes the minified `browser/emoji-engine-3d.min.js`. `npm install` runs that build. `npm run demo` runs `examples/demo.js` with Node against `dist/`. Using the engine does not require a TypeScript loader. There are no runtime dependencies.

Import `emoji-engine-3d` or `./dist/index.js` from an ES module. A classic page loads `browser/emoji-engine-3d.js` or `browser/emoji-engine-3d.min.js` and reads `EmojiEngine3D.Canvas`, `EmojiEngine3D.Terminal`, `EmojiEngine3D.Engine`, and `EmojiEngine3D.Utilities`.

The shim exists so that one command can construct a canvas under Node. It is outside the engine. Unknown WebGL calls throw, so a new GL call has to be recorded on purpose. Canvas and Utilities require `document`. Engine and Terminal listen on `window` only when it exists. `beep` returns when audio is missing. `start` requires `requestAnimationFrame`. The browser page is what checks that a yawed box lands where `project` says it does.
