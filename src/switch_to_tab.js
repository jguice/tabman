#!/usr/bin/osascript -l JavaScript

// Chromium-family apps sharing the same scripting interface, keyed by the
// 'app' field emitted by search_tabs.js. To support e.g. Brave, add it here
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

function switchToChromiumTab(appName, tabInfo) {
    try {
        const browser = Application(appName);
        browser.includeStandardAdditions = true;

        // Get all windows
        const windows = browser.windows();

        // Find the target window by index
        let targetWindow = null;
        for (let i = 0; i < windows.length; i++) {
            if (i === tabInfo.windowIndex) {
                targetWindow = windows[i];
                break;
            }
        }

        if (!targetWindow) {
            throw new Error('Target window not found');
        }

        // Get all tabs in the window
        const tabs = targetWindow.tabs();

        // Find the target tab by index
        let targetTab = null;
        for (let i = 0; i < tabs.length; i++) {
            if (i === tabInfo.tabIndex) {
                targetTab = tabs[i];
                break;
            }
        }

        if (!targetTab) {
            throw new Error('Target tab not found');
        }

        // Make the window active first
        targetWindow.visible = true;
        targetWindow.index = 1;

        // Select the specific tab
        targetWindow.activeTabIndex = tabInfo.tabIndex + 1; // JXA uses 1-based indexing

        // Focus the browser
        browser.activate();

        return "Switched to tab successfully";

    } catch (error) {
        console.log('Error switching to tab: ' + error);
        try {
            // If something goes wrong, fall back to opening the URL
            const browser = Application(appName);
            browser.includeStandardAdditions = true;
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

        // Find the tab by its stable id across all windows: window order in
        // Arc is recency-based and shifts between search time and Enter.
        const windows = arc.windows;
        const windowCount = windows.length;
        for (let i = 0; i < windowCount; i++) {
            const ids = windows[i].tabs.id();
            for (let j = 0; j < ids.length; j++) {
                if (ids[j] === tabInfo.tabId) {
                    // App, then window, then tab.
                    arc.activate();
                    try { windows[i].index = 1; } catch (e) {}
                    windows[i].tabs[j].select();

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

// Raise a window over its app-mates by title via accessibility. Requires the
// invoking app (Alfred) to have the Accessibility permission; failures are
// silent. Matches on the stable part of the title (Ghostty-style animated
// status glyphs change between reads).
function raiseWindowByTitle(processName, windowTitle) {
    try {
        const se = Application('System Events');
        const proc = se.processes[processName];
        proc.frontmost = true;
        const stable = windowTitle.replace(/^[^A-Za-z0-9]+/, '') || windowTitle;
        const matches = proc.windows.whose({ name: { _contains: stable } })();
        if (matches.length > 0) {
            matches[0].actions['AXRaise'].perform();
        }
    } catch (error) {
        console.log('Error raising window: ' + error);
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
                    // App, then window, then tab.
                    ghostty.activate();
                    ghostty.activateWindow(windows[i]);
                    ghostty.selectTab(windows[i].tabs[j]);

                    // As Alfred's panel dismisses, macOS restores focus to the
                    // previously active app - raising ITS previous key window
                    // over the one we just targeted when that app is Ghostty.
                    // Re-assert (twice) after that restore has landed.
                    delay(0.35);
                    ghostty.activateWindow(windows[i]);
                    delay(0.35);
                    ghostty.activateWindow(windows[i]);

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
