function run(argv) {
    // Every whitespace-separated token must match somewhere, in any order (#5).
    const query = argv[0].toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];

    collectChromiumBookmarks('Chrome', '/Applications/Google Chrome.app',
        '/Library/Application Support/Google/Chrome', query, results);
    collectChromiumBookmarks('Brave', '/Applications/Brave Browser.app',
        '/Library/Application Support/BraveSoftware/Brave-Browser', query, results);
    collectArcBookmarks(query, results);

    return JSON.stringify({ items: results });
}

function matchesTokens(text, tokens) {
    const haystack = text.toLowerCase();
    return tokens.every(function (token) {
        return haystack.indexOf(token) !== -1;
    });
}

function pushBookmark(results, source, appPath, title, url) {
    results.push({
        title: title,
        subtitle: source + ' - ' + url,
        arg: url,
        icon: { type: 'fileicon', path: appPath },
        text: {
            copy: url,
            largetype: title
        },
        quicklookurl: url
    });
}

function collectChromiumBookmarks(source, appPath, supportDir, query, results) {
    try {
        const homeDir = $.NSHomeDirectory().js;
        const profilesDir = homeDir + supportDir;
        const fm = $.NSFileManager.defaultManager;

        if (!fm.fileExistsAtPath(profilesDir)) {
            return;
        }

        const dirs = ObjC.unwrap(fm.contentsOfDirectoryAtPathError(profilesDir, null)) || [];
        const bookmarkFiles = dirs
            .map(function (dir) { return String(ObjC.unwrap(dir)); })
            .filter(function (name) { return name === 'Default' || name.startsWith('Profile'); })
            .map(function (name) { return profilesDir + '/' + name + '/Bookmarks'; });

        bookmarkFiles.forEach(function (bookmarkFile) {
            try {
                if (!fm.fileExistsAtPath(bookmarkFile)) return;
                const bookmarkData = $.NSString.stringWithContentsOfFileEncodingError(bookmarkFile, $.NSUTF8StringEncoding, null).js;
                if (!bookmarkData) return;
                const bookmarks = JSON.parse(bookmarkData);
                searchBookmarkNode(bookmarks.roots.bookmark_bar, source, appPath, query, results);
                searchBookmarkNode(bookmarks.roots.other, source, appPath, query, results);
            } catch (error) {
                console.log('Error processing bookmark file: ' + bookmarkFile + ' - ' + error);
            }
        });
    } catch (error) {
        console.log('Error accessing ' + source + ' bookmarks: ' + error);
    }
}

function searchBookmarkNode(node, source, appPath, query, results) {
    if (!node) return;

    if (node.type === 'url') {
        const title = node.name || '';
        const url = node.url || '';

        if (matchesTokens(title + ' ' + url, query)) {
            pushBookmark(results, source, appPath, title, url);
        }
    }

    if (node.children) {
        node.children.forEach(function (child) {
            try {
                searchBookmarkNode(child, source, appPath, query, results);
            } catch (error) {
                console.log('Error processing bookmark node: ' + error);
            }
        });
    }
}

// Arc keeps its "bookmarks" (pinned sidebar items) in StorableSidebar.json
// rather than a Chromium Bookmarks file. Pinned items appear as nodes with
// data.tab.savedURL; a user-renamed pin carries the custom name in the node's
// title field.
function collectArcBookmarks(query, results) {
    try {
        const path = $.NSHomeDirectory().js + '/Library/Application Support/Arc/StorableSidebar.json';
        const fm = $.NSFileManager.defaultManager;
        if (!fm.fileExistsAtPath(path)) return;

        const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js;
        if (!data) return;

        walkArcNode(JSON.parse(data), query, results, {}, 0);
    } catch (error) {
        console.log('Error accessing Arc sidebar: ' + error);
    }
}

function walkArcNode(node, query, results, seen, depth) {
    if (!node || typeof node !== 'object' || depth > 20) return;

    if (Array.isArray(node)) {
        node.forEach(function (child) { walkArcNode(child, query, results, seen, depth + 1); });
        return;
    }

    const tab = node.data && node.data.tab;
    if (tab && tab.savedURL) {
        const url = tab.savedURL;
        const title = (typeof node.title === 'string' && node.title) || tab.savedTitle || url;
        const key = url + '|' + title;
        if (!seen[key]) {
            seen[key] = true;
            if (matchesTokens(title + ' ' + url, query)) {
                pushBookmark(results, 'Arc', '/Applications/Arc.app', title, url);
            }
        }
    }

    Object.keys(node).forEach(function (k) {
        walkArcNode(node[k], query, results, seen, depth + 1);
    });
}
