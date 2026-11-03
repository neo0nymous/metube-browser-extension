async function saveOptions() {
    const status = document.getElementById('saved');
    status.classList.remove('hidden');
    try {
        const metube = metubeAddress(document.getElementById('metube').value);
        const sites = document.getElementById('additional').value;
        sitePatterns(sites);
        const advancedSettings = {};
        document.querySelectorAll('#advanced_settings input').forEach(input => {
            advancedSettings[input.name] = input.checked;
        });
        await chrome.storage.sync.set({
            metube, sites, advancedSettings,
            clickBehavior: document.querySelector('input[name="click-behavior"]:checked').value,
            contextMenuClickBehavior: document.querySelector('input[name="context-menu-click-behavior"]:checked').value,
            defaultFormat: document.getElementById('default_format').value
        });
        status.textContent = 'Settings saved!';
        status.style.color = 'var(--success)';
    } catch (error) {
        status.textContent = error.message;
        status.style.color = 'var(--error)';
    }
}

async function restoreOptions() {
    const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    document.getElementById('metube').value = data.metube;
    document.getElementById('additional').value = data.sites;
    document.getElementById(data.clickBehavior).checked = true;
    document.getElementById(data.contextMenuClickBehavior).checked = true;
    document.getElementById('default_format').value = data.defaultFormat;
    for (const [key, value] of Object.entries({...DEFAULT_SETTINGS.advancedSettings, ...data.advancedSettings})) {
        document.getElementById(key).checked = value;
    }
}

window.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    saveOptions();
});

function displayStatus(status) {
    if (!status) return;
    document.getElementById('last-status').classList.remove('hidden');
    const message = document.getElementById('status-message');
    message.textContent = status.message;
    message.style.color = status.success ? 'var(--success)' : 'var(--error)';
    document.getElementById('status-time').textContent = new Date(status.time).toLocaleString();
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lastStatus) displayStatus(changes.lastStatus.newValue);
});
window.addEventListener('DOMContentLoaded', async () => {
    const {lastStatus} = await chrome.storage.local.get('lastStatus');
    displayStatus(lastStatus);
});
