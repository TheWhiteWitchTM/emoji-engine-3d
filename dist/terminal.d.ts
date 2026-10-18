import { Canvas, type DrawFrame, type GlassPanel } from './canvas.js';
/**
 * One cell in the glass.
 * Indexes 0–15 are the classic ANSI palette. A missing foreground paints as 15.
 */
export interface Cell {
    ch: string;
    /** Color index 0–15, or null for the default ink. */
    fg?: number | null;
    /** Color index 0–15. Null and omitted leave the background transparent. */
    bg?: number | null;
    /** When true, foreground indexes 0–7 draw as 8–15. */
    bright?: boolean;
    /** Bold face. Set together with `bright` by SGR 1. */
    bold?: boolean;
}
/** How the caret is drawn. `underline` is the bottom bar. */
export type CursorStyle = 'underline' | 'block' | 'bar';
/** `key` is `KeyboardEvent.key`. */
export type KeyHandler = (key: string) => void;
/** Options for the screen-space cell glass. */
export interface TerminalOptions {
    /** Columns. Default 40. */
    cols?: number;
    /** Rows. Default 12. */
    rows?: number;
    /** Surface to draw on. A new canvas is created when omitted. */
    canvas?: Canvas;
    /** Cell width in CSS pixels. Default 16. */
    cellWidth?: number;
    /** Cell height in CSS pixels. Default 20. */
    cellHeight?: number;
    /** Layer name. The glass still paints after the world. Default `terminal`. */
    layer?: string;
    /** Paper behind uncolored cells. A number is a palette index. Default null. */
    background?: string | number | null;
    /** Draw the caret. Default true. */
    showCursor?: boolean;
    /** Caret color. Default `#9ee`. */
    cursorColor?: string;
    /** Caret shape. Default `underline`. */
    cursorStyle?: CursorStyle;
}
interface TerminalContract {
    readonly cols: number;
    readonly rows: number;
    readonly canvas: Canvas;
    readonly cursor: {
        col: number;
        row: number;
    };
    fg: number | null;
    bg: number | null;
    bright: boolean;
    bold: boolean;
    screenColor: string | null;
    cursorLit: boolean;
    cursorColor: string;
    cursorStyle: CursorStyle;
    write(text: string): void;
    put(ch: string): void;
    set(col: number, row: number, value: Cell | string): void;
    get(col: number, row: number): Cell;
    clear(): void;
    color(fg: number | null, bg?: number | null): void;
    background(color: string | number | null): void;
    setCursorStyle(style: CursorStyle): void;
    beginFrame(): void;
    endFrame(): void;
    onKey(handler: KeyHandler): void;
    isKeyDown(key: string): boolean;
    draw(frame: DrawFrame): void;
}
/**
 * A cell buffer painted as a screen-space overlay.
 * The everyday sequences match emoji-engine-2d: newline mode, wrap, scroll,
 * and the classic 16-color SGR. The rest of ECMA-48 stays in that package.
 */
export declare class Terminal implements TerminalContract, GlassPanel {
    readonly batch: "terminal";
    readonly cols: number;
    readonly rows: number;
    readonly canvas: Canvas;
    readonly cursor: {
        col: number;
        row: number;
    };
    /** Foreground index used by `write` and `put`. Default 15. */
    fg: number | null;
    /** Background index used by `write` and `put`. Default null. */
    bg: number | null;
    /** Shifts foreground indexes 0–7 to 8–15. Default false. */
    bright: boolean;
    /** Bold face for later cells. Default false. */
    bold: boolean;
    /** Paper behind cells with no background. Default null. */
    screenColor: string | null;
    /** False hides the caret. Default true. Read on the next draw. */
    cursorLit: boolean;
    /** Caret color. Default `#9ee`. Read on the next draw. */
    cursorColor: string;
    /** Caret shape. Default `underline`. Read on the next draw. */
    cursorStyle: CursorStyle;
    private readonly cellWidth;
    private readonly cellHeight;
    private readonly cells;
    private readonly bitmap;
    private readonly bitmapCtx;
    private readonly keys;
    private readonly keyHandlers;
    private state;
    private params;
    private current;
    private privateCsi;
    private hold;
    private dirty;
    private uploaded;
    private cursorKey;
    private program;
    private resolutionLoc;
    private texLoc;
    private texture;
    private quad;
    private vao;
    private quadW;
    private quadH;
    /** Create the buffer and add it to `canvas`. The element is not inserted. */
    constructor(options?: TerminalOptions);
    /**
     * Write text at the cursor.
     * `\n`, vertical tab, and form feed return to column 0 and move down.
     * The buffer wraps and scrolls. A CSI or OSC sequence is consumed.
     */
    write(text: string): void;
    /**
     * Feed one code point through the same parser as `write`, then redraw.
     * Extra code points in `ch` are ignored.
     */
    put(ch: string): void;
    /** Replace one cell. A string is stored as-is and is not parsed. Out of range is ignored. */
    set(col: number, row: number, value: Cell | string): void;
    /** Copy one cell. Out of range returns a space. */
    get(col: number, row: number): Cell;
    /** Fill the buffer with spaces and move the cursor home. The pen is kept. */
    clear(): void;
    /**
     * Set the color indexes for later `write` and `put` calls.
     * An omitted background is kept. An index outside 0–15 is ignored.
     * Null clears that channel to the default.
     */
    color(fg: number | null, bg?: number | null): void;
    /**
     * Paper behind cells with no background of their own.
     * A number is a palette index. A string is CSS. null is transparent.
     * An out-of-range index is ignored.
     */
    background(color: string | number | null): void;
    /** `underline` is the bottom bar, `bar` is a vertical beam, `block` fills the cell. */
    setCursorStyle(style: CursorStyle): void;
    /** Hold redraws. Calls may nest. */
    beginFrame(): void;
    /** Release one `beginFrame`. The outermost call redraws if the buffer changed. */
    endFrame(): void;
    /** Keydown subscription. `key` is `KeyboardEvent.key`. */
    onKey(handler: KeyHandler): void;
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key: string): boolean;
    /**
     * Paint the grid in screen space, top-left of the viewport.
     * The camera is ignored, and the glass is drawn after the world.
     */
    draw(frame: DrawFrame): void;
    private raster;
    private paintCell;
    private paintCursor;
    private ensureGl;
    private feed;
    private feedCsi;
    private dispatchCsi;
    private sgr;
    private control;
    private putGlyph;
    private indexDown;
    private reverseIndex;
    private backspace;
    private tab;
    private place;
    private pn;
    private scrollIntoView;
    private ink;
    private resetPen;
    private resetAll;
    private fillBlank;
    private applyBackground;
    private inRange;
    private flush;
    private armKeys;
}
export {};
