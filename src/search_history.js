ObjC.import('Foundation');
eval($.NSString.stringWithContentsOfFileEncodingError(
    $.NSFileManager.defaultManager.currentDirectoryPath.js + '/lib_favicons.js',
    $.NSUTF8StringEncoding, null).js);

function run(argv) {
    // Every whitespace-separated token must match somewhere, in any order (#5).
    const tokens = argv[0].toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];

    const enabled = FaviconLib.enabledBrowsers();
    if (enabled.chrome) collectChromiumHistory('Chrome', 'chrome', '/Applications/Google Chrome.app',
        '/Library/Application Support/Google/Chrome', tokens, results);
    if (enabled.brave) collectChromiumHistory('Brave', 'brave', '/Applications/Brave Browser.app',
        '/Library/Application Support/BraveSoftware/Brave-Browser', tokens, results);
    if (enabled.arc) collectChromiumHistory('Arc', 'arc', '/Applications/Arc.app',
        '/Library/Application Support/Arc/User Data', tokens, results);

    // Cross-source recency: each per-profile query is already ordered, but
    // concatenation is not. Sort globally by last visit, THEN dedupe, so
    // the most recent occurrence of a URL wins.
    results.sort(function (a, b) { return b.ts - a.ts; });

    // The same page often exists in several profiles or browsers; results
    // are already sorted globally by recency above, so keeping the first
    // occurrence of each URL keeps the globally most recent one.
    const seen = {};
    const deduped = results.filter(function (item) {
        if (seen[item.arg]) return false;
        seen[item.arg] = true;
        return true;
    }).map(function (item) {
        delete item.ts;
        return item;
    });

    return JSON.stringify({ items: deduped });
}

function supportDirFaviconDb(source, supportDir) {
    return $.NSHomeDirectory().js + supportDir + '/Default/Favicons';
}

function collectChromiumHistory(source, appKey, appPath, supportDir, tokens, results) {
    try {
        const homeDir = $.NSHomeDirectory().js;
        const profilesDir = homeDir + supportDir;
        const fm = $.NSFileManager.defaultManager;

        if (!fm.fileExistsAtPath(profilesDir)) return;

        const dirs = ObjC.unwrap(fm.contentsOfDirectoryAtPathError(profilesDir, null)) || [];
        const historyFiles = dirs
            .map(function (dir) { return String(ObjC.unwrap(dir)); })
            .filter(function (name) { return name === 'Default' || name.startsWith('Profile'); })
            .map(function (name) { return profilesDir + '/' + name + '/History'; });

        historyFiles.forEach(function (historyFile, index) {
            try {
                if (!fm.fileExistsAtPath(historyFile)) return;

                // The browser keeps the live database locked, so query a copy,
                // refreshed only when the source has actually changed.
                const tempFile = FaviconLib.ensureDbCopy('history-' + source + '-' + index, historyFile);
                if (!tempFile) return;

                const where = tokens.map(function (t) {
                    const escaped = t.replace(/'/g, "''");
                    return "(title LIKE '%" + escaped + "%' OR url LIKE '%" + escaped + "%')";
                }).join(' AND ') || '1=1';

                const task = $.NSTask.alloc.init;
                task.setLaunchPath('/usr/bin/sqlite3');
                task.setArguments(['-separator', '\t', tempFile,
                    'SELECT last_visit_time, title, url FROM urls WHERE ' + where +
                    ' ORDER BY last_visit_time DESC LIMIT 20;']);
                const pipe = $.NSPipe.pipe;
                task.standardOutput = pipe;
                task.standardError = $.NSPipe.pipe;
                task.launch;
                const data = pipe.fileHandleForReading.readDataToEndOfFile;
                const output = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js || '';

                output.split('\n').forEach(function (line) {
                    if (!line.trim()) return;
                    // Column order is ts<TAB>title<TAB>url. Take ts at the
                    // FIRST tab; split the rest on its LAST tab because
                    // titles may contain tabs, URLs don't.
                    const firstCut = line.indexOf('\t');
                    if (firstCut === -1) return;
                    const ts = Number(line.slice(0, firstCut)) || 0;
                    const rest = line.slice(firstCut + 1);
                    const cut = rest.lastIndexOf('\t');
                    if (cut === -1) return;
                    const url = rest.slice(cut + 1);
                    const title = rest.slice(0, cut) || url;
                    if (!url) return;

                    results.push({
                        ts: ts,
                        title: title,
                        subtitle: source + ' - ' + url,
                        arg: url,
                        icon: FaviconLib.faviconForUrl(appKey, supportDirFaviconDb(source, supportDir), url)
                            || { type: 'fileicon', path: appPath },
                        text: { copy: url, largetype: title },
                        quicklookurl: url
                    });
                });
            } catch (error) {
                console.log('Error processing ' + source + ' history: ' + error);
            }
        });
    } catch (error) {
        console.log('Error accessing ' + source + ' history: ' + error);
    }
}
