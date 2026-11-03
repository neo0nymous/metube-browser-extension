const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const assert = require('node:assert/strict');

async function run() {
    const listeners = {};
    let button, observer, sentUrl, fail = false, count = 0;
    const menu = {
        getClientRects: () => [1],
        querySelector: selector => selector === '#items' ? menu : button,
        prepend: item => { button = item; count++; }
    };
    const document = {
        documentElement: {},
        addEventListener: (name, listener) => { listeners[name] = listener; },
        querySelectorAll: selector => selector === '.metube-download' ? (button ? [button] : []) : [menu],
        createElement: () => ({
            dataset: {}, setAttribute() {},
            addEventListener(name, listener) { this[name] = listener; },
            remove() { button = undefined; }
        })
    };
    class Element {
        constructor(href) { this.href = href; }
        closest(selector) {
            if (!selector.includes('ytd-video-renderer')) return this;
            return this.href ? {querySelector: () => ({href: this.href})} : null;
        }
    }
    class MutationObserver {
        constructor(callback) { observer = callback; }
        observe() {}
    }
    const chrome = {runtime: {sendMessage: async message => {
        sentUrl = message.url;
        return fail ? {ok: false, message: 'Server offline'} : {ok: true};
    }}};
    new Function('document', 'Element', 'MutationObserver', 'chrome', 'location', 'requestAnimationFrame',
        readFileSync(join(__dirname, '../src/youtube.js'), 'utf8'))(
        document, Element, MutationObserver, chrome, {origin: 'https://www.youtube.com'}, callback => callback());
    const open = href => listeners.click({target: new Element(href)});
    const click = () => button.click({preventDefault() {}, stopPropagation() {}});
    open('/watch?v=first');
    assert.equal(button.textContent, '↓ Download with MeTube');
    observer();
    assert.equal(count, 1, 'Do not duplicate the menu item');
    await click();
    assert.equal(sentUrl, 'https://www.youtube.com/watch?v=first');
    assert.equal(button.textContent, '✓ Sent to MeTube');
    open('/watch?v=second');
    assert.equal(button.disabled, false, 'Reset shared popup for a different video');
    fail = true;
    await click();
    assert.equal(sentUrl, 'https://www.youtube.com/watch?v=second');
    assert.equal(button.title, 'Server offline');
    assert.equal(button.disabled, false, 'Allow retry after failure');
    fail = false;
    await click();
    assert.equal(button.textContent, '✓ Sent to MeTube');
    open(null);
    assert.equal(button, undefined, 'Remove video action from unrelated menus');
    open('/watch?v=third');
    listeners['yt-navigate-start']();
    assert.equal(button, undefined, 'Clear stale video when navigating');
    console.log('YouTube menu checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
