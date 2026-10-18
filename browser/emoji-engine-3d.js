"use strict";
var EmojiEngine3D = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // dist/index.js
  var index_exports = {};
  __export(index_exports, {
    Canvas: () => Canvas,
    Engine: () => Engine,
    Terminal: () => Terminal,
    Utilities: () => Utilities
  });

  // dist/canvas.js
  var PITCH_LIMIT = 1.5;
  var WORLD_UP = { x: 0, y: 1, z: 0 };
  var BOX_VERT = `#version 300 es
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
  var BOX_FRAG = `#version 300 es
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
  var EMOJI_VERT = `#version 300 es
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
  var EMOJI_FRAG = `#version 300 es
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
  var Canvas = class _Canvas {
    element;
    gl;
    camera = {
      eye: { x: 0, y: 2, z: 6 },
      yaw: 0,
      pitch: 0,
      fov: 60,
      near: 0.05,
      far: 300
    };
    /** CSS pixel width. */
    width;
    /** CSS pixel height. */
    height;
    pixelRatio;
    /** `#rrggbb` cleared before each `draw`. */
    clearColor;
    /** How far behind a follow target the eye sits. Default 6. */
    followDistance = 6;
    /** How far above a follow target the eye sits. Default 2.5. */
    followHeight = 2.5;
    layers = /* @__PURE__ */ new Map();
    followTarget = null;
    proj = new Float32Array(16);
    view = new Float32Array(16);
    viewProj = new Float32Array(16);
    frameForward = { x: 0, y: 0, z: -1 };
    frameRight = { x: 1, y: 0, z: 0 };
    frame;
    atlases = [];
    boxProgram;
    emojiProgram;
    boxViewProj;
    emojiViewProj;
    emojiRight;
    emojiUp;
    emojiTex;
    boxVao;
    emojiVao;
    boxInstance;
    emojiInstance;
    boxData = new Float32Array(64 * 10);
    emojiData = new Float32Array(64 * 8);
    /** Create a canvas and a WebGL2 context. Nothing is added to the document. */
    constructor(options = {}) {
      const element = document.createElement("canvas");
      const ratio = options.pixelRatio;
      this.pixelRatio = ratio !== void 0 && ratio > 0 ? ratio : 1;
      this.clearColor = options.clear ?? "#1c2430";
      this.width = 800;
      this.height = 600;
      this.element = element;
      const gl = element.getContext("webgl2", {
        alpha: false,
        antialias: options.antialias !== false,
        depth: true,
        stencil: false,
        powerPreference: "high-performance"
      });
      if (!gl)
        throw new Error("WebGL2 is unavailable");
      this.gl = gl;
      this.resize(options.width ?? 800, options.height ?? 600);
      this.boxProgram = linkProgram(gl, BOX_VERT, BOX_FRAG);
      this.emojiProgram = linkProgram(gl, EMOJI_VERT, EMOJI_FRAG);
      this.boxViewProj = uniform(gl, this.boxProgram, "u_viewProj");
      this.emojiViewProj = uniform(gl, this.emojiProgram, "u_viewProj");
      this.emojiRight = uniform(gl, this.emojiProgram, "u_right");
      this.emojiUp = uniform(gl, this.emojiProgram, "u_up");
      this.emojiTex = uniform(gl, this.emojiProgram, "u_tex");
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
        up: WORLD_UP
      };
    }
    /**
     * World forward for a yaw and pitch.
     * `forward(0, 0)` is `(0, 0, −1)`. `forward(π/2, 0)` is `(−1, 0, 0)`.
     */
    static forward(yaw, pitch = 0) {
      const cp = Math.cos(pitch);
      return {
        x: -Math.sin(yaw) * cp,
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * cp
      };
    }
    /**
     * Horizontal right for a yaw. `right(0)` is `(1, 0, 0)`.
     * This is `forward(yaw, 0) × (0, 1, 0)`, written as `(-z, 0, x)`.
     */
    static right(yaw) {
      const ahead = _Canvas.forward(yaw, 0);
      return { x: -ahead.z, y: 0, z: ahead.x };
    }
    /**
     * Draw one emoji billboard immediately, in world units, facing the camera.
     * `draw`, `project`, and this method apply `follow` first.
     */
    drawEmoji(emoji, x, y, z, size) {
      this.syncFrame();
      if (!(size > 0) || !Number.isFinite(x + y + z))
        return;
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
    add(drawable, layer = "default") {
      this.remove(drawable);
      let list = this.layers.get(layer);
      if (!list) {
        list = [];
        this.layers.set(layer, list);
      }
      list.push(drawable);
    }
    /** Remove a drawable from whichever layer holds it. */
    remove(drawable) {
      for (const list of this.layers.values()) {
        const index = list.indexOf(drawable);
        if (index < 0)
          continue;
        list.splice(index, 1);
        return;
      }
    }
    /** Apply `follow`, clear, paint every layer, then the glass overlay. */
    draw() {
      this.syncFrame();
      this.clear();
      const gl = this.gl;
      const boxes = [];
      const emojis = [];
      const glasses = [];
      const custom = [];
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
          if (isDead(drawable))
            continue;
          if (isBox(drawable))
            boxes.push(drawable);
          else if (isEmoji(drawable))
            emojis.push(drawable);
          else if (isGlass(drawable))
            glasses.push(drawable);
          else
            custom.push(drawable);
        }
        if (boxes.length)
          this.paintBoxes(boxes);
        for (const drawable of custom)
          drawable.draw(this.frame);
      }
      if (emojis.length)
        this.paintEmojiLayer(emojis);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const glass of glasses)
        glass.draw(this.frame);
    }
    /** Clear color and depth. Drawables stay registered. */
    clear() {
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
    setCamera(x, y, z, yaw, pitch) {
      this.camera.eye.x = x;
      this.camera.eye.y = y;
      this.camera.eye.z = z;
      if (yaw !== void 0)
        this.camera.yaw = yaw;
      if (pitch !== void 0)
        this.camera.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    }
    /**
     * Keep the eye behind `target` on later draws.
     * Pass null to stop. Distance and height are `followDistance` and `followHeight`.
     * The heading is `target.yaw`, or 0 when yaw is omitted.
     */
    follow(target) {
      this.followTarget = target;
    }
    /**
     * Project a world point with the camera `draw` would use, including `follow`.
     * `x` and `y` are normalized device coordinates.
     */
    project(x, y, z) {
      this.syncFrame();
      const clip = transformPoint(this.viewProj, x, y, z);
      if (clip.w <= 1e-8) {
        return { x: 0, y: 0, z: 1, behind: true };
      }
      return {
        x: clip.x / clip.w,
        y: clip.y / clip.w,
        z: clip.z / clip.w,
        behind: false
      };
    }
    /** Set the CSS size. The drawing buffer is that size times `pixelRatio`. */
    resize(width, height) {
      const w = width > 0 ? width : 1;
      const h = height > 0 ? height : 1;
      this.width = w;
      this.height = h;
      this.element.width = Math.max(1, Math.round(w * this.pixelRatio));
      this.element.height = Math.max(1, Math.round(h * this.pixelRatio));
      this.element.style.width = `${w}px`;
      this.element.style.height = `${h}px`;
    }
    syncFrame() {
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
      const forward = _Canvas.forward(this.camera.yaw, pitch);
      const right = _Canvas.right(this.camera.yaw);
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
    applyFollow() {
      const target = this.followTarget;
      if (!target)
        return;
      const yaw = Number.isFinite(target.yaw) ? target.yaw ?? 0 : 0;
      const ahead = _Canvas.forward(yaw, 0);
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
    paintBoxes(list) {
      const gl = this.gl;
      const data = this.grow(this.boxData, list.length * 10);
      this.boxData = data;
      let cursor = 0;
      let count = 0;
      for (const box of list) {
        if (!Number.isFinite(box.x + box.y + box.z + box.w + box.h + box.d + box.yaw))
          continue;
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
      if (!count)
        return;
      gl.useProgram(this.boxProgram);
      gl.bindVertexArray(this.boxVao);
      gl.uniformMatrix4fv(this.boxViewProj, false, this.viewProj);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.boxInstance);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 10), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, CUBE_INDEX_COUNT, gl.UNSIGNED_SHORT, 0, count);
    }
    paintEmojiLayer(list) {
      const eye = this.camera.eye;
      const visible = list.filter((sprite) => sprite.size > 0 && Number.isFinite(sprite.x + sprite.y + sprite.z));
      visible.sort((a, b) => {
        const da = (a.x - eye.x) ** 2 + (a.y - eye.y) ** 2 + (a.z - eye.z) ** 2;
        const db = (b.x - eye.x) ** 2 + (b.y - eye.y) ** 2 + (b.z - eye.z) ** 2;
        return db - da;
      });
      const groups = /* @__PURE__ */ new Map();
      for (const sprite of visible) {
        const stamp = this.stamp(sprite.emoji);
        let group = groups.get(stamp.atlas);
        if (!group) {
          group = [];
          groups.set(stamp.atlas, group);
        }
        group.push({ x: sprite.x, y: sprite.y, z: sprite.z, size: sprite.size, uv: stamp.uv });
      }
      for (const [atlas, group] of groups)
        this.paintEmoji(atlas, group);
      this.gl.depthMask(true);
      this.gl.disable(this.gl.BLEND);
    }
    paintEmoji(atlas, group) {
      if (!group.length)
        return;
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
    stamp(emoji) {
      for (const atlas2 of this.atlases) {
        const uv = atlas2.get(emoji);
        if (uv)
          return { atlas: atlas2, uv };
      }
      let atlas = this.atlases[this.atlases.length - 1];
      if (!atlas || atlas.full) {
        atlas = new Atlas();
        this.atlases.push(atlas);
      }
      return { atlas, uv: atlas.stamp(emoji) };
    }
    grow(data, floats) {
      if (data.length >= floats)
        return data;
      let length = data.length;
      while (length < floats)
        length *= 2;
      return new Float32Array(new ArrayBuffer(length * 4));
    }
  };
  var Atlas = class {
    canvas;
    ctx;
    map = /* @__PURE__ */ new Map();
    size = 1024;
    cell = 64;
    next = 0;
    texture = null;
    dirty = true;
    constructor() {
      const canvas = document.createElement("canvas");
      canvas.width = this.size;
      canvas.height = this.size;
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw new Error("2D canvas context is unavailable");
      this.canvas = canvas;
      this.ctx = ctx;
    }
    get full() {
      return this.next >= (this.size / this.cell) ** 2;
    }
    get(emoji) {
      return this.map.get(emoji);
    }
    stamp(emoji) {
      const found = this.map.get(emoji);
      if (found)
        return found;
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
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, x + this.cell / 2, y + this.cell / 2 + this.cell * 0.04);
      ctx.restore();
      this.dirty = true;
      const inset = 0.5 / this.size;
      const uv = {
        u0: column * this.cell / this.size + inset,
        u1: (column + 1) * this.cell / this.size - inset,
        v1: 1 - row * this.cell / this.size - inset,
        v0: 1 - (row + 1) * this.cell / this.size + inset
      };
      this.map.set(emoji, uv);
      return uv;
    }
    upload(gl) {
      if (!this.texture) {
        const texture = gl.createTexture();
        if (!texture)
          throw new Error("texture create failed");
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
  };
  var QUAD = new Float32Array([
    -0.5,
    -0.5,
    0.5,
    -0.5,
    0.5,
    0.5,
    -0.5,
    -0.5,
    0.5,
    0.5,
    -0.5,
    0.5
  ]);
  var CUBE = buildCube();
  var CUBE_INDEX_COUNT = CUBE.indices.length;
  function cubeMesh() {
    return CUBE;
  }
  function buildCube() {
    const normals = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 }
    ];
    const positions = [];
    const normalData = [];
    const indices = [];
    for (const normal of normals) {
      const tangent = Math.abs(normal.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const bitangent = cross(normal, tangent);
      const base = positions.length / 3;
      const corners = [
        add(scale(tangent, -0.5), scale(bitangent, -0.5)),
        add(scale(tangent, 0.5), scale(bitangent, -0.5)),
        add(scale(tangent, 0.5), scale(bitangent, 0.5)),
        add(scale(tangent, -0.5), scale(bitangent, 0.5))
      ];
      const edge1 = sub(corners[1], corners[0]);
      const edge2 = sub(corners[2], corners[0]);
      const wound = cross(edge1, edge2);
      if (dot(wound, normal) <= 0)
        throw new Error("cube face is wound inward");
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
      indices: new Uint16Array(indices)
    };
  }
  function isBox(drawable) {
    return drawable.batch === "box";
  }
  function isEmoji(drawable) {
    return drawable.batch === "emoji";
  }
  function isGlass(drawable) {
    return drawable.batch === "terminal";
  }
  function isDead(drawable) {
    if (!("alive" in drawable))
      return false;
    return drawable.alive === false;
  }
  function parseColor(input) {
    const text = input.trim();
    const long = /^#([0-9a-f]{6})$/i.exec(text);
    if (long) {
      const value = Number.parseInt(long[1], 16);
      return [(value >> 16) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
    }
    const short = /^#([0-9a-f]{3})$/i.exec(text);
    if (short) {
      const value = Number.parseInt(short[1], 16);
      return [(value >> 8 & 15) / 15, (value >> 4 & 15) / 15, (value & 15) / 15];
    }
    return [0.78, 0.78, 0.82];
  }
  function perspective(out, fovDeg, aspect, near, far) {
    out.fill(0);
    const f = 1 / Math.tan(fovDeg * Math.PI / 360);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = 2 * far * near / (near - far);
  }
  function lookAt(out, eye, forward, up) {
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
  function multiply(out, a, b) {
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
  function transformPoint(m, x, y, z) {
    return {
      x: m[0] * x + m[4] * y + m[8] * z + m[12],
      y: m[1] * x + m[5] * y + m[9] * z + m[13],
      z: m[2] * x + m[6] * y + m[10] * z + m[14],
      w: m[3] * x + m[7] * y + m[11] * z + m[15]
    };
  }
  function linkProgram(gl, vertSrc, fragSrc) {
    const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    if (!program)
      throw new Error("program create failed");
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "";
      throw new Error(`program link failed: ${log}`);
    }
    return program;
  }
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader)
      throw new Error("shader create failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? "";
      gl.deleteShader(shader);
      throw new Error(`shader compile failed: ${log}`);
    }
    return shader;
  }
  function uniform(gl, program, name) {
    const found = gl.getUniformLocation(program, name);
    if (!found)
      throw new Error(`missing uniform ${name}`);
    return found;
  }
  function buffer(gl) {
    const value = gl.createBuffer();
    if (!value)
      throw new Error("buffer create failed");
    return value;
  }
  function vertexArray(gl) {
    const value = gl.createVertexArray();
    if (!value)
      throw new Error("vertex array create failed");
    return value;
  }
  function attrib(gl, location, size, stride, offset) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  }
  function clamp(value, min, max) {
    if (value < min)
      return min;
    if (value > max)
      return max;
    return value;
  }
  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }
  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }
  function scale(a, s) {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
  }
  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  function normalize(v, fallback) {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-8)
      return fallback;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  // dist/terminal.js
  var ANSI = [
    "#000000",
    "#aa0000",
    "#00aa00",
    "#aa5500",
    "#0000aa",
    "#aa00aa",
    "#00aaaa",
    "#aaaaaa",
    "#555555",
    "#ff5555",
    "#55ff55",
    "#ffff55",
    "#5555ff",
    "#ff55ff",
    "#55ffff",
    "#ffffff"
  ];
  var GLASS_VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
uniform vec2 u_resolution;
out vec2 v_uv;
void main() {
  vec2 ndc = vec2(
    (a_pos.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (a_pos.y / u_resolution.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = a_uv;
}
`;
  var GLASS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_tex, v_uv);
}
`;
  var Terminal = class {
    batch = "terminal";
    cols;
    rows;
    canvas;
    cursor = { col: 0, row: 0 };
    /** Foreground index used by `write` and `put`. Default 15. */
    fg = 15;
    /** Background index used by `write` and `put`. Default null. */
    bg = null;
    /** Shifts foreground indexes 0–7 to 8–15. Default false. */
    bright = false;
    /** Bold face for later cells. Default false. */
    bold = false;
    /** Paper behind cells with no background. Default null. */
    screenColor = null;
    /** False hides the caret. Default true. Read on the next draw. */
    cursorLit = true;
    /** Caret color. Default `#9ee`. Read on the next draw. */
    cursorColor = "#9ee";
    /** Caret shape. Default `underline`. Read on the next draw. */
    cursorStyle = "underline";
    cellWidth;
    cellHeight;
    cells;
    bitmap;
    bitmapCtx;
    keys = /* @__PURE__ */ new Set();
    keyHandlers = [];
    state = "ground";
    params = [];
    current = null;
    privateCsi = false;
    hold = 0;
    dirty = true;
    uploaded = false;
    cursorKey = "";
    program = null;
    resolutionLoc = null;
    texLoc = null;
    texture = null;
    quad = null;
    vao = null;
    quadW = -1;
    quadH = -1;
    /** Create the buffer and add it to `canvas`. The element is not inserted. */
    constructor(options = {}) {
      this.cols = Math.max(0, options.cols ?? 40);
      this.rows = Math.max(0, options.rows ?? 12);
      this.cellWidth = options.cellWidth ?? 16;
      this.cellHeight = options.cellHeight ?? 20;
      this.canvas = options.canvas ?? new Canvas({
        width: Math.max(1, this.cols * this.cellWidth),
        height: Math.max(1, this.rows * this.cellHeight)
      });
      this.cells = [];
      this.fillBlank();
      const bitmap = document.createElement("canvas");
      const ctx = bitmap.getContext("2d");
      if (!ctx)
        throw new Error("2D canvas context is unavailable");
      this.bitmap = bitmap;
      this.bitmapCtx = ctx;
      if (options.background !== void 0)
        this.applyBackground(options.background);
      if (options.showCursor === false)
        this.cursorLit = false;
      if (typeof options.cursorColor === "string" && options.cursorColor)
        this.cursorColor = options.cursorColor;
      if (isCursorStyle(options.cursorStyle))
        this.cursorStyle = options.cursorStyle;
      this.canvas.add(this, options.layer ?? "terminal");
      this.armKeys();
      this.flush();
    }
    /**
     * Write text at the cursor.
     * `\n`, vertical tab, and form feed return to column 0 and move down.
     * The buffer wraps and scrolls. A CSI or OSC sequence is consumed.
     */
    write(text) {
      this.beginFrame();
      for (const ch of text)
        this.feed(ch);
      this.endFrame();
    }
    /**
     * Feed one code point through the same parser as `write`, then redraw.
     * Extra code points in `ch` are ignored.
     */
    put(ch) {
      const first = Array.from(ch)[0];
      if (!first)
        return;
      this.feed(first);
      this.flush();
    }
    /** Replace one cell. A string is stored as-is and is not parsed. Out of range is ignored. */
    set(col, row, value) {
      if (!this.inRange(col, row))
        return;
      this.cells[row][col] = typeof value === "string" ? this.ink(value) : copyCell(value);
      this.dirty = true;
      this.flush();
    }
    /** Copy one cell. Out of range returns a space. */
    get(col, row) {
      if (!this.inRange(col, row))
        return { ch: " " };
      return copyCell(this.cells[row][col]);
    }
    /** Fill the buffer with spaces and move the cursor home. The pen is kept. */
    clear() {
      this.fillBlank();
      this.cursor.col = 0;
      this.cursor.row = 0;
      this.dirty = true;
      this.flush();
    }
    /**
     * Set the color indexes for later `write` and `put` calls.
     * An omitted background is kept. An index outside 0–15 is ignored.
     * Null clears that channel to the default.
     */
    color(fg, bg) {
      if (fg === null || fg >= 0 && fg <= 15)
        this.fg = fg;
      if (bg === void 0)
        return;
      if (bg === null || bg >= 0 && bg <= 15)
        this.bg = bg;
    }
    /**
     * Paper behind cells with no background of their own.
     * A number is a palette index. A string is CSS. null is transparent.
     * An out-of-range index is ignored.
     */
    background(color) {
      if (typeof color === "number" && !(color >= 0 && color <= 15))
        return;
      this.applyBackground(color);
      this.dirty = true;
      this.flush();
    }
    /** `underline` is the bottom bar, `bar` is a vertical beam, `block` fills the cell. */
    setCursorStyle(style) {
      if (!isCursorStyle(style))
        return;
      this.cursorStyle = style;
    }
    /** Hold redraws. Calls may nest. */
    beginFrame() {
      this.hold += 1;
    }
    /** Release one `beginFrame`. The outermost call redraws if the buffer changed. */
    endFrame() {
      if (this.hold > 0)
        this.hold -= 1;
      if (this.hold === 0 && this.dirty)
        this.flush();
    }
    /** Keydown subscription. `key` is `KeyboardEvent.key`. */
    onKey(handler) {
      this.keyHandlers.push(handler);
    }
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key) {
      return this.keys.has(key);
    }
    /**
     * Paint the grid in screen space, top-left of the viewport.
     * The camera is ignored, and the glass is drawn after the world.
     */
    draw(frame) {
      if (this.cols < 1 || this.rows < 1 || this.cellWidth <= 0 || this.cellHeight <= 0)
        return;
      const cursorKey = `${this.cursorLit}|${this.cursorColor}|${this.cursorStyle}|${this.cursor.col}|${this.cursor.row}`;
      if (cursorKey !== this.cursorKey) {
        this.cursorKey = cursorKey;
        this.dirty = true;
      }
      this.raster();
      const gl = frame.gl;
      this.ensureGl(gl);
      const texture = this.texture;
      const program = this.program;
      const quad = this.quad;
      const vao = this.vao;
      if (!texture || !program || !quad || !vao || !this.resolutionLoc || !this.texLoc)
        return;
      if (!this.uploaded) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.bitmap);
        this.uploaded = true;
      }
      const bw = this.bitmap.width;
      const bh = this.bitmap.height;
      if (bw !== this.quadW || bh !== this.quadH) {
        this.quadW = bw;
        this.quadH = bh;
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, glassQuad(bw, bh), gl.DYNAMIC_DRAW);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(this.resolutionLoc, this.canvas.element.width, this.canvas.element.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.texLoc, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    raster() {
      const ratio = this.canvas.pixelRatio;
      const w = Math.max(1, Math.round(this.cols * this.cellWidth * ratio));
      const h = Math.max(1, Math.round(this.rows * this.cellHeight * ratio));
      if (this.bitmap.width !== w || this.bitmap.height !== h) {
        this.bitmap.width = w;
        this.bitmap.height = h;
        this.dirty = true;
      }
      if (!this.dirty)
        return;
      const ctx = this.bitmapCtx;
      ctx.clearRect(0, 0, w, h);
      if (this.screenColor) {
        ctx.fillStyle = this.screenColor;
        ctx.fillRect(0, 0, w, h);
      }
      const cw = this.cellWidth * ratio;
      const ch = this.cellHeight * ratio;
      const size = Math.max(1, Math.floor(ch * 0.8));
      for (let row = 0; row < this.rows; row += 1) {
        for (let col = 0; col < this.cols; col += 1) {
          this.paintCell(ctx, this.cells[row][col], col * cw, row * ch, cw, ch, size);
        }
      }
      this.paintCursor(ctx, cw, ch, ratio);
      this.dirty = false;
      this.uploaded = false;
    }
    paintCell(ctx, cell, x, y, w, h, size) {
      if (cell.bg != null && cell.bg >= 0 && cell.bg <= 15) {
        ctx.fillStyle = ANSI[cell.bg];
        ctx.fillRect(x, y, w, h);
      }
      if (!cell.ch || cell.ch === " ")
        return;
      let index = cell.fg ?? 15;
      if (cell.bright && index >= 0 && index <= 7)
        index += 8;
      if (index < 0 || index > 15)
        index = 15;
      ctx.fillStyle = ANSI[index];
      ctx.font = `${cell.bold ? "bold " : ""}${size}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cell.ch, x + w / 2, y + h / 2);
    }
    paintCursor(ctx, cw, ch, ratio) {
      if (!this.cursorLit || this.cols < 1 || this.rows < 1)
        return;
      const col = clamp2(this.cursor.col, 0, this.cols - 1);
      const row = clamp2(this.cursor.row, 0, this.rows - 1);
      const x = col * cw;
      const y = row * ch;
      const bar = Math.max(1, Math.round(2 * ratio));
      ctx.fillStyle = this.cursorColor || "#9ee";
      if (this.cursorStyle === "block")
        ctx.fillRect(x, y, cw, ch);
      else if (this.cursorStyle === "bar")
        ctx.fillRect(x, y, bar, ch);
      else
        ctx.fillRect(x, y + ch - bar, cw, bar);
    }
    ensureGl(gl) {
      if (this.program)
        return;
      const vert = compile2(gl, gl.VERTEX_SHADER, GLASS_VERT);
      const frag = compile2(gl, gl.FRAGMENT_SHADER, GLASS_FRAG);
      const program = gl.createProgram();
      if (!program)
        throw new Error("program create failed");
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? ""}`);
      }
      const resolution = gl.getUniformLocation(program, "u_resolution");
      const tex = gl.getUniformLocation(program, "u_tex");
      if (!resolution || !tex)
        throw new Error("missing glass uniform");
      const texture = gl.createTexture();
      const quad = gl.createBuffer();
      const vao = gl.createVertexArray();
      if (!texture || !quad || !vao)
        throw new Error("glass buffer create failed");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, glassQuad(1, 1), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindVertexArray(null);
      this.program = program;
      this.resolutionLoc = resolution;
      this.texLoc = tex;
      this.texture = texture;
      this.quad = quad;
      this.vao = vao;
      this.uploaded = false;
    }
    feed(ch) {
      if (this.state === "osc") {
        if (ch === "\x07")
          this.state = "ground";
        else if (ch === "\x1B")
          this.state = "osc-esc";
        return;
      }
      if (this.state === "osc-esc") {
        this.state = "ground";
        return;
      }
      if (this.state === "esc") {
        if (ch === "[") {
          this.state = "csi";
          this.params = [];
          this.current = null;
          this.privateCsi = false;
          return;
        }
        if (ch === "]") {
          this.state = "osc";
          return;
        }
        this.state = "ground";
        if (ch === "c")
          this.resetAll();
        else if (ch === "D")
          this.indexDown(false);
        else if (ch === "E")
          this.indexDown(true);
        else if (ch === "M")
          this.reverseIndex();
        return;
      }
      if (this.state === "csi") {
        this.feedCsi(ch);
        return;
      }
      const code = ch.codePointAt(0) ?? 0;
      if (code === 27) {
        this.state = "esc";
        return;
      }
      if (code === 155) {
        this.state = "csi";
        this.params = [];
        this.current = null;
        this.privateCsi = false;
        return;
      }
      if (code < 32) {
        this.control(code);
        return;
      }
      if (code === 127)
        return;
      this.putGlyph(ch);
    }
    feedCsi(ch) {
      const code = ch.codePointAt(0) ?? 0;
      if (code === 24 || code === 26) {
        this.state = "ground";
        return;
      }
      if (ch >= "0" && ch <= "9") {
        this.current = Math.min(9999, (this.current ?? 0) * 10 + (ch.charCodeAt(0) - 48));
        return;
      }
      if (ch === ";") {
        this.params.push(this.current);
        this.current = null;
        return;
      }
      if ((ch === "?" || ch === "<" || ch === "=" || ch === ">") && this.params.length === 0 && this.current === null) {
        this.privateCsi = true;
        return;
      }
      if (code >= 64 && code <= 126) {
        this.params.push(this.current);
        const priv = this.privateCsi;
        this.state = "ground";
        if (!priv)
          this.dispatchCsi(ch);
      }
    }
    dispatchCsi(final) {
      if (final === "m") {
        this.sgr();
        return;
      }
      if (final === "H" || final === "f") {
        this.place(this.pn(1) - 1, this.pn(0) - 1);
        return;
      }
      if (final === "A")
        this.place(this.cursor.col, this.cursor.row - this.pn(0));
      else if (final === "B")
        this.place(this.cursor.col, this.cursor.row + this.pn(0));
      else if (final === "C")
        this.place(this.cursor.col + this.pn(0), this.cursor.row);
      else if (final === "D")
        this.place(this.cursor.col - this.pn(0), this.cursor.row);
      else if (final === "G")
        this.place(this.pn(0) - 1, this.cursor.row);
    }
    sgr() {
      const list = this.params.length > 0 ? this.params : [0];
      for (const value of list) {
        const code = value ?? 0;
        if (code === 0)
          this.resetPen();
        else if (code === 1) {
          this.bold = true;
          this.bright = true;
        } else if (code === 22) {
          this.bold = false;
          this.bright = false;
        } else if (code >= 30 && code <= 37)
          this.fg = code - 30;
        else if (code === 39)
          this.fg = 15;
        else if (code >= 40 && code <= 47)
          this.bg = code - 40;
        else if (code === 49)
          this.bg = null;
        else if (code >= 90 && code <= 97)
          this.fg = code - 82;
        else if (code >= 100 && code <= 107)
          this.bg = code - 92;
      }
    }
    control(code) {
      if (code === 8)
        this.backspace();
      else if (code === 9)
        this.tab();
      else if (code === 10 || code === 11 || code === 12)
        this.indexDown(true);
      else if (code === 13) {
        this.cursor.col = 0;
        this.dirty = true;
      }
    }
    putGlyph(glyph) {
      if (this.rows < 1 || this.cols < 1)
        return;
      if (this.inRange(this.cursor.col, this.cursor.row)) {
        this.cells[this.cursor.row][this.cursor.col] = this.ink(glyph);
      }
      this.cursor.col += 1;
      if (this.cursor.col >= this.cols) {
        this.cursor.col = 0;
        this.cursor.row += 1;
      }
      this.scrollIntoView();
      this.dirty = true;
    }
    indexDown(returnHome) {
      if (returnHome)
        this.cursor.col = 0;
      this.cursor.row += 1;
      this.scrollIntoView();
      this.dirty = true;
    }
    reverseIndex() {
      if (this.rows < 1)
        return;
      if (this.cursor.row > 0) {
        this.cursor.row -= 1;
        this.dirty = true;
        return;
      }
      this.cursor.row = 0;
      this.cells.pop();
      this.cells.unshift(blankRow(this.cols));
      this.dirty = true;
    }
    backspace() {
      if (this.cursor.col >= this.cols)
        this.cursor.col = Math.max(0, this.cols - 1);
      else if (this.cursor.col > 0)
        this.cursor.col -= 1;
      this.dirty = true;
    }
    tab() {
      if (this.cols <= 0)
        return;
      const next = (Math.floor(this.cursor.col / 8) + 1) * 8;
      this.cursor.col = Math.min(this.cols - 1, next);
      this.dirty = true;
    }
    place(col, row) {
      this.cursor.col = clamp2(col, 0, Math.max(0, this.cols - 1));
      this.cursor.row = clamp2(row, 0, Math.max(0, this.rows - 1));
      this.dirty = true;
    }
    pn(index) {
      const value = this.params[index] ?? 0;
      return value > 0 ? value : 1;
    }
    scrollIntoView() {
      while (this.rows > 0 && this.cursor.row >= this.rows) {
        this.cells.shift();
        this.cells.push(blankRow(this.cols));
        this.cursor.row -= 1;
      }
      if (this.cursor.row < 0)
        this.cursor.row = 0;
    }
    ink(ch) {
      const cell = { ch, fg: this.fg, bg: this.bg };
      if (this.bright)
        cell.bright = true;
      if (this.bold)
        cell.bold = true;
      return cell;
    }
    resetPen() {
      this.fg = 15;
      this.bg = null;
      this.bright = false;
      this.bold = false;
    }
    resetAll() {
      this.fillBlank();
      this.cursor.col = 0;
      this.cursor.row = 0;
      this.resetPen();
      this.state = "ground";
      this.dirty = true;
    }
    fillBlank() {
      this.cells.length = 0;
      for (let row = 0; row < this.rows; row += 1)
        this.cells.push(blankRow(this.cols));
    }
    applyBackground(color) {
      if (color === null)
        this.screenColor = null;
      else if (typeof color === "number")
        this.screenColor = ANSI[color] ?? null;
      else
        this.screenColor = color;
    }
    inRange(col, row) {
      return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
    }
    flush() {
      if (this.hold === 0 && this.dirty)
        this.canvas.draw();
    }
    armKeys() {
      if (typeof window === "undefined" || typeof window.addEventListener !== "function")
        return;
      window.addEventListener("keydown", (event) => {
        this.keys.add(event.key);
        for (const handler of this.keyHandlers)
          handler(event.key);
      });
      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.key);
      });
    }
  };
  function blankRow(cols) {
    const row = [];
    for (let col = 0; col < cols; col += 1)
      row.push({ ch: " " });
    return row;
  }
  function copyCell(cell) {
    const copy = { ch: cell.ch };
    if (cell.fg !== void 0)
      copy.fg = cell.fg;
    if (cell.bg !== void 0)
      copy.bg = cell.bg;
    if (cell.bright)
      copy.bright = true;
    if (cell.bold)
      copy.bold = true;
    return copy;
  }
  function glassQuad(w, h) {
    return new Float32Array([
      0,
      0,
      0,
      1,
      w,
      0,
      1,
      1,
      w,
      h,
      1,
      0,
      0,
      0,
      0,
      1,
      w,
      h,
      1,
      0,
      0,
      h,
      0,
      0
    ]);
  }
  function compile2(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader)
      throw new Error("shader create failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? "";
      gl.deleteShader(shader);
      throw new Error(`shader compile failed: ${log}`);
    }
    return shader;
  }
  function isCursorStyle(style) {
    return style === "underline" || style === "block" || style === "bar";
  }
  function clamp2(value, min, max) {
    if (value < min)
      return min;
    if (value > max)
      return max;
    return value;
  }

  // dist/engine.js
  var Engine = class {
    canvas;
    actors = [];
    collisions = [];
    keys = /* @__PURE__ */ new Set();
    audio = null;
    raf = 0;
    running = false;
    inUpdate = false;
    /** Use `options.canvas`, or create one. Does not build page chrome. */
    constructor(options = {}) {
      this.canvas = options.canvas ?? new Canvas({
        width: options.width,
        height: options.height,
        pixelRatio: options.pixelRatio,
        clear: options.clear,
        antialias: options.antialias
      });
      this.armKeys();
    }
    /**
     * Create an emoji sprite and place it on a named layer.
     * `size` is the world height of the billboard and defaults to 1.
     * `layer` defaults to `default`. The glyph faces the camera; `yaw` is the heading.
     */
    sprite(emoji, x, y, z, size = 1, layer = "default") {
      const sprite = new EmojiActor(emoji, x, y, z, size, layer);
      this.actors.push(sprite);
      this.canvas.add(sprite, layer);
      return sprite;
    }
    /**
     * Create a box and place it on a named layer.
     * Dimensions default to 1. `color` defaults to `#c8c8d0`. The box is solid.
     */
    box(x, y, z, w = 1, h = 1, d = 1, color = "#c8c8d0", layer = "default") {
      const box = new BoxActor(x, y, z, w, h, d, color, layer);
      this.actors.push(box);
      this.canvas.add(box, layer);
      return box;
    }
    /** Set per-update velocity in world units. */
    motion(body, vx, vy, vz) {
      body.vx = vx;
      body.vy = vy;
      body.vz = vz;
    }
    /**
     * Register a callback for sprite pairs, and for a sprite touching a sensor box.
     * The returned function removes this registration. Calling it again does nothing.
     * Two registrations of one function are removed separately.
     */
    onCollision(handler) {
      const entry = { handler };
      this.collisions.push(entry);
      return () => {
        const index = this.collisions.indexOf(entry);
        if (index >= 0)
          this.collisions.splice(index, 1);
      };
    }
    /**
     * Move living actors, push sprites out of solid boxes, then report overlaps.
     * Pairs are chosen after the push and do not change while handlers run.
     * Throws when called from a collision handler.
     */
    update() {
      if (this.inUpdate) {
        throw new Error("Engine.update cannot be called from a collision handler");
      }
      this.inUpdate = true;
      try {
        for (const actor of this.actors) {
          if (!actor.alive)
            continue;
          actor.x += actor.vx;
          actor.y += actor.vy;
          actor.z += actor.vz;
        }
        for (const sprite of this.actors) {
          if (sprite.batch !== "emoji" || !sprite.alive || !placed(sprite))
            continue;
          for (const box of this.actors) {
            if (box.batch !== "box" || !box.alive || box.sensor || !placed(box))
              continue;
            pushSprite(sprite, box);
          }
        }
        const live = this.actors.filter((actor) => actor.alive && placed(actor));
        const pairs = [];
        for (let i = 0; i < live.length; i += 1) {
          for (let j = i + 1; j < live.length; j += 1) {
            const a = live[i];
            const b = live[j];
            if (a.batch === "box" && b.batch === "box")
              continue;
            if (a.batch === "emoji" && b.batch === "emoji") {
              if (spheresTouch(a, b))
                pairs.push([a, b]);
              continue;
            }
            const sprite = a.batch === "emoji" ? a : b;
            const box = a.batch === "box" ? a : b;
            if (box.batch !== "box" || sprite.batch !== "emoji" || !box.sensor)
              continue;
            if (sphereTouchesBox(sprite, box))
              pairs.push([a, b]);
          }
        }
        const handlers = this.collisions.slice();
        for (const [a, b] of pairs) {
          for (const entry of handlers) {
            if (this.collisions.indexOf(entry) < 0)
              continue;
            entry.handler(a, b);
          }
        }
      } finally {
        this.inUpdate = false;
      }
    }
    /** Start the `requestAnimationFrame` loop. Each frame updates, then draws. */
    start() {
      if (this.running)
        return;
      if (typeof requestAnimationFrame !== "function") {
        throw new Error("requestAnimationFrame is unavailable");
      }
      this.running = true;
      this.raf = requestAnimationFrame(this.tick);
    }
    /** Stop the frame loop. */
    stop() {
      this.running = false;
      if (typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(this.raf);
    }
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key) {
      return this.keys.has(key);
    }
    /**
     * Play a short square-wave beep.
     * `freq` is Hertz (default 440) and `duration` is milliseconds (default 120).
     * Does nothing when the Web Audio API is missing.
     */
    beep(freq = 440, duration = 120) {
      const AudioCtor = globalThis.AudioContext;
      if (typeof AudioCtor !== "function")
        return;
      try {
        const audio = this.audio ?? new AudioCtor();
        this.audio = audio;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(audio.destination);
        const stopAt = audio.currentTime + duration / 1e3;
        gain.gain.exponentialRampToValueAtTime(1e-4, stopAt);
        osc.start();
        osc.stop(stopAt);
      } catch {
      }
    }
    tick = () => {
      if (!this.running)
        return;
      try {
        this.update();
        this.canvas.draw();
      } catch (error) {
        this.running = false;
        throw error;
      }
      if (!this.running)
        return;
      this.raf = requestAnimationFrame(this.tick);
    };
    armKeys() {
      if (typeof window === "undefined" || typeof window.addEventListener !== "function")
        return;
      window.addEventListener("keydown", (event) => {
        this.keys.add(event.key);
      });
      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.key);
      });
    }
  };
  var EmojiActor = class {
    batch = "emoji";
    emoji;
    x;
    y;
    z;
    size;
    vx = 0;
    vy = 0;
    vz = 0;
    yaw = 0;
    layer;
    alive = true;
    data = {};
    constructor(emoji, x, y, z, size, layer) {
      this.emoji = emoji;
      this.x = x;
      this.y = y;
      this.z = z;
      this.size = size;
      this.layer = layer;
    }
    get radius() {
      return this.size / 2;
    }
    draw(_frame) {
    }
  };
  var BoxActor = class {
    batch = "box";
    x;
    y;
    z;
    w;
    h;
    d;
    yaw = 0;
    color;
    sensor = false;
    vx = 0;
    vy = 0;
    vz = 0;
    layer;
    alive = true;
    data = {};
    constructor(x, y, z, w, h, d, color, layer) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      this.h = h;
      this.d = d;
      this.color = color;
      this.layer = layer;
    }
    draw(_frame) {
    }
  };
  function placed(body) {
    return Number.isFinite(body.x) && Number.isFinite(body.y) && Number.isFinite(body.z);
  }
  function spheresTouch(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    const reach = a.radius + b.radius;
    if (!Number.isFinite(dx + dy + dz + reach))
      return false;
    return dx * dx + dy * dy + dz * dz <= reach * reach;
  }
  function worldToLocal(box, x, y, z) {
    const dx = x - box.x;
    const dy = y - box.y;
    const dz = z - box.z;
    const c = Math.cos(box.yaw);
    const s = Math.sin(box.yaw);
    return { x: c * dx - s * dz, y: dy, z: s * dx + c * dz };
  }
  function localToWorld(box, x, y, z) {
    const c = Math.cos(box.yaw);
    const s = Math.sin(box.yaw);
    return {
      x: box.x + c * x + s * z,
      y: box.y + y,
      z: box.z - s * x + c * z
    };
  }
  function sphereTouchesBox(sprite, box) {
    const radius = sprite.radius;
    if (!Number.isFinite(radius) || !Number.isFinite(box.w + box.h + box.d + box.yaw))
      return false;
    const local = worldToLocal(box, sprite.x, sprite.y, sprite.z);
    const hx = Math.abs(box.w) / 2;
    const hy = Math.abs(box.h) / 2;
    const hz = Math.abs(box.d) / 2;
    const cx = clamp3(local.x, -hx, hx);
    const cy = clamp3(local.y, -hy, hy);
    const cz = clamp3(local.z, -hz, hz);
    const ex = local.x - cx;
    const ey = local.y - cy;
    const ez = local.z - cz;
    return ex * ex + ey * ey + ez * ez <= radius * radius;
  }
  function pushSprite(sprite, box) {
    const radius = sprite.radius;
    if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(box.w + box.h + box.d + box.yaw))
      return;
    const local = worldToLocal(box, sprite.x, sprite.y, sprite.z);
    const hx = Math.abs(box.w) / 2;
    const hy = Math.abs(box.h) / 2;
    const hz = Math.abs(box.d) / 2;
    let lx = local.x;
    let ly = local.y;
    let lz = local.z;
    const cx = clamp3(lx, -hx, hx);
    const cy = clamp3(ly, -hy, hy);
    const cz = clamp3(lz, -hz, hz);
    const ex = lx - cx;
    const ey = ly - cy;
    const ez = lz - cz;
    const dist2 = ex * ex + ey * ey + ez * ez;
    if (dist2 > radius * radius)
      return;
    const dist = Math.sqrt(dist2);
    if (radius - dist <= 1e-4)
      return;
    if (dist > 1e-8) {
      const scale2 = (radius - dist) / dist;
      lx += ex * scale2;
      ly += ey * scale2;
      lz += ez * scale2;
    } else {
      const exits = [
        { pen: hx - lx, apply: (gap) => {
          lx = hx + gap;
        } },
        { pen: hx + lx, apply: (gap) => {
          lx = -hx - gap;
        } },
        { pen: hy - ly, apply: (gap) => {
          ly = hy + gap;
        } },
        { pen: hy + ly, apply: (gap) => {
          ly = -hy - gap;
        } },
        { pen: hz - lz, apply: (gap) => {
          lz = hz + gap;
        } },
        { pen: hz + lz, apply: (gap) => {
          lz = -hz - gap;
        } }
      ];
      let best = exits[0];
      for (const exit of exits)
        if (exit.pen < best.pen)
          best = exit;
      best.apply(radius);
    }
    const world = localToWorld(box, lx, ly, lz);
    sprite.x = world.x;
    sprite.y = world.y;
    sprite.z = world.z;
  }
  function clamp3(value, min, max) {
    if (value < min)
      return min;
    if (value > max)
      return max;
    return value;
  }

  // dist/utilities.js
  var Utilities = {
    /**
     * Wrap a target in a column. The header has a title, a middle slot, and a
     * fullscreen button. The button label is "F11 Fullscreen", or "Esc Exit" while the
     * document is already fullscreen. The footer is a plain div. Either bar can be omitted.
     */
    wrap(target, options = {}) {
      const surface = resolveElement(target);
      const showHeader = options.header !== false;
      const showFooter = options.footer !== false;
      const wrap = document.createElement("div");
      wrap.className = "ee-wrap";
      assign(wrap, {
        display: "flex",
        flexDirection: "column",
        width: "fit-content",
        background: "#16161a",
        color: "#f2f2f2",
        fontFamily: "sans-serif",
        fontSize: "14px"
      });
      let titleEl = null;
      let headerMiddle = null;
      if (showHeader) {
        const header = document.createElement("header");
        header.className = "ee-header";
        assign(header, {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px"
        });
        titleEl = document.createElement("span");
        titleEl.className = "ee-title";
        titleEl.textContent = options.title ?? "";
        assign(titleEl, { fontWeight: "600" });
        headerMiddle = document.createElement("div");
        headerMiddle.className = "ee-middle";
        assign(headerMiddle, {
          flex: "1 1 auto",
          textAlign: "center",
          minWidth: "0"
        });
        const button = document.createElement("button");
        button.className = "ee-fullscreen";
        button.setAttribute("type", "button");
        assign(button, {
          marginLeft: "8px",
          cursor: "pointer",
          background: "transparent",
          color: "inherit",
          border: "1px solid #666",
          borderRadius: "4px",
          padding: "2px 8px"
        });
        syncFullscreenButton(button);
        button.addEventListener("click", () => toggleFullscreen(wrap));
        document.addEventListener("fullscreenchange", () => syncFullscreenButton(button));
        header.append(titleEl, headerMiddle, button);
        wrap.append(header);
      }
      assign(surface, { display: "block" });
      wrap.append(surface);
      let footer = null;
      if (showFooter) {
        footer = document.createElement("div");
        footer.className = "ee-footer";
        assign(footer, {
          padding: "4px 10px",
          minHeight: "1.4em",
          fontFamily: "ui-monospace, monospace",
          fontSize: "12px"
        });
        wrap.append(footer);
      }
      return {
        wrap,
        headerMiddle,
        footer,
        setTitle(title) {
          if (titleEl)
            titleEl.textContent = title;
        }
      };
    }
  };
  function resolveElement(target) {
    if (isElement(target))
      return target;
    if (isElementHost(target))
      return target.element;
    if (isCanvasHost(target))
      return target.canvas.element;
    throw new TypeError("Utilities.wrap target must be an element, a Canvas, or an object with a canvas");
  }
  function isElement(value) {
    return typeof value === "object" && value !== null && "nodeType" in value && value.nodeType === 1;
  }
  function isElementHost(value) {
    return typeof value === "object" && value !== null && "element" in value && isNodeElement(value.element);
  }
  function isCanvasHost(value) {
    if (typeof value !== "object" || value === null || !("canvas" in value))
      return false;
    const canvas = value.canvas;
    return typeof canvas === "object" && canvas !== null && "element" in canvas && isNodeElement(canvas.element);
  }
  function isNodeElement(value) {
    return typeof value === "object" && value !== null && "nodeType" in value && value.nodeType === 1;
  }
  function assign(element, rules) {
    Object.assign(element.style, rules);
  }
  function fullscreenLabel(active) {
    return active ? "Esc Exit" : "F11 Fullscreen";
  }
  function syncFullscreenButton(button) {
    const label = fullscreenLabel(Boolean(document.fullscreenElement));
    button.textContent = label;
    button.setAttribute("aria-label", label);
  }
  function toggleFullscreen(wrap) {
    const request = document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen();
    void Promise.resolve(request).catch(() => {
    });
  }
  return __toCommonJS(index_exports);
})();
globalThis.EmojiEngine3D = EmojiEngine3D;
