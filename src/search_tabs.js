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

    return { shotForWindow: shotForWindow, cacheDir: ensureCacheDir };
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

const SNAPSHOT_TTL_SECONDS = 8;

function run(argv) {
    // Every whitespace-separated token must match somewhere, in any order,
    // so "natera site" finds "Natera Conference Site" (#5).
    const tokens = argv[0].toLowerCase().split(/\s+/).filter(Boolean);
    const items = loadSnapshot() || buildSnapshot();

    const results = items.filter(function (item) {
        return tokens.every(function (token) {
            return item._search.indexOf(token) !== -1;
        });
    }).map(function (item) {
        return {
            title: item.title,
            subtitle: item.subtitle,
            arg: item.arg,
            icon: item.icon,
            text: item.text,
            quicklookurl: item.quicklookurl
        };
    });

    return JSON.stringify({ items: results });
}

// The full tab list (with preview icons) is snapshotted for a few seconds so
// each keystroke filters in-process instead of re-walking every app.
function loadSnapshot() {
    try {
        const dir = previews.cacheDir();
        if (!dir) return null;
        const path = dir + '/tabs-snapshot.json';
        const fm = $.NSFileManager.defaultManager;
        if (!fm.fileExistsAtPath(path)) return null;
        const attrs = fm.attributesOfItemAtPathError(path, null);
        const age = $.NSDate.date.timeIntervalSince1970 - attrs.fileModificationDate.timeIntervalSince1970;
        if (age > SNAPSHOT_TTL_SECONDS) return null;
        return JSON.parse($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js);
    } catch (e) {
        return null;
    }
}

function buildSnapshot() {
    const items = [];

    // Chromium-family browsers share the same scripting interface; to add one,
    // add a collect call here and a CHROMIUM_APPS entry in switch_to_tab.js.
    collectChromiumTabs('Google Chrome', 'chrome', items);
    collectChromiumTabs('Brave Browser', 'brave', items);
    collectArcTabs(items);
    collectArcLittleWindows(items);
    collectGhosttyTabs(items);

    try {
        const dir = previews.cacheDir();
        if (dir) {
            $.NSString.alloc.initWithUTF8String(JSON.stringify(items))
                .writeToFileAtomicallyEncodingError(dir + '/tabs-snapshot.json', true, $.NSUTF8StringEncoding, null);
        }
    } catch (e) {}

    return items;
}

function collectChromiumTabs(appName, appKey, items) {
    try {
        const browser = Application(appName);
        browser.includeStandardAdditions = true;

        if (!browser.running()) {
            return;
        }

        browser.windows().forEach(function (window, windowIndex) {
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
                window.tabs().forEach(function (tab, tabIndex) {
                    try {
                        const title = tab.title() || '';
                        const url = tab.url() || '';

                        items.push({
                            title: title,
                            subtitle: profileInfo + ' - ' + url,
                            icon: windowIcon = windowIcon || previewIcon(appName, window.name(), appKey + windowIndex, '/Applications/' + appName + '.app'),
                            arg: JSON.stringify({
                                app: appKey,
                                windowIndex: windowIndex,
                                tabIndex: tabIndex,
                                profile: profileInfo,
                                url: url
                            }),
                            text: { copy: url, largetype: title },
                            quicklookurl: url,
                            _search: (appName + ' ' + appKey + ' ' + title + ' ' + url).toLowerCase()
                        });
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

function collectArcTabs(items) {
    try {
        const arc = Application('Arc');
        arc.includeStandardAdditions = true;

        if (!arc.running()) {
            return;
        }

        const windows = arc.windows;
        const windowCount = windows.length;
        const seenTabIds = {};
        for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            try {
                // Bulk-fetch per window: one Apple Event per property
                const titles = windows[windowIndex].tabs.title();
                const urls = windows[windowIndex].tabs.url();
                const ids = windows[windowIndex].tabs.id();
                const locations = windows[windowIndex].tabs.location();
                let windowIcon = null;

                for (let tabIndex = 0; tabIndex < titles.length; tabIndex++) {
                    // Arc mirrors sidebar pins and "top apps" into every
                    // window's tab list; only 'unpinned' tabs are actually
                    // open tabs (pins are searchable via tmb). Windows
                    // sharing a Space also share their open tabs - dedupe.
                    if (locations[tabIndex] !== 'unpinned') continue;
                    if (seenTabIds[ids[tabIndex]]) continue;
                    seenTabIds[ids[tabIndex]] = true;

                    const title = titles[tabIndex] || '';
                    const url = urls[tabIndex] || '';

                    items.push({
                        title: title,
                        subtitle: 'Arc - ' + url,
                        icon: windowIcon = windowIcon || previewIcon('Arc', windows[windowIndex].name(), 'arc' + windowIndex, '/Applications/Arc.app'),
                        arg: JSON.stringify({ app: 'arc', tabId: ids[tabIndex], url: url }),
                        text: { copy: url, largetype: title },
                        quicklookurl: url,
                        _search: ('arc ' + title + ' ' + url).toLowerCase()
                    });
                }
            } catch (windowError) {
                console.log('Error processing Arc window: ' + windowError);
            }
        }
    } catch (error) {
        console.log('Error accessing Arc: ' + error);
    }
}

// Little Arc windows are invisible to Arc's AppleScript dictionary; the
// accessibility layer is the only way to see them (AXIdentifier
// "littleBrowserWindow-<uuid>"). Titles only - AX exposes no URL. Needs the
// Accessibility permission; silently skipped without it. Only windows on the
// current macOS Space are visible to accessibility.
function collectArcLittleWindows(items) {
    try {
        const proc = Application('System Events').processes['Arc'];
        const wins = proc.windows();
        for (let i = 0; i < wins.length; i++) {
            try {
                const axId = String(wins[i].attributes['AXIdentifier'].value());
                if (axId.indexOf('littleBrowserWindow-') !== 0) continue;
                const title = wins[i].name() || '';

                items.push({
                    title: title,
                    subtitle: 'Little Arc',
                    icon: previewIcon('Arc', title, 'arclittle' + i, '/Applications/Arc.app'),
                    arg: JSON.stringify({ app: 'arclittle', axId: axId }),
                    text: { copy: title, largetype: title },
                    _search: ('arc little ' + title).toLowerCase()
                });
            } catch (windowError) {}
        }
    } catch (error) {
        console.log('Error accessing Little Arc windows: ' + error);
    }
}

function collectGhosttyTabs(items) {
    try {
        const ghostty = Application('Ghostty');

        if (!ghostty.running()) {
            return;
        }

        const windows = ghostty.windows;
        const windowCount = windows.length;
        for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            try {
                const names = windows[windowIndex].tabs.name();
                const ids = windows[windowIndex].tabs.id();
                let windowIcon = null;

                for (let tabIndex = 0; tabIndex < names.length; tabIndex++) {
                    const name = names[tabIndex] || '';

                    items.push({
                        title: name,
                        subtitle: 'Ghostty',
                        icon: windowIcon = windowIcon || previewIcon('Ghostty', windows[windowIndex].name(), 'ghostty' + windowIndex, '/Applications/Ghostty.app'),
                        arg: JSON.stringify({ app: 'ghostty', tabId: ids[tabIndex] }),
                        text: { copy: name, largetype: name },
                        _search: ('ghostty ' + name).toLowerCase()
                    });
                }
            } catch (windowError) {
                console.log('Error processing Ghostty window: ' + windowError);
            }
        }
    } catch (error) {
        console.log('Error accessing Ghostty: ' + error);
    }
}
