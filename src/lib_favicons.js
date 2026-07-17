// Shared cache + favicon helpers for tabman's scripts. Each script loads
// this with eval() at startup (JXA has no require).
var FaviconLib = (function () {
    const shell = Application.currentApplication();
    shell.includeStandardAdditions = true;
    let cacheDir = null;

    function quoted(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

    function ensureCacheDir() {
        if (cacheDir !== null) return cacheDir;
        let dir = '';
        try {
            const env = $.NSProcessInfo.processInfo.environment.objectForKey('alfred_workflow_cache');
            if (!env.isNil()) dir = env.js;
        } catch (e) {}
        if (!dir) dir = '/tmp/tabman-previews';
        try {
            shell.doShellScript('mkdir -p ' + quoted(dir));
            cacheDir = dir;
        } catch (e) {
            cacheDir = '';
        }
        return cacheDir;
    }

    // Copy-aside a browser's locked SQLite database. The copy refreshes only
    // when the source has actually changed (mtime newer than the copy).
    function ensureDbCopy(name, dbPath) {
        const dir = ensureCacheDir();
        if (!dir) return null;
        const dst = dir + '/db-' + name;
        try {
            shell.doShellScript('s=' + quoted(dbPath) + '; p=' + quoted(dst) + '; [ -f "$s" ] || exit 1; ' +
                'if [ ! -s "$p" ] || [ "$(stat -f %m "$s")" -gt "$(stat -f %m "$p")" ]; then cp "$s" "$p"; fi');
            return dst;
        } catch (e) {
            return null;
        }
    }

    // Site favicon for a URL, extracted from the browser's own local
    // Favicons database - no network, no third-party service. Cached per
    // host; a .miss marker avoids re-querying hosts with no icon.
    function faviconForUrl(appKey, dbPath, url) {
        const m = String(url).match(/^(https?):\/\/([^\/:]+)/i);
        if (!m) return null;
        const host = m[2];
        const dir = ensureCacheDir();
        if (!dir) return null;
        const safe = host.replace(/[^A-Za-z0-9.-]/g, '_');
        const icon = dir + '/fav-' + safe + '.png';
        const fm = $.NSFileManager.defaultManager;
        if (fm.fileExistsAtPath(icon)) return { path: icon };
        if (fm.fileExistsAtPath(icon + '.miss')) return null;
        const db = ensureDbCopy('favicons-' + appKey, dbPath);
        if (!db) return null;
        try {
            const like = (m[1] + '://' + host + '/%').replace(/'/g, "''");
            shell.doShellScript('sqlite3 ' + quoted(db) +
                ' "SELECT hex(fb.image_data) FROM icon_mapping im JOIN favicon_bitmaps fb ON fb.icon_id=im.icon_id' +
                " WHERE im.page_url LIKE '" + like + "' ORDER BY fb.width DESC LIMIT 1\" | xxd -r -p > " + quoted(icon) +
                '; [ -s ' + quoted(icon) + ' ] || { rm -f ' + quoted(icon) + '; touch ' + quoted(icon + '.miss') + '; }');
        } catch (e) {
            return null;
        }
        return fm.fileExistsAtPath(icon) ? { path: icon } : null;
    }

    // mtime fingerprint of a list of files ("path:mtime|..."), for cheap
    // is-anything-outdated checks. Missing files contribute their absence.
    function fileFingerprint(paths) {
        const fm = $.NSFileManager.defaultManager;
        return paths.map(function (p) {
            try {
                if (!fm.fileExistsAtPath(p)) return p + ':absent';
                const attrs = fm.attributesOfItemAtPathError(p, null);
                return p + ':' + Math.floor(attrs.fileModificationDate.timeIntervalSince1970);
            } catch (e) {
                return p + ':err';
            }
        }).join('|');
    }

    function readJSON(path) {
        try {
            const fm = $.NSFileManager.defaultManager;
            if (!fm.fileExistsAtPath(path)) return null;
            return JSON.parse($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js);
        } catch (e) {
            return null;
        }
    }

    function writeJSON(path, obj) {
        try {
            $.NSString.alloc.initWithUTF8String(JSON.stringify(obj))
                .writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
        } catch (e) {}
    }

    return { quoted: quoted, ensureCacheDir: ensureCacheDir, ensureDbCopy: ensureDbCopy,
             faviconForUrl: faviconForUrl, fileFingerprint: fileFingerprint,
             readJSON: readJSON, writeJSON: writeJSON };
})();
