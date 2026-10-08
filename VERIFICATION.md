# Verification — Lína 0.3.0

Tested on this Apple Silicon Mac running macOS 26.6.2, with Electron 44.7.0 and Node 22.23.2.

- TypeScript checks and production build passed.
- 37 unit tests passed: save/save-as, cancel protection, read/write failure preservation, external-change conflict, stale snapshots, draft restoration, reopening after save, invalid UTF-8, CRLF preservation, explicit AI selection boundaries, stale requests, endpoint validation, AI errors, preview safety, GFM tasks, syntax concealment on inactive lines, active-line editing, inert image widgets, native OpenAI/Claude/Gemini/OpenRouter request formats, rejected truncated responses, isolated credentials, secure-storage failure protection and migration of existing settings.
- 11 Playwright tests passed in the actual Electron runtime: real file writes with mocked native dialog choices, macOS keyboard shortcuts, editable Live Preview, exact Markdown preservation when saving, task toggles, undo/redo across source/live/reading views, cancel protection, selection prompt persistence across views/setup, exact passage edits with review/reject/accept/undo, provider settings without uploads, pill placement/resize/scroll/dismissal, stale responses, blocked preview network access, and recovery after killing and reopening the test app.
- The packaged `.app` launched successfully, with `app.isPackaged === true`. Its default editable Live Preview, reading view, direct provider settings and selection prompt were checked using isolated temporary application data. See `test-results/packaged-smoke.json`, `lina-packaged.png`, `lina-settings.png`, `lina-packaged-selection.png`, `lina-selection-pill.png`, and `lina-ai-review.png`.
- The local ad hoc bundle signature passes `codesign --verify --deep --strict`; no user signing identity, certificate, Keychain credential grant, or notarization was used.
- The DMG passes `hdiutil verify`. A SHA-256 checksum is saved in `release/SHA256SUMS.txt`.
- `npm audit --omit=dev` reported zero runtime dependency vulnerabilities at build time.

No real AI endpoint or paid service was called. Native dialog choices were mocked in automated tests; real provider credentials, live model access, Ollama and encrypted key persistence through macOS Keychain were deliberately not exercised. Provider response formats and encryption are tested with controlled mocks. Intel Macs, other macOS versions, distribution Gatekeeper behavior and notarization remain untested. Images and link navigation are intentionally disabled in the preview; tables remain Markdown text in Live Preview, and this MVP supports one document/window at a time.

The packaging hook works around the helper-name issue documented in [electron-builder #9771](https://github.com/electron-userland/electron-builder/issues/9771). It restores the expected helper names before local ad hoc signing.
