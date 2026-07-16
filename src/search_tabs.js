ObjC.import('CoreGraphics');
ObjC.import('AppKit');

// Window-preview icons: matched rows show a screenshot of the window that
// contains the tab, so visually distinct windows are quick to parse. Needs
// the Screen Recording permission (for Alfred when run as a workflow); when
// unavailable, rows fall back to the owning app's icon.
const previews = makePreviewProvider();

function makePreviewProvider() {
    const shell = Application.currentApplication();
    shell.includeStandardAdditions = true;

    let cacheDir = null;
    let cgWindows = null;
    const assigned = {};
    const memo = {};

    function ensureCacheDir() {
        if (cacheDir !== null) return cacheDir;
        let dir = '';
        try {
            const env = $.NSProcessInfo.processInfo.environment.objectForKey('alfred_workflow_cache');
            if (!env.isNil()) dir = env.js;
        } catch (e) {}
        if (!dir) dir = '/tmp/tabman-previews';
        try {
            shell.doShellScript("mkdir -p " + quoted(dir));
            cacheDir = dir;
        } catch (e) {
            cacheDir = '';
        }
        return cacheDir;
    }

    function windowsForOwner(owner) {
        if (cgWindows === null) {
            try {
                const r = $.CGWindowListCopyWindowInfo(0, 0);
                cgWindows = (ObjC.deepUnwrap(ObjC.castRefToObject(r)) || []).filter(function (w) {
                    return w.kCGWindowLayer === 0;
                });
            } catch (e) {
                cgWindows = [];
            }
        }
        return cgWindows.filter(function (w) { return w.kCGWindowOwnerName === owner; });
    }

    function quoted(s) {
        return "'" + String(s).replace(/'/g, "'\\''") + "'";
    }

    // Screenshot the window with AppleScript-visible title 'title' owned by
    // 'owner'. 'key' memoizes per AppleScript window so duplicate titles get
    // assigned distinct CG windows in encounter order.
    function shotForWindow(owner, title, key) {
        if (key in memo) return memo[key];
        memo[key] = null;

        if (!assigned[owner]) assigned[owner] = {};
        const candidates = windowsForOwner(owner);
        let win = null;
        for (let i = 0; i < candidates.length; i++) {
            const w = candidates[i];
            if (assigned[owner][w.kCGWindowNumber]) continue;
            // kCGWindowName is only present with Screen Recording permission
            if (w.kCGWindowName === title) { win = w; break; }
        }
        if (!win) return null;
        assigned[owner][win.kCGWindowNumber] = true;

        const dir = ensureCacheDir();
        if (!dir) return null;
        const path = dir + '/win-' + win.kCGWindowNumber + '.png';
        try {
            shell.doShellScript(
                "p=" + quoted(path) + "; " +
                "if [ ! -s \"$p\" ] || [ $(( $(date +%s) - $(stat -f %m \"$p\") )) -gt 30 ]; then " +
                "screencapture -x -o -l " + win.kCGWindowNumber + " \"$p\"; fi; " +
                "[ -s \"$p\" ] && echo ok"
            );
            squareThumb(path);
            memo[key] = path;
            return path;
        } catch (e) {
            return null;
        }
    }

    return { shotForWindow: shotForWindow };
}

// Composite a capture onto a transparent square canvas (aspect-fit, centered)
// so Alfred's square icon box doesn't distort it. Idempotent: already-square
// images are left alone.
function squareThumb(path) {
    try {
        const img = $.NSImage.alloc.initWithContentsOfFile(path);
        if (img.isNil()) return;
        const w = img.size.width;
        const h = img.size.height;
        if (w === h) return;
        const side = 288;
        const scale = Math.min(side / w, side / h);
        const dw = w * scale;
        const dh = h * scale;
        const out = $.NSImage.alloc.initWithSize($.NSMakeSize(side, side));
        out.lockFocus;
        img.drawInRectFromRectOperationFraction(
            $.NSMakeRect((side - dw) / 2, (side - dh) / 2, dw, dh),
            $.NSZeroRect,
            $.NSCompositingOperationSourceOver,
            1.0
        );
        out.unlockFocus;
        const rep = $.NSBitmapImageRep.imageRepWithData(out.TIFFRepresentation);
        const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
        png.writeToFileAtomically(path, true);
    } catch (e) {}
}

function previewIcon(owner, title, key, fallbackAppPath) {
    const shot = previews.shotForWindow(owner, title, key);
    if (shot) return { path: shot };
    return { type: 'fileicon', path: fallbackAppPath };
}

function run(argv) {
    const query = argv[0].toLowerCase();
    const results = [];

    // Chromium-family browsers share the same scripting interface; to add one,
    // add a collect call here and a CHROMIUM_APPS entry in switch_to_tab.js.
    collectChromiumTabs('Google Chrome', 'chrome', query, results);
    collectChromiumTabs('Brave Browser', 'brave', query, results);
    collectArcTabs(query, results);
    collectGhosttyTabs(query, results);

    return JSON.stringify({ items: results });
}

function collectChromiumTabs(appName, appKey, query, results) {
    try {
        const browser = Application(appName);
        browser.includeStandardAdditions = true;

        if (!browser.running()) {
            return;
        }

        // Get all windows from all profiles
        browser.windows().forEach((window, windowIndex) => {
            try {
                // Get profile information from the first tab's URL
                let profileInfo = "Default";
                if (window.tabs.length > 0) {
                    const firstTabUrl = window.tabs[0].url();
                    if (firstTabUrl.includes('Profile')) {
                        const match = firstTabUrl.match(/Profile \d+/);
                        if (match) {
                            profileInfo = match[0];
                        }
                    }
                }

                let windowIcon = null;
                window.tabs().forEach((tab, tabIndex) => {
                    try {
                        const title = tab.title() || '';
                        const url = tab.url() || '';

                        // Search in both title and URL
                        if (title.toLowerCase().includes(query) || url.toLowerCase().includes(query)) {
                            const tabInfo = JSON.stringify({
                                app: appKey,
                                windowIndex: windowIndex,
                                tabIndex: tabIndex,
                                profile: profileInfo,
                                url: url
                            });

                            results.push({
                                title: title,
                                subtitle: profileInfo + ' - ' + url,
                                icon: windowIcon = windowIcon || previewIcon(appName, window.name(), appKey + windowIndex, '/Applications/' + appName + '.app'),
                                arg: tabInfo,
                                text: {
                                    copy: url,
                                    largetype: title
                                },
                                quicklookurl: url
                            });
                        }
                    } catch (tabError) {
                        console.log('Error processing tab: ' + tabError);
                    }
                });
            } catch (windowError) {
                console.log('Error processing window: ' + windowError);
            }
        });
    } catch (error) {
        console.log('Error accessing ' + appName + ': ' + error);
    }
}

function collectArcTabs(query, results) {
    try {
        const arc = Application('Arc');
        arc.includeStandardAdditions = true;

        if (!arc.running()) {
            return;
        }

        const windows = arc.windows;
        const windowCount = windows.length;
        for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            try {
                // Bulk-fetch titles and URLs (one Apple Event each per window)
                const titles = windows[windowIndex].tabs.title();
                const urls = windows[windowIndex].tabs.url();
                let windowIcon = null;

                for (let tabIndex = 0; tabIndex < titles.length; tabIndex++) {
                    const title = titles[tabIndex] || '';
                    const url = urls[tabIndex] || '';

                    // Search in both title and URL
                    if (title.toLowerCase().includes(query) || url.toLowerCase().includes(query)) {
                        const tabInfo = JSON.stringify({
                            app: 'arc',
                            windowIndex: windowIndex,
                            tabIndex: tabIndex,
                            url: url
                        });

                        results.push({
                            title: title,
                            subtitle: 'Arc - ' + url,
                            icon: windowIcon = windowIcon || previewIcon('Arc', windows[windowIndex].name(), 'arc' + windowIndex, '/Applications/Arc.app'),
                            arg: tabInfo,
                            text: {
                                copy: url,
                                largetype: title
                            },
                            quicklookurl: url
                        });
                    }
                }
            } catch (windowError) {
                console.log('Error processing Arc window: ' + windowError);
            }
        }
    } catch (error) {
        console.log('Error accessing Arc: ' + error);
    }
}

function collectGhosttyTabs(query, results) {
    try {
        const ghostty = Application('Ghostty');

        if (!ghostty.running()) {
            return;
        }

        const windows = ghostty.windows;
        const windowCount = windows.length;
        for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            try {
                // Bulk-fetch names and ids (one Apple Event each per window)
                const names = windows[windowIndex].tabs.name();
                const ids = windows[windowIndex].tabs.id();
                let windowIcon = null;

                for (let tabIndex = 0; tabIndex < names.length; tabIndex++) {
                    const name = names[tabIndex] || '';

                    if (name.toLowerCase().includes(query)) {
                        const tabInfo = JSON.stringify({
                            app: 'ghostty',
                            tabId: ids[tabIndex]
                        });

                        results.push({
                            title: name,
                            subtitle: 'Ghostty',
                            icon: windowIcon = windowIcon || previewIcon('Ghostty', windows[windowIndex].name(), 'ghostty' + windowIndex, '/Applications/Ghostty.app'),
                            arg: tabInfo,
                            text: {
                                copy: name,
                                largetype: name
                            }
                        });
                    }
                }
            } catch (windowError) {
                console.log('Error processing Ghostty window: ' + windowError);
            }
        }
    } catch (error) {
        console.log('Error accessing Ghostty: ' + error);
    }
}
