# [1.3.0](https://github.com/jguice/tabman/compare/v1.2.0...v1.3.0) (2026-07-17)


### Bug Fixes

* activate app, then window, then tab when jumping ([d1a1f89](https://github.com/jguice/tabman/commit/d1a1f89d8ef3689f44b512d7af6de25dc41cd46d))
* pin windows by id - JXA index references drift when z-order changes ([6ddbede](https://github.com/jguice/tabman/commit/6ddbededb9c7b039dbb408eb3f848c49f51f4b3e))
* raise Arc windows via their AXIdentifier ([a04600f](https://github.com/jguice/tabman/commit/a04600fd0c274ee3780dd8b185cf87fa0ab043ae))
* read snapshot and bookmark files as UTF-8 ([bc8481d](https://github.com/jguice/tabman/commit/bc8481d8f9b7e1a53114c63663db027462108991))
* reliable Arc jumps and snappy per-keystroke search ([f2a676d](https://github.com/jguice/tabman/commit/f2a676d9ec136d76ee5523dc5385adf75aae5df6))
* tmt lists only Arc's real open tabs ([ec5b41a](https://github.com/jguice/tabman/commit/ec5b41adcbdc1ac520c4ffde14fbdeed41991cd5))


### Features

* add Brave browser support (closes [#6](https://github.com/jguice/tabman/issues/6)) ([970ea3f](https://github.com/jguice/tabman/commit/970ea3f34014486cb3274a2c18d6420a6f3a0c9c))
* browse all tabs with a bare tmt; app names filter too ([8a30bcc](https://github.com/jguice/tabman/commit/8a30bcc9980d63e1557aebdf356449e80bea311d))
* include Little Arc windows in tmt ([e388960](https://github.com/jguice/tabman/commit/e388960f7419d612a69a6aca33ca906c68294249))
* match multiple search tokens in any order (closes [#5](https://github.com/jguice/tabman/issues/5)) ([779a623](https://github.com/jguice/tabman/commit/779a62392b6e17af963845e6e19f23e99e6fa99f))
* tmh searches Chrome, Brave, and Arc history ([a2a1c2c](https://github.com/jguice/tabman/commit/a2a1c2ce8f2d48826ebd29854cbe59238c34b03d))

# [1.2.0](https://github.com/jguice/tabman/compare/v1.1.1...v1.2.0) (2026-07-16)


### Features

* search Arc pinned bookmarks with tmb; quiet empty results ([e03937b](https://github.com/jguice/tabman/commit/e03937bce5c7abdc68bfcc80ad22d4dd7b887298))
* search tabs across browsers and Ghostty ([4040814](https://github.com/jguice/tabman/commit/40408149e2846226e3c9dbab128428d4433b4d6c))

## [1.1.1](https://github.com/jguice/tabman/compare/v1.1.0...v1.1.1) (2024-11-22)


### Bug Fixes

* display correct version in Alfred UI ([be3f521](https://github.com/jguice/tabman/commit/be3f5213ffbf91bf38e24eaf2a5dc26cd8836e85))
* use sed instead of grep -P in release workflow ([2033a34](https://github.com/jguice/tabman/commit/2033a3454d2c7c0cd861dd1c502171f141e96f4a))

# [1.1.0](https://github.com/jguice/tabman/compare/v1.0.1...v1.1.0) (2024-11-21)


### Features

* display version in Alfred UI ([65d51df](https://github.com/jguice/tabman/commit/65d51df989d957d9f32c048b3d2d253d7c3db750))

## [1.0.1](https://github.com/jguice/tabman/compare/v1.0.0...v1.0.1) (2024-11-21)


### Bug Fixes

* **workflow:** ensure tab switching respects Chrome profiles ([b84138a](https://github.com/jguice/tabman/commit/b84138a75fe82f4142d989bb2a118cda22589948))

# 1.0.0 (2024-11-20)


* feat!: initial stable release ([b3e474a](https://github.com/jguice/tabman/commit/b3e474ad3602ed4307546296531258e4cb5017c7))


### BREAKING CHANGES

* First stable release of Tabman - The Dark Knight of Chrome search tools.

This release includes:
- Multi-profile Chrome tab search
- Bookmark search across profiles
- History search with SQLite integration
- Batman-themed UI and branding
- Comprehensive error handling

# Changelog

All notable changes to this project will be documented in this file. See [semantic-release](https://github.com/semantic-release/semantic-release) for commit guidelines.
