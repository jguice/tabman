#!/usr/bin/osascript -l JavaScript

// Chromium-family apps sharing the same scripting interface, keyed by the
// 'app' field emitted by search_tabs.js. To support another one, add it here
// and add a collect call in search_tabs.js.
const CHROMIUM_APPS = {
    chrome: 'Google Chrome',
    brave: 'Brave Browser'
};

function run(argv) {
    const tabInfo = JSON.parse(argv[0]);

    if (tabInfo.app === 'arc') {
        return switchToArcTab(tabInfo);
    }
    if (tabInfo.app === 'ghostty') {
        return switchToGhosttyTab(tabInfo);
    }
    return switchToChromiumTab(CHROMIUM_APPS[tabInfo.app] || 'Google Chrome', tabInfo);
}

// IMPORTANT: window collections are z-ordered, and JXA references like
// windows[3] are lazy index queries re-evaluated on every use - NOT object
// handles. The first raise reshuffles the z-order, so index-based references
// silently drift to a different window mid-switch. Always pin the window by
// id BEFORE activating or raising anything.

function switchToChromiumTab(appName, tabInfo) {
    try {
        const browser = Application(appName);

        const windows = browser.windows;
        if (tabInfo.windowIndex >= windows.length) {
            throw new Error('Target window not found');
        }
        const win = browser.windows.byId(windows[tabInfo.windowIndex].id());

        // Verify the tab is still where we found it (tabs move); if not,
        // re-find it by URL within the window.
        let tabIndex = tabInfo.tabIndex;
        const urls = win.tabs.url();
        if (urls[tabIndex] !== tabInfo.url) {
            tabIndex = urls.indexOf(tabInfo.url);
            if (tabIndex === -1) {
                throw new Error('Target tab not found');
            }
        }

        browser.activate();
        win.visible = true;
        win.index = 1;
        win.activeTabIndex = tabIndex + 1; // 1-based

        return "Switched to tab successfully";

    } catch (error) {
        console.log('Error switching to tab: ' + error);
        try {
            // If something goes wrong, fall back to opening the URL
            const browser = Application(appName);
            const windows = browser.windows();
            if (windows.length > 0) {
                windows[0].make({new: "tab", with: tabInfo.url});
                browser.activate();
            }
            return "Opened URL in new tab (fallback)";
        } catch (fallbackError) {
            console.log('Error in fallback: ' + fallbackError);
            return "Failed to switch tab or open URL";
        }
    }
}

function switchToArcTab(tabInfo) {
    try {
        const arc = Application('Arc');

        // Find the tab by its stable id across all windows, then pin the
        // window by id before any raise can reorder the list.
        const windows = arc.windows;
        const windowCount = windows.length;
        for (let i = 0; i < windowCount; i++) {
            const ids = windows[i].tabs.id();
            for (let j = 0; j < ids.length; j++) {
                if (ids[j] === tabInfo.tabId) {
                    const win = arc.windows.byId(windows[i].id());
                    arc.activate();
                    try { win.index = 1; } catch (e) {}
                    win.tabs[j].select();
                    return "Switched to tab successfully";
                }
            }
        }

        return "Arc tab not found (was it closed?)";

    } catch (error) {
        console.log('Error switching to Arc tab: ' + error);
        return "Failed to switch to Arc tab";
    }
}

function switchToGhosttyTab(tabInfo) {
    try {
        const ghostty = Application('Ghostty');

        const windows = ghostty.windows;
        const windowCount = windows.length;
        for (let i = 0; i < windowCount; i++) {
            const ids = windows[i].tabs.id();
            for (let j = 0; j < ids.length; j++) {
                if (ids[j] === tabInfo.tabId) {
                    const win = ghostty.windows.byId(windows[i].id());
                    ghostty.activate();
                    ghostty.activateWindow(win);
                    ghostty.selectTab(win.tabs[j]);
                    return "Switched to tab successfully";
                }
            }
        }

        return "Ghostty tab not found (was it closed?)";

    } catch (error) {
        console.log('Error switching to Ghostty tab: ' + error);
        return "Failed to switch to Ghostty tab";
    }
}
