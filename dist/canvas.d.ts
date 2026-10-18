/**
 * WebGL drawing surface. Owns the canvas, the camera, named layers, and the
 * emoji atlas. No game rules and no page chrome.
 *
 * World axes are y-up and right-handed. Yaw 0 looks down world −z.
 * Positive yaw turns counter-clockwise seen from above.
 */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
/** Eye, yaw, and pitch. Yaw 0 pitch 0 looks down world −z. */
export interface Camera {
    /** World position of the eye. The object identity stays put; the components change. */
    readonly eye: Vec3;
    /** Radians. 0 looks down −z. Positive turns counter-clockwise from above. */
    yaw: number;
    /** Radians. Positive looks up. Values past about ±86° are clamped while drawing. */
    pitch: number;
    /** Vertical field of view in degrees. Default 60. */
    fov: number;
    /** Near plane. Default 0.05. */
    near: number;
    /** Far plane. Default 300. */
    far: number;
}
/**
 * What a custom drawable receives during `Canvas.draw`.
 * `forward` includes pitch. `right` is the horizontal right of the yaw, so a
 * billboard built from `right` and `up` stays upright. The vectors are reused
 * next frame.
 */
export interface DrawFrame {
    readonly gl: WebGL2RenderingContext;
    readonly camera: Camera;
    /** Column-major view-projection used by this frame. */
    readonly viewProj: Float32Array;
    readonly forward: Vec3;
    readonly right: Vec3;
    readonly up: Vec3;
}
/** Something the canvas can paint. Built-in bodies set `batch` and are instanced. */
export interface Drawable {
    draw(frame: DrawFrame): void;
}
/** Retained emoji billboard. The canvas instances these instead of calling `draw`. */
export interface EmojiBillboard extends Drawable {
    readonly batch: 'emoji';
    emoji: string;
    x: number;
    y: number;
    z: number;
    size: number;
    alive: boolean;
}
/** Retained box. The canvas instances these instead of calling `draw`. */
export interface SolidBox extends Drawable {
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
/**
 * Screen-space cell glass. Painted after the world, so the camera cannot
 * scroll it. `draw` rasters and uploads the bitmap.
 */
export interface GlassPanel extends Drawable {
    readonly batch: 'terminal';
}
/** Options for a new WebGL surface. */
export interface CanvasOptions {
    /** CSS pixel width. Default 800. */
    width?: number;
    /** CSS pixel height. Default 600. */
    height?: number;
    /** Drawing-buffer scale. Default 1. */
    pixelRatio?: number;
    /** Clear color `#rrggbb`. Default `#1c2430`. */
    clear?: string;
    /** Multisampling. Default true. */
    antialias?: boolean;
}
/** A world point in normalized device coordinates. `x` is right, `y` is up. */
export interface Projected {
    x: number;
    y: number;
    z: number;
    /** True when the point is on the camera's back side. */
    behind: boolean;
}
interface CanvasContract {
    readonly element: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    readonly camera: Camera;
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
    clearColor: string;
    followDistance: number;
    followHeight: number;
    drawEmoji(emoji: string, x: number, y: number, z: number, size: number): void;
    add(drawable: Drawable, layer?: string): void;
    remove(drawable: Drawable): void;
    draw(): void;
    clear(): void;
    setCamera(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
    follow(target: (Vec3 & {
        yaw?: number;
    }) | null): void;
    project(x: number, y: number, z: number): Projected;
    resize(width: number, height: number): void;
}
/**
 * Pure drawing surface. One instanced draw covers every box in a layer, and
 * one instanced draw covers every emoji that shares an atlas page.
 */
export declare class Canvas implements CanvasContract {
    readonly element: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    readonly camera: Camera;
    /** CSS pixel width. */
    width: number;
    /** CSS pixel height. */
    height: number;
    readonly pixelRatio: number;
    /** `#rrggbb` cleared before each `draw`. */
    clearColor: string;
    /** How far behind a follow target the eye sits. Default 6. */
    followDistance: number;
    /** How far above a follow target the eye sits. Default 2.5. */
    followHeight: number;
    private readonly layers;
    private followTarget;
    private readonly proj;
    private readonly view;
    private readonly viewProj;
    private readonly frameForward;
    private readonly frameRight;
    private readonly frame;
    private readonly atlases;
    private readonly boxProgram;
    private readonly emojiProgram;
    private readonly boxViewProj;
    private readonly emojiViewProj;
    private readonly emojiRight;
    private readonly emojiUp;
    private readonly emojiTex;
    private readonly boxVao;
    private readonly emojiVao;
    private readonly boxInstance;
    private readonly emojiInstance;
    private boxData;
    private emojiData;
    /** Create a canvas and a WebGL2 context. Nothing is added to the document. */
    constructor(options?: CanvasOptions);
    /**
     * World forward for a yaw and pitch.
     * `forward(0, 0)` is `(0, 0, −1)`. `forward(π/2, 0)` is `(−1, 0, 0)`.
     */
    static forward(yaw: number, pitch?: number): Vec3;
    /**
     * Horizontal right for a yaw. `right(0)` is `(1, 0, 0)`.
     * This is `forward(yaw, 0) × (0, 1, 0)`, written as `(-z, 0, x)`.
     */
    static right(yaw: number): Vec3;
    /**
     * Draw one emoji billboard immediately, in world units, facing the camera.
     * `draw`, `project`, and this method apply `follow` first.
     */
    drawEmoji(emoji: string, x: number, y: number, z: number, size: number): void;
    /**
     * Add a drawable to a named layer, creating the layer on first use.
     * Layers paint in the order they were first created, back to front.
     * An empty layer keeps its place. Adding a drawable that is already
     * on the canvas moves it. Emoji and the terminal glass are ordered later:
     * emoji after every solid, far to near, and the glass after the world.
     */
    add(drawable: Drawable, layer?: string): void;
    /** Remove a drawable from whichever layer holds it. */
    remove(drawable: Drawable): void;
    /** Apply `follow`, clear, paint every layer, then the glass overlay. */
    draw(): void;
    /** Clear color and depth. Drawables stay registered. */
    clear(): void;
    /**
     * Place the eye. Omitted yaw and pitch stay as they are.
     * A follow target replaces the eye, yaw, and pitch on the next `draw`.
     */
    setCamera(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
    /**
     * Keep the eye behind `target` on later draws.
     * Pass null to stop. Distance and height are `followDistance` and `followHeight`.
     * The heading is `target.yaw`, or 0 when yaw is omitted.
     */
    follow(target: (Vec3 & {
        yaw?: number;
    }) | null): void;
    /**
     * Project a world point with the camera `draw` would use, including `follow`.
     * `x` and `y` are normalized device coordinates.
     */
    project(x: number, y: number, z: number): Projected;
    /** Set the CSS size. The drawing buffer is that size times `pixelRatio`. */
    resize(width: number, height: number): void;
    private syncFrame;
    private applyFollow;
    private paintBoxes;
    private paintEmojiLayer;
    private paintEmoji;
    private stamp;
    private grow;
}
export {};
