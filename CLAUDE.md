# Tabman development

## Making and testing changes

1. Edit code in `src/` only. `workflow/` and `Tabman.alfredworkflow` are build artifacts; `src/` is the single source of truth.
2. Run `./build.sh` to regenerate `workflow/` and `Tabman.alfredworkflow`.
3. Reinstall the built package so Alfred runs exactly what would be released: `open Tabman.alfredworkflow`. Alfred prompts to import; the matching bundle id (`com.joshguice.tabman`) replaces the installed copy.
4. Test in Alfred (`tmt` / `tmb` / `tmh` keywords).

Never edit the installed copy under `Alfred.alfredpreferences/workflows/` directly; always go through build + reinstall so what gets tested is what gets pushed and released.

## Useful paths

- Installed workflow: `~/Library/Application Support/Alfred/Alfred.alfredpreferences/workflows/` (find it by grepping info.plist for `com.joshguice.tabman`)
- Workflow cache (snapshots, window shots, favicons): `~/Library/Caches/com.runningwithcrayons.Alfred/Workflow Data/com.joshguice.tabman/`
