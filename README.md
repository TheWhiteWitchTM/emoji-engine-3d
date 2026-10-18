# emoji-engine-3d

**Alpha.** This is alpha-level code. Public interfaces and behavior can change between versions, and a change can break callers. Use it at your own risk.

A release candidate is the point where the public interfaces freeze. Until then, treat [INTERFACES.md](INTERFACES.md) as a description of the code you have, and read [CHANGES.md](CHANGES.md) before you upgrade.

A small, interface-driven 3D engine for emoji-native games. It is the WebGL supplement to [emoji-engine-2d](https://github.com/TheWhiteWitchTM/emoji-engine-2d). The two packages do not import each other. A page can load both script builds, and each one draws on its own canvas.

It supports two complementary styles in one package:

- **Free space** games (emoji billboards, colored boxes, a yaw and pitch camera, sphere collision)
- **Terminal / cell-buffer** glass (a screen-space HUD: newline mode, wrap, scroll, and the classic 16-color SGR)

Both styles share the same Canvas underneath. You can mix them. The glass paints after the world, so the camera does not scroll the text. Header and footer chrome are optional and live in Utilities, which the other three pieces never construct. The class names match emoji-engine-2d.

Designed for small 3D scenes you can read in one file — a chase, a room, a board stood up in space — while remaining lightweight enough to embed or extend.

## Features

- WebGL2 canvas with named layers, a y-up camera, and `drawEmoji`
- Sprites you place in world space, move with `vx` / `vy` / `vz`, and collide as spheres
- Solid and sensor boxes. A solid pushes sprites out. The mesh yaw and the collision yaw are the same turn
- One instanced draw for the boxes in a layer, one for each emoji atlas page, and one quad for the glass
- Terminal cell glass (newline mode, wrap, scroll, cursor addressing, the 16 ANSI colors) that paints through a Canvas and ignores the camera
- Optional Utilities chrome: title, middle slot, fullscreen button that knows when the page is already fullscreen, plain footer div
- `isKeyDown`, `onKey`, and a short `beep`
- Plain JavaScript in `dist/` for an `import`, and script-tag builds in `browser/`

The surface is intentionally small. Animation, scenes, and a full ECMA-48 terminal can sit on top of these four pieces. The full terminal stays in emoji-engine-2d.

## Install and run the demo

```bash
npm install
npm run demo
```

`npm install` compiles `src/` into `dist/` and writes the script-tag builds to `browser/`. `npm run build` does that again after you change the TypeScript. The demo imports the built files with Node, so it does not need tsx. It wraps a canvas, writes two lines through a Terminal, places a witch and a moving hunter on the heath, and exits when the collision callback fires:

```text
Witch Hunt
A hunter crosses the heath.
🧙‍♀️ hit ✝️
demo ok
```

Under Node the example installs a tiny DOM stand-in (`examples/dom-shim.js`) so those classes can be constructed. The stand-in records draw calls and does not rasterize. Browsers already have `document`, `requestAnimationFrame`, and WebGL2, and the stand-in stays dormant there.

The same scene is in `examples/play.html`. From the repository root:

```bash
python3 -m http.server 8765
```

Open `http://localhost:8765/examples/play.html`. It loads `browser/emoji-engine-3d.js`, so run `npm run build` first. Left and Right turn the witch. Up and Down walk along her heading. The footer reads `browser ok` when the page's own checks pass. Those checks include a pixel read of a yawed box, so the picture and the collision agree.

## Use the API

After `npm install`, import the built module. From this repository that path is `./dist/index.js`. A project that depends on this package imports `emoji-engine-3d` instead.

```js
import { Engine, Terminal, Utilities } from './dist/index.js';

const engine = new Engine({ width: 800, height: 600 });
const ui = Utilities.wrap(engine.canvas, { title: 'Witch Hunt' });
document.body.appendChild(ui.wrap);
ui.headerMiddle.textContent = 'score 0';
ui.footer.textContent = 'ready';

const term = new Terminal({ cols: 40, rows: 4, canvas: engine.canvas });
term.write('The heath is quiet.\n');

engine.box(0, -0.15, 0, 24, 0.3, 24, '#3d5c3a');
const witch = engine.sprite('🧙‍♀️', 0, 0.6, 0, 1.2);
const hunter = engine.sprite('✝️', 0, 0.5, 6, 1, 'entities');
engine.motion(hunter, 0, 0, -0.12);
engine.canvas.follow(witch);

const off = engine.onCollision((a, b) => {
  console.log(a.emoji, 'hit', b.emoji);
  engine.beep(523, 80);
  off();
});

engine.start();
```

A page can load the same constructors from the script build. `EmojiEngine3D` is the global, so it can sit beside `EmojiEngine` from emoji-engine-2d. `browser/emoji-engine-3d.min.js` is the same script, minified.

```html
<script src="./browser/emoji-engine-3d.min.js"></script>
<script>
  const { Engine, Terminal, Utilities } = EmojiEngine3D;
</script>
```

`<script type="module">` can import `./dist/index.js` instead. `sprite` takes `(emoji, x, y, z, size = 1, layer = 'default')`. `size` is world units, and `z` is required. Velocity is world units per frame. Yaw 0 faces world −z. Pass `header: false` or `footer: false` to `wrap` when you want one bar or neither. `onCollision` returns a function that removes that callback. A solid box pushes a sprite and does not call that callback. Set `box.sensor = true` when the overlap should be reported.

`dist/index.js` exports `Canvas`, `Terminal`, `Engine`, and `Utilities`. TypeScript declarations are in `dist/index.d.ts`.

## Docs

- [CHANGES.md](CHANGES.md) — behavior a caller can observe, including breaks while this stays alpha
- [ARCHITECTURE.md](ARCHITECTURE.md) — the four pieces and how a frame runs
- [INTERFACES.md](INTERFACES.md) — the contracts the source implements

## License

MIT. See [LICENSE](LICENSE).
