/**
 * What `Utilities.wrap` can attach.
 * An element is used directly. A Canvas is used through `element`.
 * An Engine or Terminal is used through `canvas.element`.
 *
 * Class names match emoji-engine-2d, so one stylesheet covers both.
 */
export type WrapTarget =
  | HTMLElement
  | { element: HTMLElement }
  | { canvas: { element: HTMLElement } };

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
export const Utilities: UtilitiesContract = {
  /**
   * Wrap a target in a column. The header has a title, a middle slot, and a
   * fullscreen button. The button label is "F11 Fullscreen", or "Esc Exit" while the
   * document is already fullscreen. The footer is a plain div. Either bar can be omitted.
   */
  wrap(target: WrapTarget, options: WrapOptions = {}): WrapResult {
    const surface = resolveElement(target);
    const showHeader = options.header !== false;
    const showFooter = options.footer !== false;

    const wrap = document.createElement('div');
    wrap.className = 'ee-wrap';
    assign(wrap, {
      display: 'flex',
      flexDirection: 'column',
      width: 'fit-content',
      background: '#16161a',
      color: '#f2f2f2',
      fontFamily: 'sans-serif',
      fontSize: '14px',
    });

    let titleEl: HTMLElement | null = null;
    let headerMiddle: HTMLElement | null = null;
    if (showHeader) {
      const header = document.createElement('header');
      header.className = 'ee-header';
      assign(header, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
      });

      titleEl = document.createElement('span');
      titleEl.className = 'ee-title';
      titleEl.textContent = options.title ?? '';
      assign(titleEl, { fontWeight: '600' });

      headerMiddle = document.createElement('div');
      headerMiddle.className = 'ee-middle';
      assign(headerMiddle, {
        flex: '1 1 auto',
        textAlign: 'center',
        minWidth: '0',
      });

      const button = document.createElement('button');
      button.className = 'ee-fullscreen';
      button.setAttribute('type', 'button');
      assign(button, {
        marginLeft: '8px',
        cursor: 'pointer',
        background: 'transparent',
        color: 'inherit',
        border: '1px solid #666',
        borderRadius: '4px',
        padding: '2px 8px',
      });
      syncFullscreenButton(button);
      button.addEventListener('click', () => toggleFullscreen(wrap));
      document.addEventListener('fullscreenchange', () => syncFullscreenButton(button));

      header.append(titleEl, headerMiddle, button);
      wrap.append(header);
    }

    assign(surface, { display: 'block' });
    wrap.append(surface);

    let footer: HTMLElement | null = null;
    if (showFooter) {
      footer = document.createElement('div');
      footer.className = 'ee-footer';
      assign(footer, {
        padding: '4px 10px',
        minHeight: '1.4em',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '12px',
      });
      wrap.append(footer);
    }

    return {
      wrap,
      headerMiddle,
      footer,
      setTitle(title: string) {
        if (titleEl) titleEl.textContent = title;
      },
    };
  },
};

function resolveElement(target: WrapTarget): HTMLElement {
  if (isElement(target)) return target;
  if (isElementHost(target)) return target.element;
  if (isCanvasHost(target)) return target.canvas.element;
  throw new TypeError('Utilities.wrap target must be an element, a Canvas, or an object with a canvas');
}

function isElement(value: WrapTarget): value is HTMLElement {
  return typeof value === 'object' && value !== null && 'nodeType' in value && value.nodeType === 1;
}

function isElementHost(value: WrapTarget): value is { element: HTMLElement } {
  return typeof value === 'object' && value !== null && 'element' in value && isNodeElement(value.element);
}

function isCanvasHost(value: WrapTarget): value is { canvas: { element: HTMLElement } } {
  if (typeof value !== 'object' || value === null || !('canvas' in value)) return false;
  const canvas = value.canvas;
  return typeof canvas === 'object' && canvas !== null && 'element' in canvas && isNodeElement(canvas.element);
}

function isNodeElement(value: unknown): value is HTMLElement {
  return typeof value === 'object' && value !== null && 'nodeType' in value
    && (value as { nodeType: number }).nodeType === 1;
}

function assign(element: HTMLElement, rules: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, rules);
}

function fullscreenLabel(active: boolean): string {
  return active ? 'Esc Exit' : 'F11 Fullscreen';
}

/** The label follows the document, including a fullscreen element that is not this wrap. */
function syncFullscreenButton(button: HTMLButtonElement): void {
  const label = fullscreenLabel(Boolean(document.fullscreenElement));
  button.textContent = label;
  button.setAttribute('aria-label', label);
}

function toggleFullscreen(wrap: HTMLElement): void {
  const request = document.fullscreenElement
    ? document.exitFullscreen()
    : wrap.requestFullscreen();
  void Promise.resolve(request).catch(() => {});
}
