/**
 * Optional page chrome. Call it from the application.
 * Canvas, Terminal, and Engine never construct it.
 */
export const Utilities = {
    /**
     * Wrap a target in a column. The header has a title, a middle slot, and a
     * fullscreen button. The button label is "F11 Fullscreen", or "Esc Exit" while the
     * document is already fullscreen. The footer is a plain div. Either bar can be omitted.
     */
    wrap(target, options = {}) {
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
        let titleEl = null;
        let headerMiddle = null;
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
        let footer = null;
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
            setTitle(title) {
                if (titleEl)
                    titleEl.textContent = title;
            },
        };
    },
};
function resolveElement(target) {
    if (isElement(target))
        return target;
    if (isElementHost(target))
        return target.element;
    if (isCanvasHost(target))
        return target.canvas.element;
    throw new TypeError('Utilities.wrap target must be an element, a Canvas, or an object with a canvas');
}
function isElement(value) {
    return typeof value === 'object' && value !== null && 'nodeType' in value && value.nodeType === 1;
}
function isElementHost(value) {
    return typeof value === 'object' && value !== null && 'element' in value && isNodeElement(value.element);
}
function isCanvasHost(value) {
    if (typeof value !== 'object' || value === null || !('canvas' in value))
        return false;
    const canvas = value.canvas;
    return typeof canvas === 'object' && canvas !== null && 'element' in canvas && isNodeElement(canvas.element);
}
function isNodeElement(value) {
    return typeof value === 'object' && value !== null && 'nodeType' in value
        && value.nodeType === 1;
}
function assign(element, rules) {
    Object.assign(element.style, rules);
}
function fullscreenLabel(active) {
    return active ? 'Esc Exit' : 'F11 Fullscreen';
}
/** The label follows the document, including a fullscreen element that is not this wrap. */
function syncFullscreenButton(button) {
    const label = fullscreenLabel(Boolean(document.fullscreenElement));
    button.textContent = label;
    button.setAttribute('aria-label', label);
}
function toggleFullscreen(wrap) {
    const request = document.fullscreenElement
        ? document.exitFullscreen()
        : wrap.requestFullscreen();
    void Promise.resolve(request).catch(() => { });
}
//# sourceMappingURL=utilities.js.map