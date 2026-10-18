import {
  Canvas,
  type DrawFrame,
  type EmojiBillboard,
  type SolidBox,
} from './canvas.js';

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
export class Engine implements EngineContract {
  readonly canvas: Canvas;

  private readonly actors: Actor[] = [];
  private readonly collisions: Array<{ handler: CollisionHandler }> = [];
  private readonly keys = new Set<string>();
  private audio: AudioContext | null = null;
  private raf = 0;
  private running = false;
  private inUpdate = false;

  /** Use `options.canvas`, or create one. Does not build page chrome. */
  constructor(options: EngineOptions = {}) {
    this.canvas = options.canvas ?? new Canvas({
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio,
      clear: options.clear,
      antialias: options.antialias,
    });
    this.armKeys();
  }

  /**
   * Create an emoji sprite and place it on a named layer.
   * `size` is the world height of the billboard and defaults to 1.
   * `layer` defaults to `default`. The glyph faces the camera; `yaw` is the heading.
   */
  sprite(emoji: string, x: number, y: number, z: number, size = 1, layer = 'default'): Sprite {
    const sprite = new EmojiActor(emoji, x, y, z, size, layer);
    this.actors.push(sprite);
    this.canvas.add(sprite, layer);
    return sprite;
  }

  /**
   * Create a box and place it on a named layer.
   * Dimensions default to 1. `color` defaults to `#c8c8d0`. The box is solid.
   */
  box(
    x: number,
    y: number,
    z: number,
    w = 1,
    h = 1,
    d = 1,
    color = '#c8c8d0',
    layer = 'default',
  ): Box {
    const box = new BoxActor(x, y, z, w, h, d, color, layer);
    this.actors.push(box);
    this.canvas.add(box, layer);
    return box;
  }

  /** Set per-update velocity in world units. */
  motion(body: Body, vx: number, vy: number, vz: number): void {
    body.vx = vx;
    body.vy = vy;
    body.vz = vz;
  }

  /**
   * Register a callback for sprite pairs, and for a sprite touching a sensor box.
   * The returned function removes this registration. Calling it again does nothing.
   * Two registrations of one function are removed separately.
   */
  onCollision(handler: CollisionHandler): () => void {
    const entry = { handler };
    this.collisions.push(entry);
    return () => {
      const index = this.collisions.indexOf(entry);
      if (index >= 0) this.collisions.splice(index, 1);
    };
  }

  /**
   * Move living actors, push sprites out of solid boxes, then report overlaps.
   * Pairs are chosen after the push and do not change while handlers run.
   * Throws when called from a collision handler.
   */
  update(): void {
    if (this.inUpdate) {
      throw new Error('Engine.update cannot be called from a collision handler');
    }
    this.inUpdate = true;
    try {
      for (const actor of this.actors) {
        if (!actor.alive) continue;
        actor.x += actor.vx;
        actor.y += actor.vy;
        actor.z += actor.vz;
      }

      for (const sprite of this.actors) {
        if (sprite.batch !== 'emoji' || !sprite.alive || !placed(sprite)) continue;
        for (const box of this.actors) {
          if (box.batch !== 'box' || !box.alive || box.sensor || !placed(box)) continue;
          pushSprite(sprite, box);
        }
      }

      const live = this.actors.filter((actor) => actor.alive && placed(actor));
      const pairs: Array<[Actor, Actor]> = [];
      for (let i = 0; i < live.length; i += 1) {
        for (let j = i + 1; j < live.length; j += 1) {
          const a = live[i];
          const b = live[j];
          if (a.batch === 'box' && b.batch === 'box') continue;
          if (a.batch === 'emoji' && b.batch === 'emoji') {
            if (spheresTouch(a, b)) pairs.push([a, b]);
            continue;
          }
          const sprite = a.batch === 'emoji' ? a : b;
          const box = a.batch === 'box' ? a : b;
          if (box.batch !== 'box' || sprite.batch !== 'emoji' || !box.sensor) continue;
          if (sphereTouchesBox(sprite, box)) pairs.push([a, b]);
        }
      }

      const handlers = this.collisions.slice();
      for (const [a, b] of pairs) {
        for (const entry of handlers) {
          if (this.collisions.indexOf(entry) < 0) continue;
          entry.handler(a, b);
        }
      }
    } finally {
      this.inUpdate = false;
    }
  }

  /** Start the `requestAnimationFrame` loop. Each frame updates, then draws. */
  start(): void {
    if (this.running) return;
    if (typeof requestAnimationFrame !== 'function') {
      throw new Error('requestAnimationFrame is unavailable');
    }
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Stop the frame loop. */
  stop(): void {
    this.running = false;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
  }

  /** True while `key` (`KeyboardEvent.key`) is held. */
  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  /**
   * Play a short square-wave beep.
   * `freq` is Hertz (default 440) and `duration` is milliseconds (default 120).
   * Does nothing when the Web Audio API is missing.
   */
  beep(freq = 440, duration = 120): void {
    const AudioCtor = globalThis.AudioContext;
    if (typeof AudioCtor !== 'function') return;
    try {
      const audio = this.audio ?? new AudioCtor();
      this.audio = audio;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(audio.destination);
      const stopAt = audio.currentTime + duration / 1000;
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      osc.start();
      osc.stop(stopAt);
    } catch {
      // Autoplay policies and headless hosts can reject audio. The game continues.
    }
  }

  private tick = (): void => {
    if (!this.running) return;
    try {
      this.update();
      this.canvas.draw();
    } catch (error) {
      this.running = false;
      throw error;
    }
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  private armKeys(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.key);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key);
    });
  }
}

class EmojiActor implements Sprite {
  readonly batch = 'emoji' as const;
  emoji: string;
  x: number;
  y: number;
  z: number;
  size: number;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  layer: string;
  alive = true;
  data: Record<string, unknown> = {};

  constructor(emoji: string, x: number, y: number, z: number, size: number, layer: string) {
    this.emoji = emoji;
    this.x = x;
    this.y = y;
    this.z = z;
    this.size = size;
    this.layer = layer;
  }

  get radius(): number {
    return this.size / 2;
  }

  draw(_frame: DrawFrame): void {}
}

class BoxActor implements Box {
  readonly batch = 'box' as const;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw = 0;
  color: string;
  sensor = false;
  vx = 0;
  vy = 0;
  vz = 0;
  layer: string;
  alive = true;
  data: Record<string, unknown> = {};

  constructor(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    layer: string,
  ) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    this.h = h;
    this.d = d;
    this.color = color;
    this.layer = layer;
  }

  draw(_frame: DrawFrame): void {}
}

function placed(body: Body): boolean {
  return Number.isFinite(body.x) && Number.isFinite(body.y) && Number.isFinite(body.z);
}

function spheresTouch(a: Sprite, b: Sprite): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const reach = a.radius + b.radius;
  if (!Number.isFinite(dx + dy + dz + reach)) return false;
  return dx * dx + dy * dy + dz * dz <= reach * reach;
}

/**
 * Inverse of the box yaw used by the mesh shader.
 * Shader: `x' = cos·x + sin·z`, `z' = −sin·x + cos·z`.
 */
function worldToLocal(box: Box, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const dx = x - box.x;
  const dy = y - box.y;
  const dz = z - box.z;
  const c = Math.cos(box.yaw);
  const s = Math.sin(box.yaw);
  return { x: c * dx - s * dz, y: dy, z: s * dx + c * dz };
}

function localToWorld(box: Box, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const c = Math.cos(box.yaw);
  const s = Math.sin(box.yaw);
  return {
    x: box.x + c * x + s * z,
    y: box.y + y,
    z: box.z - s * x + c * z,
  };
}

function sphereTouchesBox(sprite: Sprite, box: Box): boolean {
  const radius = sprite.radius;
  if (!Number.isFinite(radius) || !Number.isFinite(box.w + box.h + box.d + box.yaw)) return false;
  const local = worldToLocal(box, sprite.x, sprite.y, sprite.z);
  const hx = Math.abs(box.w) / 2;
  const hy = Math.abs(box.h) / 2;
  const hz = Math.abs(box.d) / 2;
  const cx = clamp(local.x, -hx, hx);
  const cy = clamp(local.y, -hy, hy);
  const cz = clamp(local.z, -hz, hz);
  const ex = local.x - cx;
  const ey = local.y - cy;
  const ez = local.z - cz;
  return ex * ex + ey * ey + ez * ez <= radius * radius;
}

/** Push a sprite to the surface of a solid box. A rest within 1e-4 is left alone. */
function pushSprite(sprite: Sprite, box: Box): void {
  const radius = sprite.radius;
  if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(box.w + box.h + box.d + box.yaw)) return;
  const local = worldToLocal(box, sprite.x, sprite.y, sprite.z);
  const hx = Math.abs(box.w) / 2;
  const hy = Math.abs(box.h) / 2;
  const hz = Math.abs(box.d) / 2;
  let lx = local.x;
  let ly = local.y;
  let lz = local.z;
  const cx = clamp(lx, -hx, hx);
  const cy = clamp(ly, -hy, hy);
  const cz = clamp(lz, -hz, hz);
  const ex = lx - cx;
  const ey = ly - cy;
  const ez = lz - cz;
  const dist2 = ex * ex + ey * ey + ez * ez;
  if (dist2 > radius * radius) return;
  const dist = Math.sqrt(dist2);
  if (radius - dist <= 1e-4) return;
  if (dist > 1e-8) {
    const scale = (radius - dist) / dist;
    lx += ex * scale;
    ly += ey * scale;
    lz += ez * scale;
  } else {
    const exits = [
      { pen: hx - lx, apply: (gap: number) => { lx = hx + gap; } },
      { pen: hx + lx, apply: (gap: number) => { lx = -hx - gap; } },
      { pen: hy - ly, apply: (gap: number) => { ly = hy + gap; } },
      { pen: hy + ly, apply: (gap: number) => { ly = -hy - gap; } },
      { pen: hz - lz, apply: (gap: number) => { lz = hz + gap; } },
      { pen: hz + lz, apply: (gap: number) => { lz = -hz - gap; } },
    ];
    let best = exits[0];
    for (const exit of exits) if (exit.pen < best.pen) best = exit;
    best.apply(radius);
  }
  const world = localToWorld(box, lx, ly, lz);
  sprite.x = world.x;
  sprite.y = world.y;
  sprite.z = world.z;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
