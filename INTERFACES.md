# Public interfaces

These four interfaces are the contract for emoji-engine-3d. The classes in `src/` implement them, and `src/index.ts` exports the classes plus the supporting types below. `npm run build` writes that same module to `dist/index.js`, with declarations in `dist/index.d.ts`.

The shapes are ordinary TypeScript interfaces, so plain JavaScript can call the same methods. The chrome and the collision-registration rules match [emoji-engine-2d](https://github.com/TheWhiteWitchTM/emoji-engine-2d). The drawing surface is WebGL2, positions are world units, and the script global is `EmojiEngine3D`.

## Supporting types

```ts
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Camera {
  /** World position of the eye. The object identity stays put; the components change. */
  readonly eye: Vec3;
  /** Radians. 0 looks down −z. Positive turns counter-clockwise from above. */
  yaw: number;
  /** Radians. Positive looks up. Clamped to ±1.5 while drawing and when written by setCamera or follow. */
  pitch: number;
  /** Vertical field of view in degrees. Default 60. */
  fov: number;
  /** Near plane. Default 0.05. */
  near: number;
  /** Far plane. Default 300. */
  far: number;
}

interface DrawFrame {
  readonly gl: WebGL2RenderingContext;
  readonly camera: Camera;
  /** Column-major view-projection used by this frame. */
  readonly viewProj: Float32Array;
  /** Look direction, including pitch. Reused next frame. */
  readonly forward: Vec3;
  /** Horizontal right of the yaw. Reused next frame. */
  readonly right: Vec3;
  /** World up, (0, 1, 0). */
  readonly up: Vec3;
}

interface Drawable {
  draw(frame: DrawFrame): void;
}

interface EmojiBillboard extends Drawable {
  readonly batch: 'emoji';
  emoji: string;
  x: number;
  y: number;
  z: number;
  size: number;
  alive: boolean;
}

interface SolidBox extends Drawable {
  readonly batch: 'box';
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  color: string;
  alive: boolean;
}

interface GlassPanel extends Drawable {
  readonly batch: 'terminal';
}

interface Projected {
  /** Normalized device coordinate, right positive. */
  x: number;
  /** Normalized device coordinate, up positive. */
  y: number;
  z: number;
  /** True when the point is on the camera's back side. */
  behind: boolean;
}

interface CanvasOptions {
  width?: number;       // CSS pixels, default 800
  height?: number;      // CSS pixels, default 600
  pixelRatio?: number;  // drawing-buffer scale, default 1
  clear?: string;       // #rrggbb, default "#1c2430"
  antialias?: boolean;  // default true
}

interface Cell {
  ch: string;
  fg?: number | null;   // 0–15, or null when the default ink is used
  bg?: number | null;   // 0–15; null and omitted stay transparent
  bright?: boolean;     // foreground indexes 0–7 draw as 8–15
  bold?: boolean;       // SGR bold face; not implied by a lone bright
}

type CursorStyle = 'underline' | 'block' | 'bar';

interface TerminalOptions {
  cols?: number;         // default 40
  rows?: number;         // default 12
  canvas?: Canvas;       // created from the grid size when omitted
  cellWidth?: number;    // default 16
  cellHeight?: number;   // default 20
  layer?: string;        // default "terminal"; the glass still paints after the world
  background?: string | number | null; // paper; number is a palette index; default null
  showCursor?: boolean;  // default true
  cursorColor?: string;  // default "#9ee"
  cursorStyle?: CursorStyle; // default "underline"
}

interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Radians. 0 faces world −z. Positive turns counter-clockwise from above. */
  yaw: number;
  layer: string;
  alive: boolean;
  data: Record<string, unknown>;
}

interface Sprite extends Body, EmojiBillboard {
  emoji: string;
  size: number;
  /** Sphere radius. Always `size / 2`. */
  readonly radius: number;
}

interface Box extends Body, SolidBox {
  w: number;
  h: number;
  d: number;
  /** `#rrggbb`. Other strings draw as light gray. */
  color: string;
  /** When true, overlaps are reported and sprites are not pushed. Default false. */
  sensor: boolean;
}

type Actor = Sprite | Box;

interface EngineOptions {
  width?: number;        // default 800, ignored when canvas is passed
  height?: number;       // default 600, ignored when canvas is passed
  pixelRatio?: number;   // default 1, ignored when canvas is passed
  clear?: string;        // ignored when canvas is passed
  antialias?: boolean;   // default true, ignored when canvas is passed
  canvas?: Canvas;
}

type WrapTarget =
  | HTMLElement
  | { element: HTMLElement }                 // Canvas
  | { canvas: { element: HTMLElement } };    // Engine or Terminal

interface WrapOptions {
  title?: string;
  header?: boolean; // default true
  footer?: boolean; // default true
}

interface WrapResult {
  wrap: HTMLElement;
  headerMiddle: HTMLElement | null;
  footer: HTMLElement | null;
  setTitle(title: string): void;
}

type CollisionHandler = (a: Actor, b: Actor) => void;
type KeyHandler = (key: string) => void;
```

`vx`, `vy`, and `vz` are world units per `Engine.update`. `data` is an empty object the game can hang its own state on. A sprite's `yaw` is its heading. The glyph faces the camera and does not rotate with yaw.

## Canvas

Constructed with `new Canvas(options?: CanvasOptions)`. The element is not inserted into the document. The constructor throws `WebGL2 is unavailable` when WebGL2 cannot be created.

`Canvas.forward(yaw, pitch?)` and `Canvas.right(yaw)` are static. `forward(0, 0)` is `(0, 0, −1)`. `forward(π/2, 0)` is `(−1, 0, 0)`. `forward(0, π/2)` is `(0, 1, 0)`. `right(0)` is `(1, 0, 0)`. `right(π/2)` is `(0, 0, −1)`.

```ts
interface Canvas {
  readonly element: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly camera: Camera;
  /** CSS pixel width. */
  width: number;
  /** CSS pixel height. */
  height: number;
  readonly pixelRatio: number;
  /** `#rrggbb` cleared before each draw. Default "#1c2430". */
  clearColor: string;
  /** How far behind a follow target the eye sits. Default 6. */
  followDistance: number;
  /** How far above a follow target the eye sits. Default 2.5. */
  followHeight: number;

  /** Draw one emoji billboard immediately, in world units, facing the camera. */
  drawEmoji(emoji: string, x: number, y: number, z: number, size: number): void;

  /**
   * Add a drawable to a named layer. The layer is created on first use.
   * Layers are visited in the order they were first created.
   * Re-adding a drawable moves it. Emoji are sorted later, across layers.
   * Terminal glass is drawn after the world.
   */
  add(drawable: Drawable, layer?: string): void;

  /** Remove a drawable. The layer keeps its place in the visit order. */
  remove(drawable: Drawable): void;

  /** Apply follow, clear, paint every layer, then the glass overlay. */
  draw(): void;

  /** Clear color and depth. Drawables stay registered. */
  clear(): void;

  /**
   * Place the eye. Omitted yaw and pitch stay as they are.
   * Pitch is clamped to ±1.5. A follow target replaces the eye, yaw,
   * and pitch on the next draw, project, or drawEmoji.
   */
  setCamera(x: number, y: number, z: number, yaw?: number, pitch?: number): void;

  /**
   * Keep the eye behind target on later draws. Pass null to stop.
   * Distance and height are followDistance and followHeight.
   * The heading is target.yaw, or 0 when yaw is omitted.
   * The camera stays where the last draw left it.
   */
  follow(target: (Vec3 & { yaw?: number }) | null): void;

  /**
   * Project a world point with the camera draw would use, including follow.
   * x and y are normalized device coordinates.
   */
  project(x: number, y: number, z: number): Projected;

  /** Set the CSS size. The drawing buffer is that size times pixelRatio. */
  resize(width: number, height: number): void;
}
```

`layer` defaults to `"default"`. A box instance is origin, absolute size, RGB, and yaw. Local `(x, y, z)` becomes `(cos·x + sin·z, y, −sin·x + cos·z)` in both the shader and `Engine`. `#rrggbb` and `#rgb` parse. Any other color string draws as `(0.78, 0.78, 0.82)`.

`project` sets `behind` when clip `w` is at most `1e-8`. A field of view outside `(1, 179)`, or a near/far pair that is not `0 < near < far`, falls back to 60°, 0.05, and 300 for that call only.

Emoji quads use `right(yaw)` and world up, with the camera yaw and a pitch of 0 for the right vector. Pitching the view does not tip the glyphs.

## Terminal

Constructed with `new Terminal(options?: TerminalOptions)`. The terminal adds itself to its canvas as a glass overlay. `canvas` on the instance is the surface it paints through. The constructor paints once, so the first frame already holds the empty grid and the caret.

```ts
interface Terminal extends GlassPanel {
  readonly cols: number;
  readonly rows: number;
  readonly canvas: Canvas;

  /** Write position. Assign col and row to move it. Read on the next draw. */
  readonly cursor: { col: number; row: number };
  /** Foreground index used by write and put. Default 15. */
  fg: number | null;
  /** Background index used by write and put. Default null (transparent). */
  bg: number | null;
  /** Stored on cells written from now on. Default false. */
  bright: boolean;
  /** Bold face for later cells. Default false. */
  bold: boolean;
  /** Paper behind uncolored cells, as a CSS color. Default null. */
  screenColor: string | null;
  /** False hides the caret. Default true. Read on the next draw. */
  cursorLit: boolean;
  /** Caret color. Default "#9ee". Read on the next draw. */
  cursorColor: string;
  /** Caret shape. Default "underline". Read on the next draw. */
  cursorStyle: 'underline' | 'block' | 'bar';

  /**
   * Write text at the cursor.
   * Newline mode is on: \n, VT, and FF return to column 0 and move down.
   * The buffer wraps and scrolls. A CSI or OSC sequence is consumed.
   */
  write(text: string): void;

  /** Feed one code point through the same parser as write, then redraw. */
  put(ch: string): void;

  /** Replace one cell. A string is stored as-is and is not parsed. Out of range is ignored. */
  set(col: number, row: number, value: Cell | string): void;

  /** Copy one cell. Out of range returns a space. */
  get(col: number, row: number): Cell;

  /** Fill the buffer with spaces and move the cursor home. The pen is kept. */
  clear(): void;

  /**
   * Set the color indexes for later write and put calls.
   * An omitted bg is kept. An index outside 0–15 is ignored.
   * Null clears that channel. This call does not redraw.
   */
  color(fg: number | null, bg?: number | null): void;

  /**
   * Paper behind cells with no background of their own.
   * A number is a palette index and is stored as its CSS color.
   * A string is CSS. null is transparent.
   * An out-of-range index is ignored. This is not the pen.
   */
  background(color: string | number | null): void;

  /**
   * "underline" is the bottom bar, "bar" is a vertical beam, "block" fills the cell.
   * The next draw reads the style. This call does not itself redraw.
   */
  setCursorStyle(style: 'underline' | 'block' | 'bar'): void;

  /** Hold redraws. Calls may nest. */
  beginFrame(): void;

  /** Release one beginFrame. The outermost call redraws if the buffer changed. */
  endFrame(): void;

  /** Keydown subscription. key is KeyboardEvent.key. */
  onKey(handler: KeyHandler): void;

  /** True while key (KeyboardEvent.key) is held. */
  isKeyDown(key: string): boolean;

  /**
   * Paint the grid in screen space, at the top-left of the viewport.
   * The camera is ignored. Canvas.draw calls this after the world.
   */
  draw(frame: DrawFrame): void;
}
```

Indexes 0–15:

| n | Color | n | Color |
| --- | --- | --- | --- |
| 0 | `#000000` | 8 | `#555555` |
| 1 | `#aa0000` | 9 | `#ff5555` |
| 2 | `#00aa00` | 10 | `#55ff55` |
| 3 | `#aa5500` | 11 | `#ffff55` |
| 4 | `#0000aa` | 12 | `#5555ff` |
| 5 | `#aa00aa` | 13 | `#ff55ff` |
| 6 | `#00aaaa` | 14 | `#55ffff` |
| 7 | `#aaaaaa` | 15 | `#ffffff` |

`bright` draws foreground indexes 0–7 as 8–15 and does not, by itself, change the font. SGR 1 sets `bright` and `bold`. SGR 22 clears both. SGR 90–97 select foreground 8–15 and leave the bright flag as it was. SGR 100–107 do the same for the background. A null cell background does not fill the cell. `screenColor`, when set, shows through those cells. A missing foreground index paints palette entry 15.

The caret is a 2px underline in `cursorColor`, clamped into the grid. `block` fills the cell. `bar` is a 2px vertical beam. `cursorLit === false` draws nothing. The caret does not blink. `ESC c` resets the pen and the cells and keeps the paper and the caret settings.

`write` and `put` parse a subset of ECMA-48. The sequences that change the buffer:

| Sequence | Effect |
| --- | --- |
| CUU CUD CUF CUB CHA CUP (`H`, `f`) | Move. Stops at the edge. `0` and omitted mean 1. CUP is 1-based row, then column. Does not scroll. |
| IND `ESC D`, RI `ESC M`, NEL `ESC E`, LF VT FF CR BS HT | Index scrolls at the bottom and does not return. Next line returns. Reverse index scrolls at the top. Tab stops every 8 columns and clamps to the last column. |
| SGR | 0 resets the pen. 1 is bold and bright. 22 clears both. 30–37 and 40–47 the classic colors. 39 is foreground 15. 49 is a transparent background. 90–97 and 100–107 select entries 8–15. |
| `ESC c` | Reset the screen and the pen. The paper and the caret settings stay. |

An empty SGR parameter is 0. Other SGR parameters are ignored. A CSI final other than the moves and SGR above is consumed and ignored, including a parameter that starts with `<`, `=`, `>`, or `?`. CAN and SUB cancel a CSI. OSC is discarded through BEL, and also through ESC plus the following character, so a title sequence cannot retint the page. Other C0 controls are ignored and are not stored. DEL is ignored. The 8-bit CSI byte U+009B opens a CSI sequence.

`write` iterates code points, so a multi-code-point emoji occupies several cells. `put` keeps the first code point and drops the rest. An empty `put` returns without drawing. A sequence may be split across `write` and `put` calls.

Mutations other than `color` and `setCursorStyle` redraw through `canvas.draw()` unless a `beginFrame` is open. `write` wraps itself in a frame, so one `write` draws once. An extra `endFrame` while no frame is open does nothing. That redraw paints the world and then the glass.

`get` omits `bright` and `bold` when they are false. `set` with a string applies the current pen. `set` with a `Cell` copies the fields it is given.

`onKey` and `isKeyDown` attach to `window` when it exists. They are independent of `Engine.isKeyDown`.

## Engine

Constructed with `new Engine(options?: EngineOptions)`. Passing `canvas` reuses that surface and ignores `width`, `height`, `pixelRatio`, `clear`, and `antialias`.

```ts
interface Engine {
  readonly canvas: Canvas;

  /**
   * Create a sprite and add it to a named layer.
   * size defaults to 1 world unit. layer defaults to "default".
   * The glyph faces the camera. yaw is the heading and starts at 0.
   */
  sprite(emoji: string, x: number, y: number, z: number, size?: number, layer?: string): Sprite;

  /**
   * Create a box centered on (x, y, z) and add it to a named layer.
   * w, h, and d default to 1. color defaults to "#c8c8d0".
   * sensor starts false. yaw starts at 0.
   */
  box(x: number, y: number, z: number, w?: number, h?: number, d?: number, color?: string, layer?: string): Box;

  /** Set per-update velocity in world units. */
  motion(body: Body, vx: number, vy: number, vz: number): void;

  /**
   * Register a callback for sprite pairs, and for a sprite touching a sensor box.
   * Returns a function that removes this registration.
   */
  onCollision(handler: CollisionHandler): () => void;

  /** Move living bodies, push sprites out of solid boxes, then report overlaps. */
  update(): void;

  /** Run update and canvas.draw on requestAnimationFrame. */
  start(): void;

  /** Cancel the frame loop. */
  stop(): void;

  /** True while key (KeyboardEvent.key) is held. */
  isKeyDown(key: string): boolean;

  /**
   * Play a square-wave beep.
   * freq is Hertz (default 440). duration is milliseconds (default 120).
   * Returns immediately when audio is unavailable.
   */
  beep(freq?: number, duration?: number): void;
}
```

Sphere test, evaluated after the move and the solid push. The layer is ignored. A pair with a non-finite position or a non-finite size is not a hit.

```text
(ax - bx)² + (ay - by)² + (az - bz)² <= (a.radius + b.radius)²
a.radius = a.size / 2
```

A sprite touches a box when the sphere meets the box's oriented bounds. The box yaw is the mesh yaw. A solid box moves the sprite out and is not reported. A sensor box is reported and does not move the sprite. Two boxes are never a pair.

Contact within `1e-4` of the surface is already at rest and is not pushed. A sprite in the middle of a solid leaves through the nearest local face. Equal distances prefer +x, then −x, then +y, then −y, then +z, then −z. The velocity is unchanged.

Each unordered pair is collected once per `update`, with the body created earlier as `a`. Handlers then run for that fixed list. A handler that moves or kills a body does not add or drop pairs until the next update. The callback runs again on the next update if the shapes still overlap.

`onCollision` returns a function that removes that registration. Calling it again does nothing. Two registrations of one function are removed separately. A handler removed before its turn does not run for later pairs. A handler registered during an update starts on the next update. Every registration that is still present when a pair is delivered receives that pair. `update` throws `Engine.update cannot be called from a collision handler` if it is called from a handler. Bodies with `alive === false` skip motion, collision, and painting.

`start` throws if `requestAnimationFrame` is missing. A second `start` while the loop is running does nothing. `stop` during `update` still lets that frame's `canvas.draw` run, then the loop ends. If `update` or `draw` throws, the loop stops and `start` may be called again.

`isKeyDown` reads `keydown` / `keyup` on `window` when `window.addEventListener` exists. There is no listener on a headless host, so every key reads as up.

## Utilities

`Utilities` is a single object. There is no constructor. Canvas, Terminal, and Engine never call it.

```ts
interface Utilities {
  /**
   * Build an optional header and footer around a target.
   * The header is a title, a middle slot, and a fullscreen button.
   * The footer is a plain div. Either bar can be turned off.
   */
  wrap(target: WrapTarget, options?: WrapOptions): WrapResult;
}
```

`wrap` resolution order:

1. An element (`nodeType === 1`), including a raw `HTMLCanvasElement`.
2. An object with `element`, which is how a Canvas is accepted.
3. An object with `canvas.element`, which is how an Engine or a Terminal is accepted.

Anything else throws `Utilities.wrap target must be an element, a Canvas, or an object with a canvas`.

The returned column is `header` (optional), then the target element, then the footer `div` (optional). `headerMiddle` is the empty center node of the header, ready for a score or a status string. It is `null` when `options.header` is `false`. `footer` is `null` when `options.footer` is `false`.

`setTitle(title)` replaces the left-hand title. It does nothing when the header was not built.

The fullscreen button calls `requestFullscreen` on the column, or `exitFullscreen` when the document is already fullscreen. A rejected request is ignored. The label is `F11 Fullscreen`, or `Esc Exit` while `document.fullscreenElement` is set. `wrap` reads that state immediately, and `fullscreenchange` updates every button, including when the fullscreen element is a parent of the wrap. The button does not listen for the F11 key.

Class names on the chrome, for styling: `ee-wrap`, `ee-header`, `ee-title`, `ee-middle`, `ee-fullscreen`, `ee-footer`. They are the same names emoji-engine-2d uses.

## Minimal scene

```js
import { Engine, Terminal, Utilities } from 'emoji-engine-3d';

const engine = new Engine({ width: 800, height: 600 });
const ui = Utilities.wrap(engine.canvas, { title: 'Witch Hunt' });
document.body.appendChild(ui.wrap);

const term = new Terminal({ cols: 40, rows: 4, canvas: engine.canvas });
term.write('Witch Hunt\n');

engine.box(0, -0.15, 0, 24, 0.3, 24, '#3d5c3a');
const witch = engine.sprite('🧙‍♀️', 0, 0.6, 0, 1.2);
const hunter = engine.sprite('✝️', 0, 0.5, 6, 1, 'entities');
engine.motion(hunter, 0, 0, -0.12);
engine.canvas.follow(witch);
const off = engine.onCollision((a, b) => {
  console.log(a.emoji, 'hit', b.emoji);
  off();
});
engine.start();
```

`examples/demo.js` is this scene with positions that meet, plus checks for the wrap, the terminal buffer, the camera, the frame directions, solid boxes, and collision. It imports `../dist/index.js`. `npm run demo` builds, then runs it with Node. `examples/play.html` repeats the scene in a browser and reads pixels back: a yawed red box has to cover the world point the shader claims, and an ANSI red cell has to sit at the top-left of the glass. The script-tag builds are `browser/emoji-engine-3d.js` and the minified `browser/emoji-engine-3d.min.js`. Both assign `globalThis.EmojiEngine3D`.
