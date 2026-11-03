// YouTube reuses its popup menu across video cards and client-side navigation.
let selectedVideoUrl;
const videoCards = 'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model';
const menuTriggers = 'ytd-menu-renderer, yt-menu-renderer, .yt-lockup-metadata-view-model__menu-button';

function addDownloadButton() {
    if (!selectedVideoUrl) {
        document.querySelectorAll('.metube-download').forEach(button => button.remove());
        return;
    }
    for (const menu of document.querySelectorAll('ytd-menu-popup-renderer')) {
        if (!menu.getClientRects().length) continue;
        let button = menu.querySelector('.metube-download');
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'metube-download';
            button.setAttribute('role', 'menuitem');
            button.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                const url = button.dataset.videoUrl;
                button.disabled = true;
                button.textContent = 'Sending to MeTube…';
                try {
                    const response = await chrome.runtime.sendMessage({type: 'metube-download', url});
                    if (!response?.ok) throw new Error(response?.message || 'Could not send to MeTube.');
                    if (button.dataset.videoUrl === url) button.textContent = '✓ Sent to MeTube';
                } catch (error) {
                    if (button.dataset.videoUrl === url) {
                        button.textContent = `MeTube: ${error.message} Click to retry.`;
                        button.title = error.message;
                        button.disabled = false;
                    }
                }
            });
            const items = menu.querySelector('#items') || menu;
            items.prepend(button);
        }
        if (button.dataset.videoUrl !== selectedVideoUrl) {
            button.dataset.videoUrl = selectedVideoUrl;
            button.textContent = '↓ Download with MeTube';
            button.title = 'Send this video to your MeTube server';
            button.disabled = false;
        }
    }
}

document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest(menuTriggers)) return;
    const card = event.target.closest(videoCards);
    const link = card?.querySelector('a[href*="/watch?"], a[href^="/shorts/"]');
    selectedVideoUrl = link ? new URL(link.href, location.origin).href : undefined;
    // Wait until YouTube has opened or repopulated the shared popup.
    requestAnimationFrame(addDownloadButton);
}, true);

new MutationObserver(addDownloadButton).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden']
});
document.addEventListener('yt-navigate-start', () => {
    selectedVideoUrl = undefined;
    addDownloadButton();
});
