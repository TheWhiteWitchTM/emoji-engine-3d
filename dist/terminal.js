import { Canvas } from './canvas.js';
const ANSI = [
    '#000000', '#aa0000', '#00aa00', '#aa5500',
    '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
    '#555555', '#ff5555', '#55ff55', '#ffff55',
    '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
];
const GLASS_VERT = `#version 300 es
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
const GLASS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_tex, v_uv);
}
`;
/**
 * A cell buffer painted as a screen-space overlay.
 * The everyday sequences match emoji-engine-2d: newline mode, wrap, scroll,
 * and the classic 16-color SGR. The rest of ECMA-48 stays in that package.
 */
export class Terminal {
    batch = 'terminal';
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
    cursorColor = '#9ee';
    /** Caret shape. Default `underline`. Read on the next draw. */
    cursorStyle = 'underline';
    cellWidth;
    cellHeight;
    cells;
    bitmap;
    bitmapCtx;
    keys = new Set();
    keyHandlers = [];
    state = 'ground';
    params = [];
    current = null;
    privateCsi = false;
    hold = 0;
    dirty = true;
    uploaded = false;
    cursorKey = '';
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
            height: Math.max(1, this.rows * this.cellHeight),
        });
        this.cells = [];
        this.fillBlank();
        const bitmap = document.createElement('canvas');
        const ctx = bitmap.getContext('2d');
        if (!ctx)
            throw new Error('2D canvas context is unavailable');
        this.bitmap = bitmap;
        this.bitmapCtx = ctx;
        if (options.background !== undefined)
            this.applyBackground(options.background);
        if (options.showCursor === false)
            this.cursorLit = false;
        if (typeof options.cursorColor === 'string' && options.cursorColor)
            this.cursorColor = options.cursorColor;
        if (isCursorStyle(options.cursorStyle))
            this.cursorStyle = options.cursorStyle;
        this.canvas.add(this, options.layer ?? 'terminal');
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
        this.cells[row][col] = typeof value === 'string' ? this.ink(value) : copyCell(value);
        this.dirty = true;
        this.flush();
    }
    /** Copy one cell. Out of range returns a space. */
    get(col, row) {
        if (!this.inRange(col, row))
            return { ch: ' ' };
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
        if (fg === null || (fg >= 0 && fg <= 15))
            this.fg = fg;
        if (bg === undefined)
            return;
        if (bg === null || (bg >= 0 && bg <= 15))
            this.bg = bg;
    }
    /**
     * Paper behind cells with no background of their own.
     * A number is a palette index. A string is CSS. null is transparent.
     * An out-of-range index is ignored.
     */
    background(color) {
        if (typeof color === 'number' && !(color >= 0 && color <= 15))
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
        if (!cell.ch || cell.ch === ' ')
            return;
        let index = cell.fg ?? 15;
        if (cell.bright && index >= 0 && index <= 7)
            index += 8;
        if (index < 0 || index > 15)
            index = 15;
        ctx.fillStyle = ANSI[index];
        ctx.font = `${cell.bold ? 'bold ' : ''}${size}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cell.ch, x + w / 2, y + h / 2);
    }
    paintCursor(ctx, cw, ch, ratio) {
        if (!this.cursorLit || this.cols < 1 || this.rows < 1)
            return;
        const col = clamp(this.cursor.col, 0, this.cols - 1);
        const row = clamp(this.cursor.row, 0, this.rows - 1);
        const x = col * cw;
        const y = row * ch;
        const bar = Math.max(1, Math.round(2 * ratio));
        ctx.fillStyle = this.cursorColor || '#9ee';
        if (this.cursorStyle === 'block')
            ctx.fillRect(x, y, cw, ch);
        else if (this.cursorStyle === 'bar')
            ctx.fillRect(x, y, bar, ch);
        else
            ctx.fillRect(x, y + ch - bar, cw, bar);
    }
    ensureGl(gl) {
        if (this.program)
            return;
        const vert = compile(gl, gl.VERTEX_SHADER, GLASS_VERT);
        const frag = compile(gl, gl.FRAGMENT_SHADER, GLASS_FRAG);
        const program = gl.createProgram();
        if (!program)
            throw new Error('program create failed');
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        gl.deleteShader(vert);
        gl.deleteShader(frag);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? ''}`);
        }
        const resolution = gl.getUniformLocation(program, 'u_resolution');
        const tex = gl.getUniformLocation(program, 'u_tex');
        if (!resolution || !tex)
            throw new Error('missing glass uniform');
        const texture = gl.createTexture();
        const quad = gl.createBuffer();
        const vao = gl.createVertexArray();
        if (!texture || !quad || !vao)
            throw new Error('glass buffer create failed');
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
        if (this.state === 'osc') {
            if (ch === '\u0007')
                this.state = 'ground';
            else if (ch === '\u001b')
                this.state = 'osc-esc';
            return;
        }
        if (this.state === 'osc-esc') {
            this.state = 'ground';
            return;
        }
        if (this.state === 'esc') {
            if (ch === '[') {
                this.state = 'csi';
                this.params = [];
                this.current = null;
                this.privateCsi = false;
                return;
            }
            if (ch === ']') {
                this.state = 'osc';
                return;
            }
            this.state = 'ground';
            if (ch === 'c')
                this.resetAll();
            else if (ch === 'D')
                this.indexDown(false);
            else if (ch === 'E')
                this.indexDown(true);
            else if (ch === 'M')
                this.reverseIndex();
            return;
        }
        if (this.state === 'csi') {
            this.feedCsi(ch);
            return;
        }
        const code = ch.codePointAt(0) ?? 0;
        if (code === 0x1b) {
            this.state = 'esc';
            return;
        }
        if (code === 0x9b) {
            this.state = 'csi';
            this.params = [];
            this.current = null;
            this.privateCsi = false;
            return;
        }
        if (code < 0x20) {
            this.control(code);
            return;
        }
        if (code === 0x7f)
            return;
        this.putGlyph(ch);
    }
    feedCsi(ch) {
        const code = ch.codePointAt(0) ?? 0;
        if (code === 0x18 || code === 0x1a) {
            this.state = 'ground';
            return;
        }
        if (ch >= '0' && ch <= '9') {
            this.current = Math.min(9999, (this.current ?? 0) * 10 + (ch.charCodeAt(0) - 48));
            return;
        }
        if (ch === ';') {
            this.params.push(this.current);
            this.current = null;
            return;
        }
        if ((ch === '?' || ch === '<' || ch === '=' || ch === '>') && this.params.length === 0 && this.current === null) {
            this.privateCsi = true;
            return;
        }
        if (code >= 0x40 && code <= 0x7e) {
            this.params.push(this.current);
            const priv = this.privateCsi;
            this.state = 'ground';
            if (!priv)
                this.dispatchCsi(ch);
        }
    }
    dispatchCsi(final) {
        if (final === 'm') {
            this.sgr();
            return;
        }
        if (final === 'H' || final === 'f') {
            this.place(this.pn(1) - 1, this.pn(0) - 1);
            return;
        }
        if (final === 'A')
            this.place(this.cursor.col, this.cursor.row - this.pn(0));
        else if (final === 'B')
            this.place(this.cursor.col, this.cursor.row + this.pn(0));
        else if (final === 'C')
            this.place(this.cursor.col + this.pn(0), this.cursor.row);
        else if (final === 'D')
            this.place(this.cursor.col - this.pn(0), this.cursor.row);
        else if (final === 'G')
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
            }
            else if (code === 22) {
                this.bold = false;
                this.bright = false;
            }
            else if (code >= 30 && code <= 37)
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
        if (code === 0x08)
            this.backspace();
        else if (code === 0x09)
            this.tab();
        else if (code === 0x0a || code === 0x0b || code === 0x0c)
            this.indexDown(true);
        else if (code === 0x0d) {
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
        this.cursor.col = clamp(col, 0, Math.max(0, this.cols - 1));
        this.cursor.row = clamp(row, 0, Math.max(0, this.rows - 1));
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
        this.state = 'ground';
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
        else if (typeof color === 'number')
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
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function')
            return;
        window.addEventListener('keydown', (event) => {
            this.keys.add(event.key);
            for (const handler of this.keyHandlers)
                handler(event.key);
        });
        window.addEventListener('keyup', (event) => {
            this.keys.delete(event.key);
        });
    }
}
function blankRow(cols) {
    const row = [];
    for (let col = 0; col < cols; col += 1)
        row.push({ ch: ' ' });
    return row;
}
function copyCell(cell) {
    const copy = { ch: cell.ch };
    if (cell.fg !== undefined)
        copy.fg = cell.fg;
    if (cell.bg !== undefined)
        copy.bg = cell.bg;
    if (cell.bright)
        copy.bright = true;
    if (cell.bold)
        copy.bold = true;
    return copy;
}
function glassQuad(w, h) {
    return new Float32Array([
        0, 0, 0, 1,
        w, 0, 1, 1,
        w, h, 1, 0,
        0, 0, 0, 1,
        w, h, 1, 0,
        0, h, 0, 0,
    ]);
}
function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader)
        throw new Error('shader create failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? '';
        gl.deleteShader(shader);
        throw new Error(`shader compile failed: ${log}`);
    }
    return shader;
}
function isCursorStyle(style) {
    return style === 'underline' || style === 'block' || style === 'bar';
}
function clamp(value, min, max) {
    if (value < min)
        return min;
    if (value > max)
        return max;
    return value;
}
//# sourceMappingURL=terminal.js.map