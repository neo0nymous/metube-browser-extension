async function runTests(settingsSource, backgroundSource, optionsSource) {
    let checks = 0;
    function assert(condition, message) {
        checks++;
        if (!condition) throw new Error(message);
    }
    async function rejects(action, message) {
        let failed = false;
        try { await action(); } catch { failed = true; }
        assert(failed, message);
    }
    const listeners = {};
    const event = name => ({addListener: handler => { listeners[name] = handler; }});
    let lastStatus;
    let stored = {}, request, menu, badge, title, opened = 0, saves = 0;
    let response = {ok: true, json: async () => ({status: 'ok'})};
    const chrome = {
        runtime: {onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup'), openOptionsPage: async () => { opened++; }},
        storage: {
            local: {set: async data => { lastStatus = data.lastStatus; }, get: async () => ({lastStatus})},
            sync: {get: async defaults => ({...defaults, ...stored}), set: async data => { stored = data; saves++; }},
            onChanged: event('changed')
        },
        contextMenus: {onClicked: event('context'), removeAll: async () => { menu = null; }, create: (data, callback) => { menu = data; callback(); }},
        action: {
            onClicked: event('click'), setBadgeBackgroundColor: async () => {},
            setBadgeText: async data => { badge = data.text; }, setTitle: async data => { title = data.title; }
        },
        tabs: {query: async () => [], create: async () => { opened++; }},
        windows: {update: async () => {}}
    };
    const fetch = async (url, options) => {
        request = {url, credentials: options.credentials, body: JSON.parse(options.body)};
        if (response instanceof Error) throw response;
        const current = response;
        return {...current, text: async () => {
            if (current.body !== undefined) return current.body;
            try { return JSON.stringify(await current.json()); } catch { return 'not json'; }
        }};
    };
    const api = new Function('chrome', 'fetch', 'importScripts', settingsSource + '\n' + backgroundSource +
        '\nreturn {sendVideoUrlToMetube, sitePatterns, metubeAddress, DEFAULT_SITES};')(chrome, fetch, () => {});
    const tab = {url: 'https://www.youtube.com/watch?v=123', index: 0, windowId: 1};
    await listeners.click(tab);
    assert(opened === 1, 'Unconfigured extension opens settings');
    stored = {metube: 'https://metube.example/'};
    await listeners.click(tab);
    assert(opened === 2 && !request, 'Missing click setting defaults to opening MeTube');
    await api.sendVideoUrlToMetube(tab.url, stored.metube);
    assert(request.url === 'https://metube.example/add', 'Normalize server URL');
    assert(request.body.format === 'any' && request.body.auto_start === true, 'Missing settings use defaults');
    assert(badge === 'OK', 'Show successful submission');
    assert(request.credentials === 'include', 'Include server login cookies with submissions');
    await api.sendVideoUrlToMetube(tab.url, stored.metube, 'mp3', {folder: true, custom_name_prefix: true, disable_auto_start: true});
    assert(request.body.folder === 'youtube.com' && request.body.custom_name_prefix === 'youtube.com', 'Hostname options');
    assert(request.body.auto_start === false && request.body.format === 'mp3', 'Format and manual start');
    stored.sites = ' https://vimeo.com/* \n\nhttps://vimeo.com/*';
    await listeners.installed();
    assert(menu.targetUrlPatterns.length === 4, 'Installation restores and deduplicates sites');
    await listeners.startup();
    assert(menu.targetUrlPatterns.includes('https://vimeo.com/*'), 'Startup restores sites');
    stored.sites = '';
    await listeners.changed({sites: {newValue: ''}}, 'sync');
    assert(menu.targetUrlPatterns.length === 3, 'Clearing sites removes custom patterns');
    stored.sites = 'https://*.example.com/*';
    await listeners.changed({sites: {newValue: stored.sites}}, 'sync');
    assert(menu.targetUrlPatterns.length === 4, 'Changes add custom patterns');
    await rejects(() => api.sitePatterns('https://example.com'), 'Reject missing match-pattern path');
    await rejects(() => api.sitePatterns('https://bad.*.com/*'), 'Reject misplaced wildcard');
    await rejects(() => api.metubeAddress('ftp://example.com'), 'Reject unsupported server scheme');
    await rejects(() => api.metubeAddress('https://example.com/?token=x'), 'Reject ambiguous server query');
    stored.clickBehavior = 'send-current-url-and-switch';
    for (const failure of [
        {ok: false, status: 503},
        {ok: true, json: async () => ({status: 'error', msg: 'Queue rejected'})},
        {ok: true, json: async () => { throw new Error('Invalid JSON'); }},
        new Error('Network unavailable')
    ]) {
        response = failure;
        const before = opened;
        await listeners.click(tab);
        assert(badge === 'ERR' && title.startsWith('MeTube: '), 'Show request error');
        assert(opened === before, 'Do not switch after failure');
    }
    response = {ok: true, json: async () => ({status: 'ok'})};
    const beforeSuccess = opened;
    await listeners.click(tab);
    assert(opened === beforeSuccess + 1 && badge === 'OK', 'Successful toolbar submission switches to MeTube');
    const previousRequest = request;
    await listeners.click({...tab, url: 'chrome://extensions/'});
    assert(badge === 'ERR' && request === previousRequest, 'Reject unsupported tab before fetching');
    await listeners.click({...tab, url: 'invalid'});
    assert(badge === 'ERR', 'Handle malformed tab URL');
    await listeners.context({menuItemId: 'metube', linkUrl: tab.url}, tab);
    assert(badge === 'OK', 'Context-menu submission recovers after an error');
    let reply;
    const keepAlive = listeners.message({type: 'metube-download', url: tab.url}, {tab}, result => { reply = result; });
    assert(keepAlive === true, 'Keep content-script response channel open');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert(reply?.ok === true, 'YouTube menu submits through existing handler');
    reply = undefined;
    listeners.message({type: 'metube-download', url: 'https://example.com/'}, {tab}, result => { reply = result; });
    assert(reply === undefined, 'Ignore unrelated message URLs');
    response = new Error('Server offline');
    listeners.message({type: 'metube-download', url: tab.url}, {tab}, result => { reply = result; });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert(reply?.ok === false && reply.message.includes('Server offline'), 'Return failure to YouTube menu');
    assert(lastStatus.message.includes('https://metube.example/add'), 'Persist the failing endpoint for diagnostics');
    for (const [serverResponse, expected] of [
        [{ok: false, status: 400, body: '400: unsupported format'}, 'unsupported format'],
        [{ok: false, status: 403, body: '{"msg":"Access denied"}'}, 'Access denied'],
        [{ok: true, body: '<html>Login</html>'}, 'login page'],
        [{ok: false, status: 404, body: '<html>Not found</html>'}, 'reverse-proxy path']
    ]) {
        response = serverResponse;
        const result = await listeners.context({menuItemId: 'metube', linkUrl: tab.url}, tab);
        assert(result.ok === false && result.message.includes(expected), 'Expose actionable server response');
    }
    const status = {classList: {remove() {}}, style: {}};
    const elements = {saved: status, metube: {value: 'https://metube.example/'}, additional: {value: 'bad pattern'}, default_format: {value: 'any'}};
    const document = {
        getElementById: id => elements[id], querySelectorAll: () => [],
        querySelector: selector => selector === 'form' ? {addEventListener() {}} : {value: 'go-to-metube'}
    };
    const options = new Function('chrome', 'document', 'window', settingsSource + '\n' + optionsSource + '\nreturn {saveOptions, restoreOptions, displayStatus};')(chrome, document, {addEventListener() {}});
    const save = options.saveOptions;
    await save();
    assert(saves === 0 && status.textContent.includes('Invalid site pattern'), 'Invalid form is not saved');
    elements.additional.value = 'https://vimeo.com/*';
    await save();
    assert(saves === 1 && stored.metube === 'https://metube.example' && status.textContent === 'Settings saved!', 'Valid form saves normalized settings');
    for (const id of ['go-to-metube', 'context-menu-send-current-url', 'folder', 'custom_name_prefix', 'disable_auto_start']) elements[id] = {};
    stored = {};
    await options.restoreOptions();
    assert(elements['go-to-metube'].checked && elements.default_format.value === 'any', 'Options use shared defaults');
    stored = {advancedSettings: {folder: true}};
    await options.restoreOptions();
    assert(elements.folder.checked && elements.disable_auto_start.checked === false, 'Partial legacy advanced settings restore safely');
    for (const id of ['last-status', 'status-message', 'status-time']) elements[id] = {classList: {remove() {}}, style: {}};
    options.displayStatus(lastStatus);
    assert(elements['status-message'].textContent === lastStatus.message, 'Show persisted error in options');
    return `${checks} checks passed`;
}

if (typeof require === 'function') {
    const {readFileSync} = require('node:fs');
    const {join} = require('node:path');
    const source = name => readFileSync(join(__dirname, '../src', name), 'utf8');
    runTests(source('settings.js'), source('background.js'), source('options.js'))
        .then(console.log).catch(error => { console.error(error); process.exitCode = 1; });
}
