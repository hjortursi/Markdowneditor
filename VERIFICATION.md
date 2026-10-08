# Verification — Lína 0.1.0

Tested on this Apple Silicon Mac running macOS 26.6.2, with Electron 44.7.0 and Node 22.23.2.

- TypeScript checks and production build passed.
- 16 unit tests passed: save/save-as, cancel protection, read/write failure preservation, external-change conflict, stale snapshots, draft restoration, reopening after save, invalid UTF-8, CRLF preservation, explicit AI selection boundaries, stale requests, endpoint validation, AI errors and preview safety.
- 4 Playwright tests passed in the actual Electron runtime: real file writes with mocked native dialog choices, macOS keyboard shortcuts, live preview/view switching, cancel protection, mock AI review/reject/accept/undo, stale responses, blocked preview network access, and recovery after killing and reopening the test app.
- The packaged `.app` launched successfully, with `app.isPackaged === true`. Its split/preview views and settings were checked. See `test-results/packaged-smoke.json`, `lina-packaged.png`, `lina-settings.png`, and `lina-ai-review.png`.
- The local ad hoc bundle signature passes `codesign --verify --deep --strict`; no user signing identity, certificate, Keychain credential grant, or notarization was used.
- The DMG passes `hdiutil verify`. A SHA-256 checksum is saved in `release/SHA256SUMS.txt`.
- `npm audit --omit=dev` reported zero runtime dependency vulnerabilities at build time.

No real AI endpoint or paid service was called. Native dialog choices were mocked in automated tests; credentials and encrypted key persistence through macOS Keychain were deliberately not exercised. Intel Macs, other macOS versions, distribution Gatekeeper behavior and notarization remain untested. Images and link navigation are intentionally disabled in the preview; this MVP supports one document/window at a time.

The packaging hook works around the helper-name issue documented in [electron-builder #9771](https://github.com/electron-userland/electron-builder/issues/9771). It restores the expected helper names before local ad hoc signing.
