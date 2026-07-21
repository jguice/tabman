# Browser Toggles + History Recency Sort + Reboot Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-browser enable checkboxes in Alfred's workflow configuration that gate tmt/tmb/tmh (with correct cache invalidation), a global recency sort for tmh, and a boot-time guard so tmt never serves a previous boot's snapshot.

**Architecture:** Alfred checkbox config vars (`enable_chrome|brave|arc|ghostty`, `"1"`/`"0"`, unset ⇒ enabled) read by a shared `FaviconLib.enabledBrowsers()` helper. Each search script gates its collectors; tmb drops disabled sources before its mtime fingerprint (cache self-invalidates), tmt appends the enabled set to its window fingerprint AND filters served items at output time, tmh sorts all rows by `last_visit_time` before dedupe. `loadSnapshot()` discards snapshots older than `sysctl -n kern.boottime`.

**Tech Stack:** JXA (JavaScript for Automation) run via `/usr/bin/osascript -l JavaScript`, Alfred 5 workflow plist, sqlite3 CLI. No test framework: tests are CLI runs asserted with shell/python one-liners.

**Spec:** `docs/superpowers/specs/2026-07-21-browser-config-design.md` (read it first).

## Global Constraints

- Scripts must be run with cwd = `src/` (they `eval` `lib_favicons.js` from the current directory).
- Always test against a throwaway cache: `export C=$(mktemp -d)` and pass `alfred_workflow_cache="$C"`; never point tests at the real Alfred cache.
- Unset `enable_*` variables MUST behave as enabled (pre-upgrade installs and CLI runs).
- `src/` is the single source of truth; never edit `workflow/` or the installed copy (see CLAUDE.md).
- No em dashes in any text or comments.
- Commit after each task.

---

### Task 1: `enabledBrowsers()` helper in lib_favicons.js

**Files:**
- Modify: `src/lib_favicons.js` (add function inside the `FaviconLib` IIFE and export it)

**Interfaces:**
- Produces: `FaviconLib.enabledBrowsers()` → `{ chrome: bool, brave: bool, arc: bool, ghostty: bool }`. Tasks 2-6 rely on this exact name and shape.

- [ ] **Step 1: Write the failing test (CLI probe)**

Run from repo root:

```bash
cd src && env enable_brave=0 /usr/bin/osascript -l JavaScript -e '
eval($.NSString.stringWithContentsOfFileEncodingError($.NSFileManager.defaultManager.currentDirectoryPath.js + "/lib_favicons.js", $.NSUTF8StringEncoding, null).js);
JSON.stringify(FaviconLib.enabledBrowsers())'
```

Expected: FAIL with `TypeError: FaviconLib.enabledBrowsers is not a function` (or `undefined is not a function`).

- [ ] **Step 2: Implement**

In `src/lib_favicons.js`, add before the `return {` line of the IIFE:

```javascript
    // Browser enable toggles from Alfred's workflow configuration
    // (checkboxes arrive as "1"/"0" env vars). Unset means enabled, so CLI
    // runs and pre-upgrade installs behave like all-on.
    function enabledBrowsers() {
        const env = $.NSProcessInfo.processInfo.environment;
        function on(name) {
            try {
                const v = env.objectForKey(name);
                if (v.isNil()) return true;
                return v.js !== '0';
            } catch (e) {
                return true;
            }
        }
        return { chrome: on('enable_chrome'), brave: on('enable_brave'),
                 arc: on('enable_arc'), ghostty: on('enable_ghostty') };
    }
```

And add `enabledBrowsers: enabledBrowsers,` to the returned object:

```javascript
    return { quoted: quoted, ensureCacheDir: ensureCacheDir, ensureDbCopy: ensureDbCopy,
             faviconForUrl: faviconForUrl, fileFingerprint: fileFingerprint,
             readJSON: readJSON, writeJSON: writeJSON, enabledBrowsers: enabledBrowsers };
```

- [ ] **Step 3: Verify all three env states**

```bash
cd src
for v in "enable_brave=0" "enable_brave=1" ""; do
  env $v /usr/bin/osascript -l JavaScript -e '
eval($.NSString.stringWithContentsOfFileEncodingError($.NSFileManager.defaultManager.currentDirectoryPath.js + "/lib_favicons.js", $.NSUTF8StringEncoding, null).js);
JSON.stringify(FaviconLib.enabledBrowsers())'
done
```

Expected output lines, in order:
1. `{"chrome":true,"brave":false,"arc":true,"ghostty":true}`
2. `{"chrome":true,"brave":true,"arc":true,"ghostty":true}`
3. `{"chrome":true,"brave":true,"arc":true,"ghostty":true}`

- [ ] **Step 4: Commit**

```bash
git add src/lib_favicons.js
git commit -m "feat: shared enabledBrowsers() helper reading Alfred checkbox vars"
```

---

### Task 2: Checkbox configuration in info.plist

**Files:**
- Modify: `info.plist` (add top-level `userconfigurationconfig` key)

**Interfaces:**
- Produces: env vars `enable_chrome`, `enable_brave`, `enable_arc`, `enable_ghostty` in every script Alfred runs (consumed by Task 1's helper).

- [ ] **Step 1: Add the configuration block**

`info.plist` is XML plist; its top-level `<dict>` keys are alphabetical-ish but Alfred doesn't require order. Add this key/value pair inside the top-level `<dict>` (e.g. after the `</dict>` closing `uidata` or at the end before `<key>version</key>`; anywhere at top level works):

```xml
	<key>userconfigurationconfig</key>
	<array>
		<dict>
			<key>config</key>
			<dict>
				<key>default</key>
				<true/>
				<key>required</key>
				<false/>
				<key>text</key>
				<string>Google Chrome</string>
			</dict>
			<key>description</key>
			<string>Include Google Chrome tabs, bookmarks, and history.</string>
			<key>label</key>
			<string></string>
			<key>type</key>
			<string>checkbox</string>
			<key>variable</key>
			<string>enable_chrome</string>
		</dict>
		<dict>
			<key>config</key>
			<dict>
				<key>default</key>
				<true/>
				<key>required</key>
				<false/>
				<key>text</key>
				<string>Brave Browser</string>
			</dict>
			<key>description</key>
			<string>Include Brave Browser tabs, bookmarks, and history.</string>
			<key>label</key>
			<string></string>
			<key>type</key>
			<string>checkbox</string>
			<key>variable</key>
			<string>enable_brave</string>
		</dict>
		<dict>
			<key>config</key>
			<dict>
				<key>default</key>
				<true/>
				<key>required</key>
				<false/>
				<key>text</key>
				<string>Arc</string>
			</dict>
			<key>description</key>
			<string>Include Arc tabs, bookmarks (pinned sidebar items), and history.</string>
			<key>label</key>
			<string></string>
			<key>type</key>
			<string>checkbox</string>
			<key>variable</key>
			<string>enable_arc</string>
		</dict>
		<dict>
			<key>config</key>
			<dict>
				<key>default</key>
				<true/>
				<key>required</key>
				<false/>
				<key>text</key>
				<string>Ghostty</string>
			</dict>
			<key>description</key>
			<string>Include Ghostty terminal tabs (tmt only).</string>
			<key>label</key>
			<string></string>
			<key>type</key>
			<string>checkbox</string>
			<key>variable</key>
			<string>enable_ghostty</string>
		</dict>
	</array>
```

- [ ] **Step 2: Lint the plist**

```bash
plutil -lint info.plist
```

Expected: `info.plist: OK`

- [ ] **Step 3: Verify structure round-trips**

```bash
plutil -convert json -o - info.plist | python3 -c "import json,sys; d=json.load(sys.stdin); c=d['userconfigurationconfig']; assert [x['variable'] for x in c]==['enable_chrome','enable_brave','enable_arc','enable_ghostty'], c; assert all(x['type']=='checkbox' and x['config']['default'] is True for x in c); print('plist config OK')"
```

Expected: `plist config OK`

- [ ] **Step 4: Commit**

```bash
git add info.plist
git commit -m "feat: browser enable checkboxes in workflow configuration"
```

---

### Task 3: Gate tmb bookmarks (cache self-invalidation via sources filter)

**Files:**
- Modify: `src/search_bookmarks.js:11-23` (the `sources` array)

**Interfaces:**
- Consumes: `FaviconLib.enabledBrowsers()` (Task 1).

- [ ] **Step 1: Write the failing test**

```bash
export C=$(mktemp -d)
cd src
env alfred_workflow_cache="$C" /usr/bin/osascript -l JavaScript search_bookmarks.js '' > /dev/null
env alfred_workflow_cache="$C" enable_brave=0 enable_chrome=0 /usr/bin/osascript -l JavaScript search_bookmarks.js '' | python3 -c "import json,sys; items=json.load(sys.stdin)['items']; srcs={i['subtitle'].split(' - ')[0] for i in items}; assert srcs <= {'Arc'}, srcs; print('tmb gating OK:', srcs)"
```

Expected: FAIL with an AssertionError showing `{'Chrome', 'Brave', 'Arc'}` (or whichever sources have bookmarks). The first run intentionally seeds the snapshot with everything enabled, so this test also proves toggle-invalidation of the cache once implemented.

- [ ] **Step 2: Implement**

In `src/search_bookmarks.js`, replace the `sources` assignment's closing `];` so the array is filtered:

```javascript
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
```

(Only the `const enabled` line, the comment, and the `.filter(...)` are new; the array contents are unchanged.)

- [ ] **Step 3: Run the test from Step 1 again (same `$C`, do NOT recreate it)**

Expected: `tmb gating OK: {'Arc'}`. Then re-enable and confirm restoration:

```bash
env alfred_workflow_cache="$C" /usr/bin/osascript -l JavaScript search_bookmarks.js '' | python3 -c "import json,sys; items=json.load(sys.stdin)['items']; srcs={i['subtitle'].split(' - ')[0] for i in items}; assert 'Chrome' in srcs or 'Brave' in srcs, srcs; print('tmb re-enable OK:', srcs)"
```

Expected: `tmb re-enable OK: ...` including more than just Arc.

- [ ] **Step 4: Commit**

```bash
git add src/search_bookmarks.js
git commit -m "feat: gate bookmark sources on browser toggles (fingerprint self-invalidates)"
```

---

### Task 4: Gate tmh history + global recency sort

**Files:**
- Modify: `src/search_history.js` (`run()` and the sqlite SELECT/parse in `collectChromiumHistory`)

**Interfaces:**
- Consumes: `FaviconLib.enabledBrowsers()` (Task 1).
- Produces: result rows internally carry numeric `ts` (Chrome epoch microseconds) until output mapping strips it.

- [ ] **Step 1: Write the failing gating test**

```bash
export C=$(mktemp -d)
cd src
env alfred_workflow_cache="$C" enable_chrome=0 enable_brave=0 /usr/bin/osascript -l JavaScript search_history.js 'a' | python3 -c "import json,sys; items=json.load(sys.stdin)['items']; srcs={i['subtitle'].split(' - ')[0] for i in items}; assert srcs <= {'Arc'}, srcs; print('tmh gating OK:', srcs)"
```

Expected: FAIL (sources include Chrome/Brave).

- [ ] **Step 2: Implement gating and sort**

In `src/search_history.js`, replace the three `collectChromiumHistory(...)` calls in `run()` with:

```javascript
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
```

(The sort line goes immediately before the existing `const seen = {};` dedupe block. The dedupe and return stay as they are, except the output mapping below.)

Change the deduped return to strip `ts`:

```javascript
    const deduped = results.filter(function (item) {
        if (seen[item.arg]) return false;
        seen[item.arg] = true;
        return true;
    }).map(function (item) {
        delete item.ts;
        return item;
    });
```

In `collectChromiumHistory`, change the sqlite arguments (timestamp FIRST; the URL must remain the last column because titles may contain tabs and the parser splits on the last tab):

```javascript
                task.setArguments(['-separator', '\t', tempFile,
                    'SELECT last_visit_time, title, url FROM urls WHERE ' + where +
                    ' ORDER BY last_visit_time DESC LIMIT 20;']);
```

And change the line parser:

```javascript
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
```

- [ ] **Step 3: Re-run the gating test from Step 1**

Expected: `tmh gating OK: {'Arc'}`

- [ ] **Step 4: Verify cross-source ordering**

The first result with everything enabled must be the globally most recent row across the db copies the run created:

```bash
env alfred_workflow_cache="$C" /usr/bin/osascript -l JavaScript search_history.js 'the' > "$C/out.json"
python3 - "$C" <<'EOF'
import json, sqlite3, glob, sys
c = sys.argv[1]
best = (0, None)
for db in glob.glob(c + '/db-history-*'):
    row = sqlite3.connect(db).execute(
        "SELECT last_visit_time, url FROM urls WHERE title LIKE '%the%' OR url LIKE '%the%' ORDER BY last_visit_time DESC LIMIT 1").fetchone()
    if row and row[0] > best[0]:
        best = row
items = json.load(open(c + '/out.json'))['items']
assert items, 'no results'
assert items[0]['arg'] == best[1], (items[0]['arg'], best)
assert all('ts' not in i for i in items), 'ts leaked into output'
print('tmh ordering OK, most recent first:', best[1])
EOF
```

Expected: `tmh ordering OK, most recent first: <url>`

- [ ] **Step 5: Commit**

```bash
git add src/search_history.js
git commit -m "feat: gate history sources on toggles; sort all history by recency"
```

---

### Task 5: Gate tmt tabs (collectors, fingerprint suffix, output-time filter)

**Files:**
- Modify: `src/search_tabs.js` (`windowFingerprint()`, `run()`, `buildSnapshot()`)

**Interfaces:**
- Consumes: `FaviconLib.enabledBrowsers()` (Task 1). `search_tabs.js` already evals `lib_favicons.js`.
- Produces: fingerprint strings ending in `|enabled:<comma-list>`; `run()` filters snapshot items by the `app` field inside each item's `arg` JSON (`arclittle` counts as `arc`).

- [ ] **Step 1: Write the failing output-filter test (seeded snapshot, no browser access)**

```bash
export C=$(mktemp -d)
mkdir "$C/rebuild.lock"   # blocks a real background rebuild from spawning
cat > "$C/tabs-snapshot.json" <<'EOF'
[{"title":"zsh session","subtitle":"Ghostty","arg":"{\"app\":\"ghostty\",\"tabId\":1}","icon":{"type":"fileicon","path":"/Applications/Ghostty.app"},"text":{"copy":"zsh"},"_search":"ghostty zsh session"},
 {"title":"Arc tab","subtitle":"Arc - https://x.test","arg":"{\"app\":\"arc\",\"tabId\":\"t\",\"url\":\"https://x.test\"}","icon":{"type":"fileicon","path":"/Applications/Arc.app"},"text":{"copy":"u"},"quicklookurl":"https://x.test","_search":"arc arc tab https://x.test"},
 {"title":"Little","subtitle":"Little Arc","arg":"{\"app\":\"arclittle\",\"axId\":\"littleBrowserWindow-1\"}","icon":{"type":"fileicon","path":"/Applications/Arc.app"},"text":{"copy":"Little"},"_search":"arc little little"}]
EOF
cd src
env alfred_workflow_cache="$C" enable_ghostty=0 /usr/bin/osascript -l JavaScript search_tabs.js '' | python3 -c "import json,sys; items=json.load(sys.stdin)['items']; titles=[i['title'] for i in items]; assert 'zsh session' not in titles, titles; assert 'Arc tab' in titles and 'Little' in titles, titles; print('tmt output filter OK:', titles)"
```

Expected: FAIL (`'zsh session'` present: no filtering exists yet).

- [ ] **Step 2: Implement**

(a) `windowFingerprint()`: enabled-aware owners, suffix OUTSIDE the try/catch so the error fallback still carries it:

```javascript
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
```

(b) `buildSnapshot()`: gate the collect calls:

```javascript
    const enabled = FaviconLib.enabledBrowsers();
    const home = $.NSHomeDirectory().js;
    if (enabled.chrome) collectChromiumTabs('Google Chrome', 'chrome', home + '/Library/Application Support/Google/Chrome/Default/Favicons', items);
    if (enabled.brave) collectChromiumTabs('Brave Browser', 'brave', home + '/Library/Application Support/BraveSoftware/Brave-Browser/Default/Favicons', items);
    if (enabled.arc) collectArcTabs(items);
    if (enabled.arc) collectArcLittleWindows(items);
    if (enabled.ghostty) collectGhosttyTabs(items);
```

(c) `run()`: filter served items by enabled set, immediately after `items` is assigned (both branches) and before the token filter:

```javascript
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
```

- [ ] **Step 3: Re-run the Step 1 test**

Expected: `tmt output filter OK: ['Arc tab', 'Little']`

- [ ] **Step 4: Verify fingerprint suffix invalidates on toggle**

```bash
env alfred_workflow_cache="$C" /usr/bin/osascript -l JavaScript -e '
eval($.NSString.stringWithContentsOfFileEncodingError($.NSFileManager.defaultManager.currentDirectoryPath.js + "/lib_favicons.js", $.NSUTF8StringEncoding, null).js);' \
  -e "$(sed -n '/^function windowFingerprint/,/^}/p' search_tabs.js)" -e 'windowFingerprint()' > /tmp/fp_all.txt
env alfred_workflow_cache="$C" enable_ghostty=0 /usr/bin/osascript -l JavaScript -e '
eval($.NSString.stringWithContentsOfFileEncodingError($.NSFileManager.defaultManager.currentDirectoryPath.js + "/lib_favicons.js", $.NSUTF8StringEncoding, null).js);' \
  -e "$(sed -n '/^function windowFingerprint/,/^}/p' search_tabs.js)" -e 'windowFingerprint()' > /tmp/fp_noghostty.txt
grep -o 'enabled:.*' /tmp/fp_all.txt /tmp/fp_noghostty.txt
cmp /tmp/fp_all.txt /tmp/fp_noghostty.txt && echo "SAME (BUG)" || echo "fingerprints differ OK"
```

Expected: suffixes `enabled:chrome,brave,arc,ghostty` vs `enabled:chrome,brave,arc`, and `fingerprints differ OK`. (Note: `windowFingerprint` needs the Screen Recording permission for window names; from a plain terminal the base may be sparse, which is fine, the suffix is what's under test.)

- [ ] **Step 5: Commit**

```bash
git add src/search_tabs.js
git commit -m "feat: gate tab collectors on toggles; enabled-set fingerprint; instant output filter"
```

---

### Task 6: Cross-reboot snapshot guard

**Files:**
- Modify: `src/search_tabs.js` (`loadSnapshot()` plus new `bootTimeSeconds()` helper)

**Interfaces:**
- Consumes: nothing new. Produces: `loadSnapshot()` returns `null` for pre-boot snapshots.

- [ ] **Step 1: Write the failing test**

```bash
export C=$(mktemp -d)
mkdir "$C/rebuild.lock"
printf '[{"title":"GHOST ROW","subtitle":"Ghostty","arg":"{\\"app\\":\\"ghostty\\",\\"tabId\\":9}","icon":{"type":"fileicon","path":"/Applications/Ghostty.app"},"text":{"copy":"x"},"_search":"ghostty ghost row"}]' > "$C/tabs-snapshot.json"
touch -t 202001010000 "$C/tabs-snapshot.json"   # long before any current boot
cd src
env alfred_workflow_cache="$C" /usr/bin/osascript -l JavaScript search_tabs.js 'ghost row' | python3 -c "import json,sys; items=json.load(sys.stdin)['items']; assert not any(i['title']=='GHOST ROW' for i in items), [i['title'] for i in items]; print('reboot guard OK')"
```

Expected: FAIL (`GHOST ROW` is served: the stale snapshot is trusted). NOTE: once the guard works, this run takes the synchronous fast-build path and will query live browsers via Apple Events; run it in a terminal that has Automation permission (the same setup used for earlier `--rebuild` CLI tests).

- [ ] **Step 2: Implement**

In `src/search_tabs.js`, add near `loadSnapshot()`:

```javascript
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
```

In `loadSnapshot()`, after `const attrs = ...` line, add:

```javascript
        const mtime = attrs.fileModificationDate.timeIntervalSince1970;
        // A snapshot from a previous boot is garbage: window ids and Ghostty
        // tab ids are reused across reboots, so a stale row can focus an
        // unrelated window. Treat it as absent (forces the fast sync build).
        const boot = bootTimeSeconds();
        if (boot && mtime < boot) return null;
```

And change the existing `age` line to reuse `mtime`:

```javascript
        const age = $.NSDate.date.timeIntervalSince1970 - mtime;
```

- [ ] **Step 3: Re-run the Step 1 test**

Expected: `reboot guard OK` (output contains only live tabs, if any match).

- [ ] **Step 4: Verify same-boot snapshots still serve**

```bash
ls -la "$C/tabs-snapshot.json"   # rebuilt by step 3's run; mtime is now
env alfred_workflow_cache="$C" /usr/bin/osascript -l JavaScript search_tabs.js '' | python3 -c "import json,sys; print('serves', len(json.load(sys.stdin)['items']), 'items from fresh snapshot')"
```

Expected: a non-zero item count served without a long block (snapshot trusted).

- [ ] **Step 5: Commit**

```bash
git add src/search_tabs.js
git commit -m "fix: discard tab snapshots from a previous boot (kern.boottime guard)"
```

---

### Task 7: Build, reinstall, end-to-end verify

**Files:**
- Modify: `README.md` (add a Configuration section)
- Regenerated: `workflow/`, `Tabman.alfredworkflow` (build artifacts, committed per repo convention)

- [ ] **Step 1: Add a Configuration section to README.md**

After the existing usage/keywords section, add:

```markdown
## Configuration

Open the workflow in Alfred Preferences and click "Configure Workflow". One
checkbox per browser (Google Chrome, Brave Browser, Arc, Ghostty; all on by
default). Unchecking a browser removes it everywhere it appears: its tabs
from `tmt`, bookmarks from `tmb`, and history from `tmh`. Ghostty only has
tabs. History results are sorted by last visit time across all enabled
browsers.
```

- [ ] **Step 2: Build and reinstall**

```bash
./build.sh
open Tabman.alfredworkflow
```

Expected: Alfred prompts to import; matching bundle id replaces the installed copy. The human confirms the import dialog.

- [ ] **Step 3: End-to-end checks in Alfred (human-in-the-loop)**

Ask the human partner to verify:
1. Configure Workflow shows the four checkboxes, all checked.
2. Uncheck all but Arc: `tmh <query>` shows only `Arc - ...` subtitles; `tmb` only Arc; `tmt` shows no Chrome/Brave/Ghostty rows (instantly, no rebuild wait).
3. Re-check all: everything returns.

- [ ] **Step 4: Commit**

```bash
git add README.md workflow Tabman.alfredworkflow
git commit -m "feat: build with browser toggles; document configuration"
```
