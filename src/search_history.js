function run(argv) {
    // Every whitespace-separated token must match somewhere, in any order (#5).
    const tokens = argv[0].toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];

    collectChromiumHistory('Chrome', '/Applications/Google Chrome.app',
        '/Library/Application Support/Google/Chrome', tokens, results);
    collectChromiumHistory('Brave', '/Applications/Brave Browser.app',
        '/Library/Application Support/BraveSoftware/Brave-Browser', tokens, results);
    collectChromiumHistory('Arc', '/Applications/Arc.app',
        '/Library/Application Support/Arc/User Data', tokens, results);

    return JSON.stringify({ items: results });
}

function collectChromiumHistory(source, appPath, supportDir, tokens, results) {
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

                // The browser keeps the live database locked, so query a copy.
                // The copy is reused for a minute so per-keystroke searches
                // don't recopy a potentially large file.
                const tempFile = '/tmp/tabman-history-' + source + '-' + index;
                let needCopy = true;
                if (fm.fileExistsAtPath(tempFile)) {
                    const attrs = fm.attributesOfItemAtPathError(tempFile, null);
                    const age = $.NSDate.date.timeIntervalSince1970 - attrs.fileModificationDate.timeIntervalSince1970;
                    if (age < 60) needCopy = false;
                }
                if (needCopy) {
                    if (fm.fileExistsAtPath(tempFile)) fm.removeItemAtPathError(tempFile, null);
                    fm.copyItemAtPathToPathError(historyFile, tempFile, null);
                }

                const where = tokens.map(function (t) {
                    const escaped = t.replace(/'/g, "''");
                    return "(title LIKE '%" + escaped + "%' OR url LIKE '%" + escaped + "%')";
                }).join(' AND ') || '1=1';

                const task = $.NSTask.alloc.init;
                task.setLaunchPath('/usr/bin/sqlite3');
                task.setArguments(['-separator', '\t', tempFile,
                    'SELECT title, url FROM urls WHERE ' + where +
                    ' ORDER BY last_visit_time DESC LIMIT 20;']);
                const pipe = $.NSPipe.pipe;
                task.standardOutput = pipe;
                task.standardError = $.NSPipe.pipe;
                task.launch;
                const data = pipe.fileHandleForReading.readDataToEndOfFile;
                const output = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js || '';

                output.split('\n').forEach(function (line) {
                    if (!line.trim()) return;
                    // Split on the LAST tab: titles may contain tabs, URLs don't.
                    const cut = line.lastIndexOf('\t');
                    if (cut === -1) return;
                    const url = line.slice(cut + 1);
                    const title = line.slice(0, cut) || url;
                    if (!url) return;

                    results.push({
                        title: title,
                        subtitle: source + ' - ' + url,
                        arg: url,
                        icon: { type: 'fileicon', path: appPath },
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
