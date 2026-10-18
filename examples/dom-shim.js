/**
 * Minimal DOM and WebGL stand-in so `node examples/demo.js` can construct
 * the engine under Node. Browsers already have these globals, so this does nothing there.
 */

class FakeStyle {}

class FakeElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = new FakeStyle();
    this.parentElement = null;
    this.textContent = '';
    this.className = '';
    this.width = 300;
    this.height = 150;
    this.attrs = new Map();
    this.listeners = new Map();
    this.gl = null;
    this.context2d = null;
  }

  appendChild(child) {
    this.detach(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  setAttribute(name, value) {
    this.attrs.set(name, value);
  }

  getAttribute(name) {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }

  requestFullscreen() {
    const doc = globalThis.document;
    if (doc) {
      doc.fullscreenElement = this;
      if (typeof doc.dispatchEvent === 'function') doc.dispatchEvent({ type: 'fullscreenchange' });
    }
    return Promise.resolve();
  }

  click() {
    const list = this.listeners.get('click');
    if (!list) return;
    for (const handler of [...list]) handler({});
  }

  getContext(kind) {
    if (this.tagName !== 'CANVAS') return null;
    if (kind === 'webgl2') {
      this.gl ??= new Proxy(new FakeGL(this), glProxy);
      return this.gl;
    }
    if (kind === '2d') {
      this.context2d ??= new Context2D();
      return this.context2d;
    }
    return null;
  }

  detach(child) {
    const parent = child.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(child);
    if (index >= 0) parent.children.splice(index, 1);
    child.parentElement = null;
  }
}

/** Records the 2D calls the atlas and the glass make. */
class Context2D {
  constructor() {
    this.font = '';
    this.fillStyle = '';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this.fillTextCount = 0;
    this.texts = [];
  }

  save() {}
  restore() {}
  beginPath() {}
  rect() {}
  clip() {}
  clearRect() {}
  fillRect() {}

  fillText(text, x, y) {
    this.fillTextCount += 1;
    this.texts.push({ text: String(text), x: Number(x), y: Number(y) });
  }
}

/**
 * Records instanced draws. Shader compiles succeed so the math tests can run.
 * It does not rasterize.
 */
class FakeGL {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawCalls = [];
    this._enums = new Map();
  }

  createShader() { return {}; }
  shaderSource() {}
  compileShader() {}
  getShaderParameter() { return true; }
  getShaderInfoLog() { return ''; }
  deleteShader() {}
  createProgram() { return {}; }
  attachShader() {}
  linkProgram() {}
  getProgramParameter() { return true; }
  getProgramInfoLog() { return ''; }
  getUniformLocation(_program, name) { return { name }; }
  createBuffer() { return {}; }
  bindBuffer() {}
  bufferData() {}
  createVertexArray() { return {}; }
  bindVertexArray() {}
  enableVertexAttribArray() {}
  vertexAttribPointer() {}
  vertexAttribDivisor() {}
  createTexture() { return {}; }
  bindTexture() {}
  texParameteri() {}
  texImage2D() {}
  pixelStorei() {}
  activeTexture() {}
  enable() {}
  disable() {}
  depthMask() {}
  cullFace() {}
  frontFace() {}
  blendFunc() {}
  viewport() {}
  clearColor() {}
  clear() {}
  useProgram() {}
  uniformMatrix4fv() {}
  uniform3f() {}
  uniform2f() {}
  uniform1i() {}
  uniform1f() {}

  drawElementsInstanced(_mode, count, _type, _offset, instances) {
    this.drawCalls.push({ kind: 'elements', count, instances });
  }

  drawArraysInstanced(_mode, _first, count, instances) {
    this.drawCalls.push({ kind: 'arrays', count, instances });
  }

  drawArrays(_mode, _first, count) {
    this.drawCalls.push({ kind: 'arrays', count, instances: 1 });
  }
}

const glProxy = {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
    if (typeof prop === 'string' && prop.length > 1 && prop === prop.toUpperCase()) {
      if (!target._enums.has(prop)) target._enums.set(prop, 0x1000 + target._enums.size);
      return target._enums.get(prop);
    }
    throw new Error(`FakeGL.${String(prop)} is not implemented`);
  },
};

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html');
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.body);
    this.fullscreenElement = null;
    this.listeners = new Map();
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event?.type) ?? [];
    for (const handler of [...list]) handler(event);
    return true;
  }

  exitFullscreen() {
    this.fullscreenElement = null;
    this.dispatchEvent({ type: 'fullscreenchange' });
    return Promise.resolve();
  }
}

/** Install `document` and `requestAnimationFrame` when the host has none. */
export function installHostShims() {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = new FakeDocument();
  }
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    const handles = new Map();
    let next = 1;
    globalThis.requestAnimationFrame = (callback) => {
      const token = next;
      next += 1;
      const handle = setTimeout(() => {
        handles.delete(token);
        callback(Date.now());
      }, 16);
      handles.set(token, handle);
      return token;
    };
    globalThis.cancelAnimationFrame = (token) => {
      const handle = handles.get(token);
      if (handle === undefined) return;
      clearTimeout(handle);
      handles.delete(token);
    };
  }
}

