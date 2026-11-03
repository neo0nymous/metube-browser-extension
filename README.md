# MeTube Downloader

A Chrome extension that sends video links to your own MeTube server. No build step or dependencies are needed to use it.

## Load in Chrome

1. Download or clone this repository and keep it on your computer.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select this repository's **src** folder.
4. Open the extension's **Options**, enter your MeTube server address, and save.

After changing extension files, click **Reload** on its card in `chrome://extensions`, then reopen the options page. Refresh existing YouTube tabs to activate the video-menu button.

## Use

- Open a video’s three-dot menu on YouTube and click **Download with MeTube**. This uses your context-menu behavior setting.
- Right-click a YouTube link and choose **Send to MeTube**.
- Configure the toolbar button to open MeTube or submit the current tab.
- Choose a format, group downloads by source website, or queue them without starting.
- The toolbar badge shows `OK` or `ERR` after submission. Hover over the icon for details, or open Options to read the last operation and its full error message. The YouTube menu also displays errors directly.
- For servers behind a login, sign in through the MeTube page first. Submissions include server login cookies; proxy rules and browser cookie policies still apply.
- Add other sites using one HTTP(S) match pattern per line, such as `https://vimeo.com/*`. Clear the field and save to remove custom sites.

The extension requires a running MeTube server. Downloading happens on that server.

## Development checks

Run `node tests/regression.cjs` and `node tests/youtube.cjs` with Node.js. No dependencies are required. These checks mock Chrome and MeTube; also check the loaded extension with your server after changing browser behavior.
