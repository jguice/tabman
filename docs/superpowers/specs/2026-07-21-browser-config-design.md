# Browser toggles, history recency sort, and cross-reboot snapshot guard

Date: 2026-07-21
Status: approved (design discussed and accepted in session)

## Problem

1. All browsers are always searched. Josh only wants Arc history; `tmh`
   concatenates Chrome, then Brave, then Arc (20 rows per profile each), so
   Arc history lands at the bottom or off the list entirely.
2. After a macOS restart, `tmt` serves the previous boot's snapshot while the
   background rebuild runs. Ghostty tab ids are small integers that get
   reused after relaunch, so actioning a stale row can focus an unrelated
   window on a random Space.

## Design

### Browser enable checkboxes (one global set)

Alfred workflow configuration (`userconfigurationconfig` in `info.plist`),
four checkboxes, all default-on to match current behavior:

| Label          | Variable         | Affects            |
| -------------- | ---------------- | ------------------ |
| Google Chrome  | `enable_chrome`  | tmt, tmb, tmh      |
| Brave Browser  | `enable_brave`   | tmt, tmb, tmh      |
| Arc            | `enable_arc`     | tmt, tmb, tmh      |
| Ghostty        | `enable_ghostty` | tmt (only has tabs)|

Checkbox variables arrive in the scripts' environment as `"1"`/`"0"`. In
`info.plist`, each `userconfigurationconfig` item is a dict with
`type: checkbox`, `variable`, empty `label`, and a `config` dict of
`default` (plist boolean true), `required: false`, and `text` holding the
user-visible caption ("Google Chrome", etc.).

Each script gates its per-browser collector on the corresponding variable.
A shared helper (in `lib_favicons.js`, which the three search scripts
already eval; `switch_to_tab.js` does not and needs no gating) reads them:
`enabledBrowsers()` returning e.g.
`{ chrome: true, brave: false, arc: true, ghostty: true }`. Unset variables
(running outside Alfred, or pre-upgrade installs) default to enabled.

In `search_bookmarks.js`, disabled browsers are removed from the `sources`
array up front, before `allFiles` (and thus the bookmark snapshot
fingerprint) is computed. This is load-bearing: the snapshot cache is keyed
only by source-file mtimes, so gating collect calls alone would keep
serving a disabled browser's cached rows until an unrelated mtime change.
Dropping the source's paths from the fingerprint makes toggles
self-invalidate the cache.

Unchecking a browser removes it everywhere: tabs, bookmarks, history, and
the `tmt` window fingerprint. There is no primary-browser or priority
ordering; exclusivity comes from unchecking, and ordering comes from the
recency sort below. (Alfred's config sheet has no reorderable-list control;
a "Primary browser" popup is a possible future additive change.)

### Snapshot invalidation on toggle (`tmt`)

`windowFingerprint()` only includes windows of enabled apps, and the enabled
set itself is appended to the fingerprint string (e.g. suffix
`|enabled:arc,ghostty`). The suffix is appended outside the try/catch so the
`fingerprint-error` fallback still carries it (otherwise two consecutive CG
failures would compare equal across a toggle and skip invalidation).
Toggling a checkbox therefore mismatches the stored fingerprint and triggers
the normal background rebuild. A toggle while a rebuild is already in flight
converges one rebuild later (the in-flight rebuild writes the old set's
fingerprint, the next compare mismatches again); no loop.

Independently of rebuild timing, `run()` filters served snapshot items by
the enabled set at output time (each item's `arg` JSON carries `app`;
`arclittle` counts as Arc), so unchecking a browser removes its rows from
results instantly.

### History recency sort (`tmh`)

`search_history.js` selects `last_visit_time, title, url` (timestamp FIRST:
the line parser splits on the last tab because titles may contain tabs and
the URL must stay the final column; the timestamp is taken by splitting on
the first tab). Rows carry the timestamp and all collected rows sort by it
descending before the existing URL dedupe, so the most recent duplicate
wins. `last_visit_time` is microseconds since 1601-01-01 UTC in Chrome,
Brave, and Arc alike; directly comparable. Per-source LIMIT 20 per profile
stays. With one browser checked this is pure single-browser history; with
several, they interleave by actual recency instead of source order.

### Cross-reboot snapshot guard (`tmt`)

`loadSnapshot()` reads the real boot time from `sysctl -n kern.boottime`
(parsing the `sec = N` field) and returns `null` when the snapshot file's
mtime predates it. `NSProcessInfo.systemUptime` is NOT usable here: it
counts only awake time, so `now - systemUptime` drifts later than the true
boot time by cumulative sleep (24 minutes measured within hours of boot),
which would falsely discard good same-boot snapshots after sleep and force
the slow synchronous path on every wake. `run()` then
takes the existing first-run path: fast synchronous build (no captures),
background rebuild fills in previews. Guarantees no rows from a previous
boot are ever served or actionable.

## Out of scope

- Priority ordering of browsers (no Alfred UI for it; recency sort covers
  the need).
- Per-command browser matrices.
- Safari or other non-Chromium browsers.

## Testing

- CLI runs of each script with `enable_*` env vars set to `0`/`1`/unset,
  asserting sources appear/disappear (seeded scratch cache for `tmt`, as in
  the rerun fix). For `tmt`, also assert output-time filtering: a snapshot
  containing a disabled browser must not surface its rows.
- `tmb` toggle invalidation: build the bookmark snapshot with all browsers,
  disable one, assert its rows are gone on the next run without any source
  mtime change.
- `tmh` ordering: with two browsers enabled, assert output order matches
  descending `last_visit_time` across sources.
- Reboot guard: seed a snapshot, backdate its mtime to before `kern.boottime`
  (`touch -t`), assert `loadSnapshot` ignores it and a fresh build runs.
- End-to-end: build + reinstall per CLAUDE.md, toggle checkboxes in Alfred's
  Configure Workflow sheet, verify tmt/tmb/tmh.
