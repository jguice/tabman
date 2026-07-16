function run(argv) {
    const query = argv[0].toLowerCase();
    const results = [];

    collectChromeBookmarks(query, results);
    collectArcBookmarks(query, results);

    return JSON.stringify({ items: results });
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

function collectChromeBookmarks(query, results) {
    try {
        const homeDir = $.NSHomeDirectory().js;
        const profilesDir = homeDir + '/Library/Application Support/Google/Chrome';
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
                const bookmarkData = $.NSString.stringWithContentsOfFile(bookmarkFile).js;
                if (!bookmarkData) return;
                const bookmarks = JSON.parse(bookmarkData);
                searchBookmarkNode(bookmarks.roots.bookmark_bar, query, results);
                searchBookmarkNode(bookmarks.roots.other, query, results);
            } catch (error) {
                console.log('Error processing bookmark file: ' + bookmarkFile + ' - ' + error);
            }
        });
    } catch (error) {
        console.log('Error accessing Chrome bookmarks: ' + error);
    }
}

function searchBookmarkNode(node, query, results) {
    if (!node) return;

    if (node.type === 'url') {
        const title = node.name || '';
        const url = node.url || '';

        if (title.toLowerCase().includes(query) || url.toLowerCase().includes(query)) {
            pushBookmark(results, 'Chrome', '/Applications/Google Chrome.app', title, url);
        }
    }

    if (node.children) {
        node.children.forEach(function (child) {
            try {
                searchBookmarkNode(child, query, results);
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

        const data = $.NSString.stringWithContentsOfFile(path).js;
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
            if (title.toLowerCase().includes(query) || url.toLowerCase().includes(query)) {
                pushBookmark(results, 'Arc', '/Applications/Arc.app', title, url);
            }
        }
    }

    Object.keys(node).forEach(function (k) {
        walkArcNode(node[k], query, results, seen, depth + 1);
    });
}
