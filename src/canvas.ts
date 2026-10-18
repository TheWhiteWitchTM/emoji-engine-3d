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
  follow(target: (Vec3 & { yaw?: number }) | null): void;
  project(x: number, y: number, z: number): Projected;
  resize(width: number, height: number): void;
}

const PITCH_LIMIT = 1.5;
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

const BOX_VERT = `#version 300 es
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 i_origin;
layout(location = 3) in vec3 i_size;
layout(location = 4) in vec3 i_color;
layout(location = 5) in float i_yaw;

uniform mat4 u_viewProj;

out vec3 v_color;
out vec3 v_normal;

void main() {
  float c = cos(i_yaw);
  float s = sin(i_yaw);
  vec3 p = a_pos * i_size;
  vec3 rotated = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec3 n = vec3(c * a_normal.x + s * a_normal.z, a_normal.y, -s * a_normal.x + c * a_normal.z);
  v_normal = n;
  v_color = i_color;
  gl_Position = u_viewProj * vec4(i_origin + rotated, 1.0);
}
`;

const BOX_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in vec3 v_normal;
out vec4 fragColor;

void main() {
  vec3 n = normalize(v_normal);
  vec3 light = normalize(vec3(0.35, 0.85, 0.40));
  float shade = 0.22 + 0.78 * max(dot(n, light), 0.0);
  fragColor = vec4(v_color * shade, 1.0);
}
`;

const EMOJI_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 i_center;
layout(location = 2) in float i_size;
layout(location = 3) in vec4 i_uv;

uniform mat4 u_viewProj;
uniform vec3 u_right;
uniform vec3 u_up;

out vec2 v_uv;

void main() {
  vec3 world = i_center + u_right * (a_corner.x * i_size) + u_up * (a_corner.y * i_size);
  v_uv = mix(i_uv.xy, i_uv.zw, a_corner + vec2(0.5));
  gl_Position = u_viewProj * vec4(world, 1.0);
}
`;

const EMOJI_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 tex = texture(u_tex, v_uv);
  if (tex.a < 0.2) discard;
  fragColor = tex;
}
`;

/**
 * Pure drawing surface. One instanced draw covers every box in a layer, and
 * one instanced draw covers every emoji that shares an atlas page.
 */
export class Canvas implements CanvasContract {
  readonly element: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly camera: Camera = {
    eye: { x: 0, y: 2, z: 6 },
    yaw: 0,
    pitch: 0,
    fov: 60,
    near: 0.05,
    far: 300,
  };
  /** CSS pixel width. */
  width: number;
  /** CSS pixel height. */
  height: number;
  readonly pixelRatio: number;
  /** `#rrggbb` cleared before each `draw`. */
  clearColor: string;
  /** How far behind a follow target the eye sits. Default 6. */
  followDistance = 6;
  /** How far above a follow target the eye sits. Default 2.5. */
  followHeight = 2.5;

  private readonly layers = new Map<string, Drawable[]>();
  private followTarget: (Vec3 & { yaw?: number }) | null = null;
  private readonly proj = new Float32Array(16);
  private readonly view = new Float32Array(16);
  private readonly viewProj = new Float32Array(16);
  private readonly frameForward: Vec3 = { x: 0, y: 0, z: -1 };
  private readonly frameRight: Vec3 = { x: 1, y: 0, z: 0 };
  private readonly frame: DrawFrame;
  private readonly atlases: Atlas[] = [];
  private readonly boxProgram: WebGLProgram;
  private readonly emojiProgram: WebGLProgram;
  private readonly boxViewProj: WebGLUniformLocation;
  private readonly emojiViewProj: WebGLUniformLocation;
  private readonly emojiRight: WebGLUniformLocation;
  private readonly emojiUp: WebGLUniformLocation;
  private readonly emojiTex: WebGLUniformLocation;
  private readonly boxVao: WebGLVertexArrayObject;
  private readonly emojiVao: WebGLVertexArrayObject;
  private readonly boxInstance: WebGLBuffer;
  private readonly emojiInstance: WebGLBuffer;
  private boxData = new Float32Array(64 * 10);
  private emojiData = new Float32Array(64 * 8);

  /** Create a canvas and a WebGL2 context. Nothing is added to the document. */
  constructor(options: CanvasOptions = {}) {
    const element = document.createElement('canvas');
    const ratio = options.pixelRatio;
    this.pixelRatio = ratio !== undefined && ratio > 0 ? ratio : 1;
    this.clearColor = options.clear ?? '#1c2430';
    this.width = 800;
    this.height = 600;
    this.element = element;
    const gl = element.getContext('webgl2', {
      alpha: false,
      antialias: options.antialias !== false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is unavailable');
    this.gl = gl;
    this.resize(options.width ?? 800, options.height ?? 600);

    this.boxProgram = linkProgram(gl, BOX_VERT, BOX_FRAG);
    this.emojiProgram = linkProgram(gl, EMOJI_VERT, EMOJI_FRAG);
    this.boxViewProj = uniform(gl, this.boxProgram, 'u_viewProj');
    this.emojiViewProj = uniform(gl, this.emojiProgram, 'u_viewProj');
    this.emojiRight = uniform(gl, this.emojiProgram, 'u_right');
    this.emojiUp = uniform(gl, this.emojiProgram, 'u_up');
    this.emojiTex = uniform(gl, this.emojiProgram, 'u_tex');

    const mesh = cubeMesh();
    this.boxVao = vertexArray(gl);
    this.boxInstance = buffer(gl);
    gl.bindVertexArray(this.boxVao);
    const positions = buffer(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    attrib(gl, 0, 3, 0, 0);
    const normals = buffer(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, normals);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    attrib(gl, 1, 3, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxInstance);
    gl.bufferData(gl.ARRAY_BUFFER, this.boxData, gl.DYNAMIC_DRAW);
    const stride = 10 * 4;
    attrib(gl, 2, 3, stride, 0);
    attrib(gl, 3, 3, stride, 3 * 4);
    attrib(gl, 4, 3, stride, 6 * 4);
    attrib(gl, 5, 1, stride, 9 * 4);
    gl.vertexAttribDivisor(2, 1);
    gl.vertexAttribDivisor(3, 1);
    gl.vertexAttribDivisor(4, 1);
    gl.vertexAttribDivisor(5, 1);
    const indices = buffer(gl);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    this.emojiVao = vertexArray(gl);
    this.emojiInstance = buffer(gl);
    gl.bindVertexArray(this.emojiVao);
    const corners = buffer(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    attrib(gl, 0, 2, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.emojiInstance);
    gl.bufferData(gl.ARRAY_BUFFER, this.emojiData, gl.DYNAMIC_DRAW);
    const emojiStride = 8 * 4;
    attrib(gl, 1, 3, emojiStride, 0);
    attrib(gl, 2, 1, emojiStride, 3 * 4);
    attrib(gl, 3, 4, emojiStride, 4 * 4);
    gl.vertexAttribDivisor(1, 1);
    gl.vertexAttribDivisor(2, 1);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    this.frame = {
      gl,
      camera: this.camera,
      viewProj: this.viewProj,
      forward: this.frameForward,
      right: this.frameRight,
      up: WORLD_UP,
    };
  }

  /**
   * World forward for a yaw and pitch.
   * `forward(0, 0)` is `(0, 0, −1)`. `forward(π/2, 0)` is `(−1, 0, 0)`.
   */
  static forward(yaw: number, pitch = 0): Vec3 {
    const cp = Math.cos(pitch);
    return {
      x: -Math.sin(yaw) * cp,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cp,
    };
  }

  /**
   * Horizontal right for a yaw. `right(0)` is `(1, 0, 0)`.
   * This is `forward(yaw, 0) × (0, 1, 0)`, written as `(-z, 0, x)`.
   */
  static right(yaw: number): Vec3 {
    const ahead = Canvas.forward(yaw, 0);
    return { x: -ahead.z, y: 0, z: ahead.x };
  }

  /**
   * Draw one emoji billboard immediately, in world units, facing the camera.
   * `draw`, `project`, and this method apply `follow` first.
   */
  drawEmoji(emoji: string, x: number, y: number, z: number, size: number): void {
    this.syncFrame();
    if (!(size > 0) || !Number.isFinite(x + y + z)) return;
    const stamp = this.stamp(emoji);
    this.paintEmoji(stamp.atlas, [{ x, y, z, size, uv: stamp.uv }]);
  }

  /**
   * Add a drawable to a named layer, creating the layer on first use.
   * Layers paint in the order they were first created, back to front.
   * An empty layer keeps its place. Adding a drawable that is already
   * on the canvas moves it. Emoji and the terminal glass are ordered later:
   * emoji after every solid, far to near, and the glass after the world.
   */
  add(drawable: Drawable, layer = 'default'): void {
    this.remove(drawable);
    let list = this.layers.get(layer);
    if (!list) {
      list = [];
      this.layers.set(layer, list);
    }
    list.push(drawable);
  }

  /** Remove a drawable from whichever layer holds it. */
  remove(drawable: Drawable): void {
    for (const list of this.layers.values()) {
      const index = list.indexOf(drawable);
      if (index < 0) continue;
      list.splice(index, 1);
      return;
    }
  }

  /** Apply `follow`, clear, paint every layer, then the glass overlay. */
  draw(): void {
    this.syncFrame();
    this.clear();
    const gl = this.gl;
    const boxes: SolidBox[] = [];
    const emojis: EmojiBillboard[] = [];
    const glasses: GlassPanel[] = [];
    const custom: Drawable[] = [];

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);

    for (const list of this.layers.values()) {
      boxes.length = 0;
      custom.length = 0;
      for (const drawable of list) {
        if (isDead(drawable)) continue;
        if (isBox(drawable)) boxes.push(drawable);
        else if (isEmoji(drawable)) emojis.push(drawable);
        else if (isGlass(drawable)) glasses.push(drawable);
        else custom.push(drawable);
      }
      if (boxes.length) this.paintBoxes(boxes);
      for (const drawable of custom) drawable.draw(this.frame);
    }

    if (emojis.length) this.paintEmojiLayer(emojis);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const glass of glasses) glass.draw(this.frame);
  }

  /** Clear color and depth. Drawables stay registered. */
  clear(): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.element.width, this.element.height);
    const [r, g, b] = parseColor(this.clearColor);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /**
   * Place the eye. Omitted yaw and pitch stay as they are.
   * A follow target replaces the eye, yaw, and pitch on the next `draw`.
   */
  setCamera(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    this.camera.eye.x = x;
    this.camera.eye.y = y;
    this.camera.eye.z = z;
    if (yaw !== undefined) this.camera.yaw = yaw;
    if (pitch !== undefined) this.camera.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /**
   * Keep the eye behind `target` on later draws.
   * Pass null to stop. Distance and height are `followDistance` and `followHeight`.
   * The heading is `target.yaw`, or 0 when yaw is omitted.
   */
  follow(target: (Vec3 & { yaw?: number }) | null): void {
    this.followTarget = target;
  }

  /**
   * Project a world point with the camera `draw` would use, including `follow`.
   * `x` and `y` are normalized device coordinates.
   */
  project(x: number, y: number, z: number): Projected {
    this.syncFrame();
    const clip = transformPoint(this.viewProj, x, y, z);
    if (clip.w <= 1e-8) {
      return { x: 0, y: 0, z: 1, behind: true };
    }
    return {
      x: clip.x / clip.w,
      y: clip.y / clip.w,
      z: clip.z / clip.w,
      behind: false,
    };
  }

  /** Set the CSS size. The drawing buffer is that size times `pixelRatio`. */
  resize(width: number, height: number): void {
    const w = width > 0 ? width : 1;
    const h = height > 0 ? height : 1;
    this.width = w;
    this.height = h;
    this.element.width = Math.max(1, Math.round(w * this.pixelRatio));
    this.element.height = Math.max(1, Math.round(h * this.pixelRatio));
    this.element.style.width = `${w}px`;
    this.element.style.height = `${h}px`;
  }

  private syncFrame(): void {
    this.applyFollow();
    const aspect = this.element.height > 0 ? this.element.width / this.element.height : 1;
    const fov = this.camera.fov > 1 && this.camera.fov < 179 ? this.camera.fov : 60;
    let near = this.camera.near;
    let far = this.camera.far;
    if (!(near > 0) || !(far > near)) {
      near = 0.05;
      far = 300;
    }
    const pitch = clamp(this.camera.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    const forward = Canvas.forward(this.camera.yaw, pitch);
    const right = Canvas.right(this.camera.yaw);
    perspective(this.proj, fov, aspect, near, far);
    lookAt(this.view, this.camera.eye, forward, WORLD_UP);
    multiply(this.viewProj, this.proj, this.view);
    this.frameForward.x = forward.x;
    this.frameForward.y = forward.y;
    this.frameForward.z = forward.z;
    this.frameRight.x = right.x;
    this.frameRight.y = right.y;
    this.frameRight.z = right.z;
  }

  private applyFollow(): void {
    const target = this.followTarget;
    if (!target) return;
    const yaw = Number.isFinite(target.yaw) ? target.yaw ?? 0 : 0;
    const ahead = Canvas.forward(yaw, 0);
    const eye = this.camera.eye;
    eye.x = target.x - ahead.x * this.followDistance;
    eye.y = target.y + this.followHeight;
    eye.z = target.z - ahead.z * this.followDistance;
    const lx = target.x - eye.x;
    const ly = target.y - eye.y;
    const lz = target.z - eye.z;
    const len = Math.hypot(lx, ly, lz);
    if (len < 1e-8) {
      this.camera.yaw = yaw;
      this.camera.pitch = 0;
      return;
    }
    const horiz = Math.hypot(lx, lz);
    this.camera.yaw = horiz < 1e-6 ? yaw : Math.atan2(-lx, -lz);
    this.camera.pitch = clamp(Math.asin(clamp(ly / len, -1, 1)), -PITCH_LIMIT, PITCH_LIMIT);
  }

  private paintBoxes(list: SolidBox[]): void {
    const gl = this.gl;
    const data = this.grow(this.boxData, list.length * 10);
    this.boxData = data;
    let cursor = 0;
    let count = 0;
    for (const box of list) {
      if (!Number.isFinite(box.x + box.y + box.z + box.w + box.h + box.d + box.yaw)) continue;
      const [r, g, b] = parseColor(box.color);
      data[cursor] = box.x;
      data[cursor + 1] = box.y;
      data[cursor + 2] = box.z;
      data[cursor + 3] = Math.abs(box.w);
      data[cursor + 4] = Math.abs(box.h);
      data[cursor + 5] = Math.abs(box.d);
      data[cursor + 6] = r;
      data[cursor + 7] = g;
      data[cursor + 8] = b;
      data[cursor + 9] = box.yaw;
      cursor += 10;
      count += 1;
    }
    if (!count) return;
    gl.useProgram(this.boxProgram);
    gl.bindVertexArray(this.boxVao);
    gl.uniformMatrix4fv(this.boxViewProj, false, this.viewProj);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxInstance);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 10), gl.DYNAMIC_DRAW);
    gl.drawElementsInstanced(gl.TRIANGLES, CUBE_INDEX_COUNT, gl.UNSIGNED_SHORT, 0, count);
  }

  private paintEmojiLayer(list: EmojiBillboard[]): void {
    const eye = this.camera.eye;
    const visible = list.filter((sprite) => sprite.size > 0 && Number.isFinite(sprite.x + sprite.y + sprite.z));
    visible.sort((a, b) => {
      const da = (a.x - eye.x) ** 2 + (a.y - eye.y) ** 2 + (a.z - eye.z) ** 2;
      const db = (b.x - eye.x) ** 2 + (b.y - eye.y) ** 2 + (b.z - eye.z) ** 2;
      return db - da;
    });
    const groups = new Map<Atlas, EmojiInstance[]>();
    for (const sprite of visible) {
      const stamp = this.stamp(sprite.emoji);
      let group = groups.get(stamp.atlas);
      if (!group) {
        group = [];
        groups.set(stamp.atlas, group);
      }
      group.push({ x: sprite.x, y: sprite.y, z: sprite.z, size: sprite.size, uv: stamp.uv });
    }
    for (const [atlas, group] of groups) this.paintEmoji(atlas, group);
    this.gl.depthMask(true);
    this.gl.disable(this.gl.BLEND);
  }

  private paintEmoji(atlas: Atlas, group: EmojiInstance[]): void {
    if (!group.length) return;
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const data = this.grow(this.emojiData, group.length * 8);
    this.emojiData = data;
    let cursor = 0;
    for (const sprite of group) {
      data[cursor] = sprite.x;
      data[cursor + 1] = sprite.y;
      data[cursor + 2] = sprite.z;
      data[cursor + 3] = sprite.size;
      data[cursor + 4] = sprite.uv.u0;
      data[cursor + 5] = sprite.uv.v0;
      data[cursor + 6] = sprite.uv.u1;
      data[cursor + 7] = sprite.uv.v1;
      cursor += 8;
    }
    const texture = atlas.upload(gl);
    gl.useProgram(this.emojiProgram);
    gl.bindVertexArray(this.emojiVao);
    gl.uniformMatrix4fv(this.emojiViewProj, false, this.viewProj);
    gl.uniform3f(this.emojiRight, this.frameRight.x, this.frameRight.y, this.frameRight.z);
    gl.uniform3f(this.emojiUp, WORLD_UP.x, WORLD_UP.y, WORLD_UP.z);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.emojiTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.emojiInstance);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, group.length * 8), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, group.length);
  }

  private stamp(emoji: string): { atlas: Atlas; uv: GlyphUv } {
    for (const atlas of this.atlases) {
      const uv = atlas.get(emoji);
      if (uv) return { atlas, uv };
    }
    let atlas = this.atlases[this.atlases.length - 1];
    if (!atlas || atlas.full) {
      atlas = new Atlas();
      this.atlases.push(atlas);
    }
    return { atlas, uv: atlas.stamp(emoji) };
  }

  private grow(data: Float32Array<ArrayBuffer>, floats: number): Float32Array<ArrayBuffer> {
    if (data.length >= floats) return data;
    let length = data.length;
    while (length < floats) length *= 2;
    return new Float32Array(new ArrayBuffer(length * 4));
  }
}

interface GlyphUv {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface EmojiInstance {
  x: number;
  y: number;
  z: number;
  size: number;
  uv: GlyphUv;
}

/** One page of rasterized emoji. Glyphs are stamped once and reused. */
class Atlas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly map = new Map<string, GlyphUv>();
  private readonly size = 1024;
  private readonly cell = 64;
  private next = 0;
  private texture: WebGLTexture | null = null;
  private dirty = true;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = this.size;
    canvas.height = this.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
  }

  get full(): boolean {
    return this.next >= (this.size / this.cell) ** 2;
  }

  get(emoji: string): GlyphUv | undefined {
    return this.map.get(emoji);
  }

  stamp(emoji: string): GlyphUv {
    const found = this.map.get(emoji);
    if (found) return found;
    const columns = this.size / this.cell;
    const index = this.next;
    this.next += 1;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * this.cell;
    const y = row * this.cell;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, this.cell, this.cell);
    ctx.clip();
    ctx.clearRect(x, y, this.cell, this.cell);
    ctx.font = `${Math.floor(this.cell * 0.78)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x + this.cell / 2, y + this.cell / 2 + this.cell * 0.04);
    ctx.restore();
    this.dirty = true;
    const inset = 0.5 / this.size;
    const uv = {
      u0: (column * this.cell) / this.size + inset,
      u1: ((column + 1) * this.cell) / this.size - inset,
      v1: 1 - (row * this.cell) / this.size - inset,
      v0: 1 - ((row + 1) * this.cell) / this.size + inset,
    };
    this.map.set(emoji, uv);
    return uv;
  }

  upload(gl: WebGL2RenderingContext): WebGLTexture {
    if (!this.texture) {
      const texture = gl.createTexture();
      if (!texture) throw new Error('texture create failed');
      this.texture = texture;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.dirty = true;
    }
    if (this.dirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      this.dirty = false;
    }
    return this.texture;
  }
}

const QUAD = new Float32Array([
  -0.5, -0.5,
  0.5, -0.5,
  0.5, 0.5,
  -0.5, -0.5,
  0.5, 0.5,
  -0.5, 0.5,
]);

interface CubeMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
}

const CUBE = buildCube();
const CUBE_INDEX_COUNT = CUBE.indices.length;

function cubeMesh(): CubeMesh {
  return CUBE;
}

/**
 * Unit cube, half-extent 0.5, faces wound counter-clockwise from the outside.
 * Each face's tangent and bitangent are built so the geometric normal matches
 * the outward axis. The check runs when this module loads.
 */
function buildCube(): CubeMesh {
  const normals: Vec3[] = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ];
  const positions: number[] = [];
  const normalData: number[] = [];
  const indices: number[] = [];
  for (const normal of normals) {
    const tangent = Math.abs(normal.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const bitangent = cross(normal, tangent);
    const base = positions.length / 3;
    const corners = [
      add(scale(tangent, -0.5), scale(bitangent, -0.5)),
      add(scale(tangent, 0.5), scale(bitangent, -0.5)),
      add(scale(tangent, 0.5), scale(bitangent, 0.5)),
      add(scale(tangent, -0.5), scale(bitangent, 0.5)),
    ];
    const edge1 = sub(corners[1], corners[0]);
    const edge2 = sub(corners[2], corners[0]);
    const wound = cross(edge1, edge2);
    if (dot(wound, normal) <= 0) throw new Error('cube face is wound inward');
    for (const corner of corners) {
      const point = add(corner, scale(normal, 0.5));
      positions.push(point.x, point.y, point.z);
      normalData.push(normal.x, normal.y, normal.z);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normalData),
    indices: new Uint16Array(indices),
  };
}

function isBox(drawable: Drawable): drawable is SolidBox {
  return (drawable as SolidBox).batch === 'box';
}

function isEmoji(drawable: Drawable): drawable is EmojiBillboard {
  return (drawable as EmojiBillboard).batch === 'emoji';
}

function isGlass(drawable: Drawable): drawable is GlassPanel {
  return (drawable as GlassPanel).batch === 'terminal';
}

function isDead(drawable: Drawable): boolean {
  if (!('alive' in drawable)) return false;
  return (drawable as { alive?: boolean }).alive === false;
}

function parseColor(input: string): [number, number, number] {
  const text = input.trim();
  const long = /^#([0-9a-f]{6})$/i.exec(text);
  if (long) {
    const value = Number.parseInt(long[1], 16);
    return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
  }
  const short = /^#([0-9a-f]{3})$/i.exec(text);
  if (short) {
    const value = Number.parseInt(short[1], 16);
    return [((value >> 8) & 15) / 15, ((value >> 4) & 15) / 15, (value & 15) / 15];
  }
  return [0.78, 0.78, 0.82];
}

function perspective(out: Float32Array, fovDeg: number, aspect: number, near: number, far: number): void {
  out.fill(0);
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

function lookAt(out: Float32Array, eye: Vec3, forward: Vec3, up: Vec3): void {
  const f = normalize(forward, { x: 0, y: 0, z: -1 });
  let right = cross(f, up);
  if (Math.hypot(right.x, right.y, right.z) < 1e-8) {
    const fallback = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    right = cross(f, fallback);
  }
  right = normalize(right, { x: 1, y: 0, z: 0 });
  const lifted = cross(right, f);
  out.fill(0);
  out[0] = right.x;
  out[1] = lifted.x;
  out[2] = -f.x;
  out[4] = right.y;
  out[5] = lifted.y;
  out[6] = -f.y;
  out[8] = right.z;
  out[9] = lifted.z;
  out[10] = -f.z;
  out[12] = -dot(right, eye);
  out[13] = -dot(lifted, eye);
  out[14] = dot(f, eye);
  out[15] = 1;
}

function multiply(out: Float32Array, a: Float32Array, b: Float32Array): void {
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}

function transformPoint(m: Float32Array, x: number, y: number, z: number): { x: number; y: number; z: number; w: number } {
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    z: m[2] * x + m[6] * y + m[10] * z + m[14],
    w: m[3] * x + m[7] * y + m[11] * z + m[15],
  };
}

function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('program create failed');
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    throw new Error(`program link failed: ${log}`);
  }
  return program;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('shader create failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const found = gl.getUniformLocation(program, name);
  if (!found) throw new Error(`missing uniform ${name}`);
  return found;
}

function buffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const value = gl.createBuffer();
  if (!value) throw new Error('buffer create failed');
  return value;
}

function vertexArray(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const value = gl.createVertexArray();
  if (!value) throw new Error('vertex array create failed');
  return value;
}

function attrib(
  gl: WebGL2RenderingContext,
  location: number,
  size: number,
  stride: number,
  offset: number,
): void {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(v: Vec3, fallback: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return fallback;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
