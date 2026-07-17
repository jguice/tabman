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
    if (tabInfo.app === 'arclittle') {
        return switchToLittleArcWindow(tabInfo);
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
                    const windowId = windows[i].id();
                    const win = arc.windows.byId(windowId);
                    arc.activate();
                    win.tabs[j].select();
                    raiseArcWindow(windowId);
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

// Arc has no native way to raise a window: setting window.index throws
// (read-only in practice) and its 'focus' command targets Arc spaces, not
// windows. But Arc stamps each accessibility window with an AXIdentifier of
// "big[Incognito]BrowserWindow-<window id>", so the exact window can be
// raised through accessibility. Requires Alfred's Accessibility permission.
// Limitation: windows on other macOS Spaces are absent from the accessibility
// list and cannot be raised this way.
function raiseArcWindow(windowId) {
    try {
        const proc = Application('System Events').processes['Arc'];
        const wins = proc.windows();
        for (let i = 0; i < wins.length; i++) {
            try {
                if (String(wins[i].attributes['AXIdentifier'].value()).indexOf(windowId) !== -1) {
                    wins[i].actions['AXRaise'].perform();
                    return;
                }
            } catch (e) {}
        }
        console.log('Arc window ' + windowId + ' not in accessibility list (other Space?)');
    } catch (error) {
        console.log('Error raising Arc window: ' + error);
    }
}

// Little Arc windows exist only at the accessibility layer; raise by their
// stable AXIdentifier.
function switchToLittleArcWindow(tabInfo) {
    try {
        Application('Arc').activate();
        const proc = Application('System Events').processes['Arc'];
        const wins = proc.windows();
        for (let i = 0; i < wins.length; i++) {
            try {
                if (String(wins[i].attributes['AXIdentifier'].value()) === tabInfo.axId) {
                    wins[i].actions['AXRaise'].perform();
                    return "Switched to Little Arc window";
                }
            } catch (e) {}
        }
        return "Little Arc window not found (was it closed?)";
    } catch (error) {
        console.log('Error switching to Little Arc window: ' + error);
        return "Failed to switch to Little Arc window";
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
