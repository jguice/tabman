#!/usr/bin/osascript -l JavaScript

function run(argv) {
    try {
        const tabInfo = JSON.parse(argv[0]);
        const chrome = Application('Google Chrome');
        chrome.includeStandardAdditions = true;
        
        // Get all windows
        const windows = chrome.windows();
        
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
        
        // Select the specific tab using its URL
        targetWindow.activeTabIndex = tabInfo.tabIndex + 1; // JXA uses 1-based indexing
        
        // Focus Chrome
        chrome.activate();
        
        return "Switched to tab successfully";
        
    } catch (error) {
        console.log('Error switching to tab: ' + error);
        try {
            // If something goes wrong, fall back to opening the URL
            const chrome = Application('Google Chrome');
            chrome.includeStandardAdditions = true;
            const windows = chrome.windows();
            if (windows.length > 0) {
                windows[0].make({new: "tab", with: tabInfo.url});
                chrome.activate();
            }
            return "Opened URL in new tab (fallback)";
        } catch (fallbackError) {
            console.log('Error in fallback: ' + fallbackError);
            return "Failed to switch tab or open URL";
        }
    }
}
