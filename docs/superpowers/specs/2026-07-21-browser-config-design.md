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

Checkbox variables arrive in the scripts' environment as `"1"`/`"0"`. Each
script gates its per-browser collector on the corresponding variable. A
shared helper (in `lib_favicons.js`, which every script already evals)
reads them: `enabledBrowsers()` returning e.g.
`{ chrome: true, brave: false, arc: true, ghostty: true }`. Unset variables
(running outside Alfred, or pre-upgrade installs) default to enabled.

Unchecking a browser removes it everywhere: tabs, bookmarks, history, and
the `tmt` window fingerprint. There is no primary-browser or priority
ordering; exclusivity comes from unchecking, and ordering comes from the
recency sort below. (Alfred's config sheet has no reorderable-list control;
a "Primary browser" popup is a possible future additive change.)

### Snapshot invalidation on toggle (`tmt`)

`windowFingerprint()` only includes windows of enabled apps, and the enabled
set itself is appended to the fingerprint string (e.g. suffix
`|enabled:arc,ghostty`). Toggling a checkbox therefore mismatches the stored
fingerprint, triggering the normal background rebuild; disabled browsers
disappear on the next rebuild rather than lingering in the snapshot.

### History recency sort (`tmh`)

`search_history.js` adds `last_visit_time` to the SELECT, carries it on each
result row, and sorts all collected rows by it (descending) before the
existing URL dedupe. Per-source LIMIT 20 per profile stays. With one browser
checked this is pure single-browser history; with several, they interleave
by actual recency instead of source order.

### Cross-reboot snapshot guard (`tmt`)

`loadSnapshot()` computes boot time as
`NSDate.date.timeIntervalSince1970 - NSProcessInfo.processInfo.systemUptime`
and returns `null` when the snapshot file's mtime predates it. `run()` then
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
  the rerun fix).
- `tmh` ordering: with two browsers enabled, assert output order matches
  descending `last_visit_time` across sources.
- Reboot guard: seed a snapshot, backdate its mtime to before boot time
  (`touch -t`), assert `loadSnapshot` ignores it and a fresh build runs.
- End-to-end: build + reinstall per CLAUDE.md, toggle checkboxes in Alfred's
  Configure Workflow sheet, verify tmt/tmb/tmh.
