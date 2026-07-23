ObjC.import('Foundation');
eval($.NSString.stringWithContentsOfFileEncodingError(
    $.NSFileManager.defaultManager.currentDirectoryPath.js + '/lib_favicons.js',
    $.NSUTF8StringEncoding, null).js);

function run(argv) {
    // Every whitespace-separated token must match somewhere, in any order (#5).
    const tokens = argv[0].toLowerCase().split(/\s+/).filter(Boolean);
    const home = $.NSHomeDirectory().js;

    // Disabled browsers drop out BEFORE the fingerprint is computed: the
    // snapshot cache is keyed by source-file mtimes only, so removing a
    // source's paths from the fingerprint is what invalidates the cache on
    // toggle.
    const enabled = FaviconLib.enabledBrowsers();
    const sources = [
        chromiumSource('Chrome', 'chrome', '/Applications/Google Chrome.app',
            home + '/Library/Application Support/Google/Chrome'),
        chromiumSource('Brave', 'brave', '/Applications/Brave Browser.app',
            home + '/Library/Application Support/BraveSoftware/Brave-Browser'),
        {
            source: 'Arc', appKey: 'arc', appPath: '/Applications/Arc.app',
            faviconDb: home + '/Library/Application Support/Arc/User Data/Default/Favicons',
            files: [home + '/Library/Application Support/Arc/StorableSidebar.json'],
            collect: collectArcBookmarks
        }
    ].filter(function (s) { return enabled[s.appKey]; });

    // Bookmarks live in plain files, so freshness is exact: reparse only when
    // a source file's mtime changes.
    const allFiles = sources.reduce(function (acc, s) { return acc.concat(s.files); }, []);
    const fingerprint = FaviconLib.fileFingerprint(allFiles);
    const snapPath = FaviconLib.ensureCacheDir() + '/bookmarks-snapshot.json';
    const snap = FaviconLib.readJSON(snapPath);

    let items;
    if (snap && snap.fingerprint === fingerprint) {
        items = snap.items;
    } else {
        items = [];
        sources.forEach(function (s) { s.collect(s, items); });
        FaviconLib.writeJSON(snapPath, { fingerprint: fingerprint, items: items });
    }

    // Favicons resolve at output time (matched rows only), cache-first.
    const results = items.filter(function (it) {
        return tokens.every(function (t) { return it._search.indexOf(t) !== -1; });
    }).map(function (it) {
        return {
            title: it.title,
            subtitle: it.source + ' - ' + it.url,
            arg: it.url,
            icon: FaviconLib.faviconForUrl(it.appKey, it.faviconDb, it.url) || { type: 'fileicon', path: it.appPath },
            text: { copy: it.url, largetype: it.title },
            quicklookurl: it.url
        };
    });

    return JSON.stringify({ items: results });
}

function chromiumSource(source, appKey, appPath, supportDir) {
    const fm = $.NSFileManager.defaultManager;
    let files = [];
    try {
        if (fm.fileExistsAtPath(supportDir)) {
            const dirs = ObjC.unwrap(fm.contentsOfDirectoryAtPathError(supportDir, null)) || [];
            files = dirs
                .map(function (dir) { return String(ObjC.unwrap(dir)); })
                .filter(function (name) { return name === 'Default' || name.startsWith('Profile'); })
                .map(function (name) { return supportDir + '/' + name + '/Bookmarks'; });
        }
    } catch (e) {}
    return {
        source: source, appKey: appKey, appPath: appPath,
        faviconDb: supportDir + '/Default/Favicons',
        files: files,
        collect: collectChromiumBookmarks
    };
}

function pushBookmark(s, items, title, url) {
    items.push({
        title: title,
        url: url,
        source: s.source,
        appKey: s.appKey,
        appPath: s.appPath,
        faviconDb: s.faviconDb,
        _search: (s.source + ' ' + title + ' ' + url).toLowerCase()
    });
}

function collectChromiumBookmarks(s, items) {
    const fm = $.NSFileManager.defaultManager;
    s.files.forEach(function (bookmarkFile) {
        try {
            const bookmarks = FaviconLib.readJSON(bookmarkFile);
            if (!bookmarks) return;
            searchBookmarkNode(bookmarks.roots.bookmark_bar, s, items);
            searchBookmarkNode(bookmarks.roots.other, s, items);
        } catch (error) {
            console.log('Error processing bookmark file: ' + bookmarkFile + ' - ' + error);
        }
    });
}

function searchBookmarkNode(node, s, items) {
    if (!node) return;

    if (node.type === 'url') {
        pushBookmark(s, items, node.name || '', node.url || '');
    }

    if (node.children) {
        node.children.forEach(function (child) {
            try {
                searchBookmarkNode(child, s, items);
            } catch (error) {
                console.log('Error processing bookmark node: ' + error);
            }
        });
    }
}

// Arc keeps its "bookmarks" (pinned sidebar items) in StorableSidebar.json.
// Pinned items appear as nodes with data.tab.savedURL; a user-renamed pin
// carries the custom name in the node's title field.
function collectArcBookmarks(s, items) {
    try {
        const data = FaviconLib.readJSON(s.files[0]);
        if (!data) return;
        walkArcNode(data, s, items, {}, 0);
    } catch (error) {
        console.log('Error accessing Arc sidebar: ' + error);
    }
}

function walkArcNode(node, s, items, seen, depth) {
    if (!node || typeof node !== 'object' || depth > 20) return;

    if (Array.isArray(node)) {
        node.forEach(function (child) { walkArcNode(child, s, items, seen, depth + 1); });
        return;
    }

    const tab = node.data && node.data.tab;
    if (tab && tab.savedURL) {
        const url = tab.savedURL;
        const title = (typeof node.title === 'string' && node.title) || tab.savedTitle || url;
        const key = url + '|' + title;
        if (!seen[key]) {
            seen[key] = true;
            pushBookmark(s, items, title, url);
        }
    }

    Object.keys(node).forEach(function (k) {
        walkArcNode(node[k], s, items, seen, depth + 1);
    });
}
