/**
 * What `Utilities.wrap` can attach.
 * An element is used directly. A Canvas is used through `element`.
 * An Engine or Terminal is used through `canvas.element`.
 *
 * Class names match emoji-engine-2d, so one stylesheet covers both.
 */
export type WrapTarget = HTMLElement | {
    element: HTMLElement;
} | {
    canvas: {
        element: HTMLElement;
    };
};
/** Which optional bars to build. Both default to on. */
export interface WrapOptions {
    /** Title on the left side of the header. */
    title?: string;
    /** Include the header. Default true. */
    header?: boolean;
    /** Include the footer. Default true. */
    footer?: boolean;
}
/** The nodes `wrap` builds. `headerMiddle` and `footer` are null when that bar is off. */
export interface WrapResult {
    /** Column that holds the header, the target, and the footer. */
    wrap: HTMLElement;
    /** Empty center slot of the header, between the title and the fullscreen button. */
    headerMiddle: HTMLElement | null;
    /** Plain div under the target. Fill it from the caller. */
    footer: HTMLElement | null;
    /** Replace the header title. No effect when the header was not built. */
    setTitle(title: string): void;
}
interface UtilitiesContract {
    wrap(target: WrapTarget, options?: WrapOptions): WrapResult;
}
/**
 * Optional page chrome. Call it from the application.
 * Canvas, Terminal, and Engine never construct it.
 */
export declare const Utilities: UtilitiesContract;
export {};
