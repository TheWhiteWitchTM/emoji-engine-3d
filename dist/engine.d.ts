import { Canvas, type EmojiBillboard, type SolidBox } from './canvas.js';
/**
 * A moving body. `vx`, `vy`, and `vz` are world units per `update`.
 * `yaw` 0 faces world −z. Positive yaw turns counter-clockwise from above.
 */
export interface Body {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    yaw: number;
    layer: string;
    alive: boolean;
    data: Record<string, unknown>;
}
/** Emoji billboard. `radius` is always `size / 2`. The glyph faces the camera. */
export interface Sprite extends Body, EmojiBillboard {
    emoji: string;
    size: number;
    /** Sphere radius. Always `size / 2`. */
    readonly radius: number;
}
/**
 * A yawed box centered on `x, y, z`. `w`, `h`, and `d` are full edge lengths.
 * The yaw matches the mesh: local `(x, y, z)` becomes
 * `(cos·x + sin·z, y, −sin·x + cos·z)`.
 * A solid box pushes sprites out. A sensor reports the overlap and does not push.
 */
export interface Box extends Body, SolidBox {
    w: number;
    h: number;
    d: number;
    /** `#rrggbb`. Other strings draw as light gray. */
    color: string;
    /** When true, overlaps are reported and sprites are not pushed. Default false. */
    sensor: boolean;
}
export type Actor = Sprite | Box;
/** Called once per overlapping pair per update. `a` was created before `b`. */
export type CollisionHandler = (a: Actor, b: Actor) => void;
/** Options for the game systems layer. */
export interface EngineOptions {
    /** Viewport width when this engine creates the canvas. Default 800. */
    width?: number;
    /** Viewport height when this engine creates the canvas. Default 600. */
    height?: number;
    /** Drawing-buffer scale when this engine creates the canvas. Default 1. */
    pixelRatio?: number;
    /** Clear color when this engine creates the canvas. */
    clear?: string;
    /** Multisampling when this engine creates the canvas. Default true. */
    antialias?: boolean;
    /** Use this surface instead of creating one. The size options are then ignored. */
    canvas?: Canvas;
}
interface EngineContract {
    readonly canvas: Canvas;
    sprite(emoji: string, x: number, y: number, z: number, size?: number, layer?: string): Sprite;
    box(x: number, y: number, z: number, w?: number, h?: number, d?: number, color?: string, layer?: string): Box;
    motion(body: Body, vx: number, vy: number, vz: number): void;
    onCollision(handler: CollisionHandler): () => void;
    update(): void;
    start(): void;
    stop(): void;
    isKeyDown(key: string): boolean;
    beep(freq?: number, duration?: number): void;
}
/**
 * Sprites, boxes, motion, sphere tests, keyboard, beep, and the frame loop.
 * Uses a Canvas and does not build header or footer chrome.
 */
export declare class Engine implements EngineContract {
    readonly canvas: Canvas;
    private readonly actors;
    private readonly collisions;
    private readonly keys;
    private audio;
    private raf;
    private running;
    private inUpdate;
    /** Use `options.canvas`, or create one. Does not build page chrome. */
    constructor(options?: EngineOptions);
    /**
     * Create an emoji sprite and place it on a named layer.
     * `size` is the world height of the billboard and defaults to 1.
     * `layer` defaults to `default`. The glyph faces the camera; `yaw` is the heading.
     */
    sprite(emoji: string, x: number, y: number, z: number, size?: number, layer?: string): Sprite;
    /**
     * Create a box and place it on a named layer.
     * Dimensions default to 1. `color` defaults to `#c8c8d0`. The box is solid.
     */
    box(x: number, y: number, z: number, w?: number, h?: number, d?: number, color?: string, layer?: string): Box;
    /** Set per-update velocity in world units. */
    motion(body: Body, vx: number, vy: number, vz: number): void;
    /**
     * Register a callback for sprite pairs, and for a sprite touching a sensor box.
     * The returned function removes this registration. Calling it again does nothing.
     * Two registrations of one function are removed separately.
     */
    onCollision(handler: CollisionHandler): () => void;
    /**
     * Move living actors, push sprites out of solid boxes, then report overlaps.
     * Pairs are chosen after the push and do not change while handlers run.
     * Throws when called from a collision handler.
     */
    update(): void;
    /** Start the `requestAnimationFrame` loop. Each frame updates, then draws. */
    start(): void;
    /** Stop the frame loop. */
    stop(): void;
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key: string): boolean;
    /**
     * Play a short square-wave beep.
     * `freq` is Hertz (default 440) and `duration` is milliseconds (default 120).
     * Does nothing when the Web Audio API is missing.
     */
    beep(freq?: number, duration?: number): void;
    private tick;
    private armKeys;
}
export {};
