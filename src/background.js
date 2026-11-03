importScripts('settings.js');

async function updateContextMenu() {
    try {
        const {sites} = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        const targetUrlPatterns = sitePatterns(sites);
        await chrome.contextMenus.removeAll();
        await new Promise((resolve, reject) => {
            chrome.contextMenus.create({
                id: 'metube', title: 'Send to MeTube', contexts: ['link'], targetUrlPatterns
            }, () => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve();
            });
        });
    } catch (error) {
        await showStatus(false, error.message);
    }
}

chrome.runtime.onInstalled.addListener(updateContextMenu);
chrome.runtime.onStartup.addListener(updateContextMenu);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.sites) return updateContextMenu();
});

async function showStatus(success, message) {
    await chrome.storage.local.set({lastStatus: {success, message, time: Date.now()}});
    await chrome.action.setBadgeBackgroundColor({color: success ? '#287a36' : '#b3261e'});
    await chrome.action.setBadgeText({text: success ? 'OK' : 'ERR'});
    await chrome.action.setTitle({title: `MeTube: ${message}`});
}

async function sendVideoUrlToMetube(videoUrl, metubeUrl, format = 'any', advancedSettings = {}) {
    const {hostname} = httpUrl(videoUrl);
    const settings = {...DEFAULT_SETTINGS.advancedSettings, ...advancedSettings};
    const postData = {
        quality: 'best', format, url: videoUrl, auto_start: !settings.disable_auto_start
    };
    for (const key of ['folder', 'custom_name_prefix']) {
        if (settings[key]) postData[key] = hostname.replace(/^www\./, '');
    }
    const endpoint = metubeAddress(metubeUrl) + '/add';
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
            body: JSON.stringify(postData)
        });
    } catch (error) {
        throw new Error(`Could not reach ${endpoint}: ${error.message}. Check the server address, Chrome site access, and HTTPS certificate. Open the server directly to check connectivity.`);
    }
    const body = await response.text();
    let result;
    try { result = JSON.parse(body); } catch { /* HTTP errors can return plain text or a login page. */ }
    const detail = result?.msg || result?.error || result?.message;
    const plainText = !body.trim().startsWith('<') ? body.trim().slice(0, 300) : '';
    if (!response.ok) {
        const hint = [401, 403].includes(response.status) ? ' Check server login or proxy access.' :
            response.status === 404 ? ' Check the MeTube address and any reverse-proxy path.' : '';
        throw new Error(`${endpoint} returned HTTP ${response.status}: ${detail || plainText || response.statusText || 'Request rejected'}.${hint}`);
    }
    if (!result || typeof result !== 'object') {
        throw new Error(`${endpoint} did not return MeTube JSON. Check whether the address points to a login page or another service.`);
    }
    if (result.status !== 'ok') throw new Error(`${endpoint}: ${detail || 'MeTube rejected the URL.'}`);
    await showStatus(true, 'URL sent successfully.');
}

async function handleClick(tab, linkUrl) {
    try {
        const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        if (!data.metube) {
            await chrome.runtime.openOptionsPage();
            return {ok: false, message: 'Set your MeTube address in the extension options.'};
        }
        const metubeUrl = metubeAddress(data.metube);
        const behavior = linkUrl === undefined ? data.clickBehavior : data.contextMenuClickBehavior;
        if (behavior === 'go-to-metube') {
            await openTab(metubeUrl, tab);
            return {ok: true};
        }
        await sendVideoUrlToMetube(linkUrl === undefined ? tab.url : linkUrl,
            metubeUrl, data.defaultFormat, data.advancedSettings);
        if (['send-current-url-and-switch', 'context-menu-send-current-url-and-switch'].includes(behavior)) {
            await openTab(metubeUrl, tab);
        }
        return {ok: true};
    } catch (error) {
        await showStatus(false, error.message);
        return {ok: false, message: error.message};
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'metube-download' || !sender.tab) return;
    try {
        const url = httpUrl(message.url);
        if (!['www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) return;
    } catch {
        return;
    }
    handleClick(sender.tab, message.url).then(sendResponse);
    return true;
});

chrome.contextMenus.onClicked.addListener((item, tab) => {
    if (item.menuItemId === 'metube') return handleClick(tab, item.linkUrl);
});
chrome.action.onClicked.addListener(tab => handleClick(tab));

async function openTab(url, currentTab) {
    const tabs = await chrome.tabs.query({url: url + '/*'});
    if (tabs.length) {
        await chrome.tabs.update(tabs[0].id, {active: true});
        await chrome.windows.update(tabs[0].windowId, {focused: true});
    } else {
        await chrome.tabs.create({url, windowId: currentTab.windowId, index: currentTab.index + 1});
    }
}
