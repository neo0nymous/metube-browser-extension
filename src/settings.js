const DEFAULT_SETTINGS = {
    metube: '',
    sites: '',
    clickBehavior: 'go-to-metube',
    contextMenuClickBehavior: 'context-menu-send-current-url',
    defaultFormat: 'any',
    advancedSettings: {folder: false, custom_name_prefix: false, disable_auto_start: false}
};

const DEFAULT_SITES = ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://youtu.be/*'];

function httpUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
        throw new Error('Use an HTTP or HTTPS URL.');
    }
    return url;
}

function metubeAddress(value) {
    const url = httpUrl(value.trim());
    if (url.username || url.password || url.search || url.hash) {
        throw new Error('MeTube URL must not contain credentials, a query, or a fragment.');
    }
    return url.href.replace(/\/+$/, '');
}

function sitePatterns(value) {
    const patterns = value.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
    for (const pattern of patterns) {
        if (!/^(https?|\*):\/\/(\*|(?:\*\.)?[a-z\d-]+(?:\.[a-z\d-]+)*)\/[^\s#]*$/i.test(pattern)) {
            throw new Error(`Invalid site pattern: ${pattern}. Example: https://vimeo.com/*`);
        }
    }
    return [...new Set([...DEFAULT_SITES, ...patterns])];
}
