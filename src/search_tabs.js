ObjC.import('CoreGraphics');
ObjC.import('AppKit');
ObjC.import('CoreImage');
eval($.NSString.stringWithContentsOfFileEncodingError(
    $.NSFileManager.defaultManager.currentDirectoryPath.js + '/lib_favicons.js',
    $.NSUTF8StringEncoding, null).js);

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
    let capturesEnabled = true;
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
        if (!capturesEnabled) {
            // Fast build: use whatever shot already exists, never capture.
            memo[key] = $.NSFileManager.defaultManager.fileExistsAtPath(path) ? path : null;
            return memo[key];
        }
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

    // Credit a window's shot to a specific tab: tabs that have been active
    // accumulate their own last-seen previews (stale by design, like a tab
    // overview). Copies are cheap; old credits are pruned by buildSnapshot.
    function creditTab(tabId, shotPath) {
        if (!shotPath || !tabId) return;
        try {
            const safe = String(tabId).replace(/[^A-Za-z0-9._-]/g, '_');
            shell.doShellScript('cp ' + quoted(shotPath) + ' ' + quoted(ensureCacheDir() + '/tab-' + safe + '.png'));
        } catch (e) {}
    }

    // Most specific available image for a tab: its own last-seen shot, else
    // the window shot, else the app icon.
    function iconForTab(tabId, windowIcon, fallbackAppPath) {
        try {
            const safe = String(tabId).replace(/[^A-Za-z0-9._-]/g, '_');
            const path = ensureCacheDir() + '/tab-' + safe + '.png';
            if ($.NSFileManager.defaultManager.fileExistsAtPath(path)) {
                return { path: path };
            }
        } catch (e) {}
        if (windowIcon) return windowIcon;
        return { type: 'fileicon', path: fallbackAppPath };
    }

    // Path to a tab's own credited shot, or null.
    function tabShot(tabId) {
        try {
            const safe = String(tabId).replace(/[^A-Za-z0-9._-]/g, '_');
            const path = ensureCacheDir() + '/tab-' + safe + '.png';
            if ($.NSFileManager.defaultManager.fileExistsAtPath(path)) return path;
        } catch (e) {}
        return null;
    }

    // Favicon lookups delegate to the shared lib (lib_favicons.js).
    function faviconForUrl(appKey, dbPath, url) {
        return FaviconLib.faviconForUrl(appKey, dbPath, url);
    }

    function setCapturesEnabled(on) { capturesEnabled = on; }

    return { shotForWindow: shotForWindow, cacheDir: ensureCacheDir, creditTab: creditTab, iconForTab: iconForTab, tabShot: tabShot, faviconForUrl: faviconForUrl, setCapturesEnabled: setCapturesEnabled };
}

// Composite a capture onto a transparent square canvas (aspect-fit, centered)
// so Alfred's square icon box doesn't distort it. Idempotent: already-square
// images are left alone.
function squareThumb(path) {
    try {
        const ci = $.CIImage.imageWithContentsOfURL($.NSURL.fileURLWithPath(path));
        if (ci.isNil()) return;
        const ext = ci.extent;
        const w = ext.size.width;
        const h = ext.size.height;
        if (w === h) return;
        const side = 576;
        const scale = Math.min(side / w, side / h);

        // Downscale with Lanczos in Core Image's linear working space:
        // scaling in gamma-encoded space visibly darkens fine bright detail
        // (terminal text is the worst case, measured ~6% darker).
        const f = $.CIFilter.filterWithName('CILanczosScaleTransform');
        f.setValueForKey(ci, 'inputImage');
        f.setValueForKey(scale, 'inputScale');
        f.setValueForKey(1.0, 'inputAspectRatio');
        const scaledCI = f.valueForKey('outputImage');
        const ctx = $.CIContext.contextWithOptions(undefined);
        const cg = ctx.createCGImageFromRect(scaledCI, scaledCI.extent);
        const rep = $.NSBitmapImageRep.alloc.initWithCGImage(cg);

        // Composite 1:1 onto a transparent square canvas - no further
        // resampling, so no further brightness shift.
        const scaled = $.NSImage.alloc.initWithSize($.NSMakeSize(rep.pixelsWide, rep.pixelsHigh));
        scaled.addRepresentation(rep);
        const canvas = $.NSImage.alloc.initWithSize($.NSMakeSize(side, side));
        canvas.lockFocus;
        scaled.drawInRectFromRectOperationFraction(
            $.NSMakeRect((side - rep.pixelsWide) / 2, (side - rep.pixelsHigh) / 2, rep.pixelsWide, rep.pixelsHigh),
            $.NSZeroRect,
            $.NSCompositingOperationSourceOver,
            1.0
        );
        canvas.unlockFocus;
        const outRep = $.NSBitmapImageRep.imageRepWithData(canvas.TIFFRepresentation);
        const png = outRep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
        png.writeToFileAtomically(path, true);
    } catch (e) {}
}

// Resolve a tab row's icon: credit the window's fresh shot to the window's
// ACTIVE tab, then prefer the tab's own last-seen shot, then the window
// shot, then the app icon. (Used for Ghostty, where tabs have no favicon.)
function resolveTabIcon(tabId, activeTabId, windowIcon, fallbackAppPath) {
    if (tabId && tabId === activeTabId && isShot(windowIcon)) {
        previews.creditTab(tabId, windowIcon.path);
    }
    return previews.iconForTab(tabId, windowIcon, fallbackAppPath);
}

// Browser tab rows never show the shared window screenshot: a tab's own
// remembered shot (from when it was the window's face), else the site
// favicon from the browser's local database, else the app icon.
// True only for a real image file, not a fileicon fallback (which also has
// a path - to an app bundle, unrenderable as a plain image).
function isShot(icon) {
    return !!(icon && icon.path && !icon.type);
}

function resolveBrowserTabIcon(tabId, activeTabId, windowIcon, appKey, faviconDb, url, fallbackAppPath) {
    if (tabId && tabId === activeTabId && isShot(windowIcon)) {
        previews.creditTab(tabId, windowIcon.path);
        return { path: windowIcon.path };
    }
    const shot = previews.tabShot(tabId);
    if (shot) return { path: shot };
    const fav = previews.faviconForUrl(appKey, faviconDb, url);
    if (fav) return fav;
    return { type: 'fileicon', path: fallbackAppPath };
}

function previewIcon(owner, title, key, fallbackAppPath) {
    const shot = previews.shotForWindow(owner, title, key);
    if (shot) return { path: shot };
    return { type: 'fileicon', path: fallbackAppPath };
}

// Backstop for the fingerprint's one blind spot (opening/closing a
// background browser tab changes no window title): force a refresh once the
// snapshot is this old, even with a matching fingerprint.
const FINGERPRINT_BACKSTOP_SECONDS = 60;

// ~15ms summary of the current window state for our apps: any window
// open/close or title change (tab switches retitle the window) alters it.
// Window names need the Screen Recording permission; without it the
// fingerprint still catches window opens/closes.
function windowFingerprint() {
    const enabled = FaviconLib.enabledBrowsers();
    const OWNERS = { chrome: 'Google Chrome', brave: 'Brave Browser', arc: 'Arc', ghostty: 'Ghostty' };
    // Appended outside the try/catch: even the error fallback must change
    // when toggles change, or a toggle during CG failures skips invalidation.
    const suffix = '|enabled:' + Object.keys(OWNERS).filter(function (k) { return enabled[k]; }).join(',');
    let base;
    try {
        const r = $.CGWindowListCopyWindowInfo(0, 0);
        const wins = (ObjC.deepUnwrap(ObjC.castRefToObject(r)) || []);
        const ours = {};
        Object.keys(OWNERS).forEach(function (k) { if (enabled[k]) ours[OWNERS[k]] = 1; });
        base = wins
            .filter(function (w) { return w.kCGWindowLayer === 0 && ours[w.kCGWindowOwnerName]; })
            .map(function (w) {
                // Strip animated status glyphs (Ghostty spinners) so live
                // terminal sessions don't churn the fingerprint.
                const stable = String(w.kCGWindowName || '').replace(/^[^A-Za-z0-9]+/, '');
                return w.kCGWindowOwnerName + ':' + w.kCGWindowNumber + ':' + stable;
            })
            .sort()
            .join('|');
    } catch (e) {
        base = 'fingerprint-error';
    }
    return base + suffix;
}

function run(argv) {
    if (argv[0] === '--rebuild') {
        buildSnapshot(true);
        return 'rebuilt';
    }

    // Every whitespace-separated token must match somewhere, in any order,
    // so "natera site" finds "Natera Conference Site" (#5).
    const tokens = argv[0].toLowerCase().split(/\s+/).filter(Boolean);
    const snap = loadSnapshot();
    let items;
    if (!snap) {
        // First-ever search: build fast (no captures block the list), then
        // let a background rebuild fill in the screenshots.
        items = buildSnapshot(false);
        scheduleRebuild();
    } else {
        items = snap.items;
        if (snap.fingerprint !== windowFingerprint() || snap.age > FINGERPRINT_BACKSTOP_SECONDS) {
            scheduleRebuild();
        }
    }

    // Instant toggle response: the snapshot may still contain a browser
    // that was just unchecked (rebuilds lag by design), so filter served
    // rows by the enabled set every run.
    const enabled = FaviconLib.enabledBrowsers();
    items = items.filter(function (item) {
        try {
            const app = JSON.parse(item.arg).app;
            return enabled[app === 'arclittle' ? 'arc' : app] !== false;
        } catch (e) {
            return true;
        }
    });

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

    const out = { items: results };
    // While a background rebuild is in flight, have Alfred re-run this
    // filter (same query) until the fresh snapshot lands; otherwise results
    // typed during a rebuild stay frozen on the stale list.
    if (rebuildInFlight()) out.rerun = 0.5;
    return JSON.stringify(out);
}

function rebuildInFlight() {
    try {
        const dir = previews.cacheDir();
        return !!dir && $.NSFileManager.defaultManager.fileExistsAtPath(dir + '/rebuild.lock');
    } catch (e) {
        return false;
    }
}

// Real wall-clock boot time. NSProcessInfo.systemUptime is unusable here:
// it counts only awake time, so now-minus-uptime drifts later than the true
// boot by cumulative sleep and would falsely discard same-boot snapshots.
function bootTimeSeconds() {
    try {
        const shell = Application.currentApplication();
        shell.includeStandardAdditions = true;
        const m = shell.doShellScript('/usr/sbin/sysctl -n kern.boottime').match(/sec = (\d+)/);
        return m ? Number(m[1]) : 0;
    } catch (e) {
        return 0;
    }
}

// The full tab list (with preview icons) is snapshotted; any same-boot
// snapshot is served regardless of age (freshness comes from background
// rebuilds). A snapshot from a previous boot is discarded because window
// and tab ids get reused.
function loadSnapshot() {
    try {
        const dir = previews.cacheDir();
        if (!dir) return null;
        const path = dir + '/tabs-snapshot.json';
        const fm = $.NSFileManager.defaultManager;
        if (!fm.fileExistsAtPath(path)) return null;
        const attrs = fm.attributesOfItemAtPathError(path, null);
        const mtime = attrs.fileModificationDate.timeIntervalSince1970;
        // A snapshot from a previous boot is garbage: window ids and Ghostty
        // tab ids are reused across reboots, so a stale row can focus an
        // unrelated window. Treat it as absent (forces the fast sync build).
        const boot = bootTimeSeconds();
        if (boot && mtime < boot) return null;
        const age = $.NSDate.date.timeIntervalSince1970 - mtime;
        let fingerprint = '';
        try {
            fingerprint = $.NSString.stringWithContentsOfFileEncodingError(dir + '/tabs-fingerprint.txt', $.NSUTF8StringEncoding, null).js || '';
        } catch (e) {}
        return { items: JSON.parse($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js), age: age, fingerprint: fingerprint };
    } catch (e) {
        return null;
    }
}

// Rebuild the snapshot in a detached background process (one at a time via a
// lock directory; stale locks from crashed rebuilds expire after a minute).
function scheduleRebuild() {
    try {
        const shell = Application.currentApplication();
        shell.includeStandardAdditions = true;
        const dir = previews.cacheDir();
        if (!dir) return;
        const me = $.NSFileManager.defaultManager.currentDirectoryPath.js + '/search_tabs.js';
        const q = function (s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; };
        shell.doShellScript(
            'l=' + q(dir + '/rebuild.lock') + '; s=' + q(me) + '; [ -f "$s" ] || exit 0; ' +
            'if [ -d "$l" ] && [ $(( $(date +%s) - $(stat -f %m "$l") )) -gt 60 ]; then rm -rf "$l"; fi; ' +
            'if mkdir "$l" 2>/dev/null; then ' +
            '( /usr/bin/osascript -l JavaScript "$s" --rebuild; rmdir "$l" ) >/dev/null 2>&1 & fi');
    } catch (e) {}
}

function buildSnapshot(withCaptures) {
    previews.setCapturesEnabled(withCaptures !== false);
    const items = [];

    // Chromium-family browsers share the same scripting interface; to add one,
    // add a collect call here and a CHROMIUM_APPS entry in switch_to_tab.js.
    const enabled = FaviconLib.enabledBrowsers();
    const home = $.NSHomeDirectory().js;
    if (enabled.chrome) collectChromiumTabs('Google Chrome', 'chrome', home + '/Library/Application Support/Google/Chrome/Default/Favicons', items);
    if (enabled.brave) collectChromiumTabs('Brave Browser', 'brave', home + '/Library/Application Support/BraveSoftware/Brave-Browser/Default/Favicons', items);
    if (enabled.arc) collectArcTabs(items);
    if (enabled.arc) collectArcLittleWindows(items);
    if (enabled.ghostty) collectGhosttyTabs(items);

    try {
        const dir = previews.cacheDir();
        if (dir) {
            $.NSString.alloc.initWithUTF8String(JSON.stringify(items))
                .writeToFileAtomicallyEncodingError(dir + '/tabs-snapshot.json', true, $.NSUTF8StringEncoding, null);
            $.NSString.alloc.initWithUTF8String(windowFingerprint())
                .writeToFileAtomicallyEncodingError(dir + '/tabs-fingerprint.txt', true, $.NSUTF8StringEncoding, null);
            // Prune everything cached (tab credits, window shots, favicons)
            // once untouched for a week; live entries keep refreshing.
            const shell = Application.currentApplication();
            shell.includeStandardAdditions = true;
            const q = "'" + dir.replace(/'/g, "'\\''") + "'";
            shell.doShellScript('find ' + q + ' \\( -name "tab-*.png" -o -name "win-*.png" -o -name "fav-*" -o -name "favdb-*" \\) -mtime +7 -delete');
        }
    } catch (e) {}

    return items;
}

function collectChromiumTabs(appName, appKey, faviconDb, items) {
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
                const tabIds = window.tabs.id();
                let activeTabId = null;
                try { activeTabId = window.activeTab.id(); } catch (e) {}
                window.tabs().forEach(function (tab, tabIndex) {
                    try {
                        const title = tab.title() || '';
                        const url = tab.url() || '';

                        items.push({
                            title: title,
                            subtitle: profileInfo + ' - ' + url,
                            icon: resolveBrowserTabIcon(tabIds[tabIndex], activeTabId,
                                windowIcon = windowIcon || previewIcon(appName, window.name(), appKey + windowIndex, '/Applications/' + appName + '.app'),
                                appKey, faviconDb, url, '/Applications/' + appName + '.app'),
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
                let activeTabId = null;
                try { activeTabId = windows[windowIndex].activeTab.id(); } catch (e) {}

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
                        icon: resolveBrowserTabIcon(ids[tabIndex], activeTabId,
                            windowIcon = windowIcon || previewIcon('Arc', windows[windowIndex].name(), 'arc' + windowIndex, '/Applications/Arc.app'),
                            'arc', $.NSHomeDirectory().js + '/Library/Application Support/Arc/User Data/Default/Favicons', url, '/Applications/Arc.app'),
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
                let activeTabId = null;
                try { activeTabId = windows[windowIndex].selectedTab.id(); } catch (e) {}

                for (let tabIndex = 0; tabIndex < names.length; tabIndex++) {
                    const name = names[tabIndex] || '';

                    items.push({
                        title: name,
                        subtitle: 'Ghostty',
                        icon: resolveTabIcon(ids[tabIndex], activeTabId,
                            windowIcon = windowIcon || previewIcon('Ghostty', windows[windowIndex].name(), 'ghostty' + windowIndex, '/Applications/Ghostty.app'),
                            '/Applications/Ghostty.app'),
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
