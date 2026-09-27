# Changelog

All notable changes to the SOVEREIGN editor extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Note for the maintainer

`publisher` in `package.json` is still the placeholder `sovereign`. Replace it with the
real Marketplace publisher id before the first `vsce publish` — see `docs/VSCODE.md`.

## [0.1.0] — 2026-09-27

### Added

- **Chat side panel** in the activity bar: ask about the current file or selection,
  answers stream in, code blocks get **Copy** and **Apply to editor** buttons.
- **Inline commands** with a command-palette entry, an editor context submenu and
  keybindings: *Explain selection* (`Ctrl+Alt+E`), *Fix this error* (`Ctrl+Alt+X`,
  uses the diagnostic under the cursor), *Write a test for this function*
  (`Ctrl+Alt+T`), *Ask about this file*, *Open chat* (`Ctrl+Alt+S`).
- **Device login** reusing the SOVEREIGN CLI flow (`POST /api/cli/start` →
  `/cli/connect` → `GET /api/cli/poll`). The token is kept in VS Code SecretStorage.
- **Use my existing CLI login** — imports the token from `~/.sovereign/config.json`.
- **Status bar item** showing the model and plan; clicking opens a menu with the
  model picker (from `/api/models`), settings and sign in/out.
- **Settings**: `sovereign.baseUrl`, `sovereign.model`, `sovereign.maxContextLines`,
  `sovereign.language`, `sovereign.telemetry` (off, and nothing is collected).
- **Four interface languages**: `uz`, `uz-cyrl`, `ru`, `en`. Manifest strings use
  `package.nls*.json`; runtime strings use the extension's own bundle so Uzbek works
  even though VS Code has no Uzbek display language.

### Security

- Webview runs under a strict CSP (`default-src 'none'`, script only with a per-render
  nonce, no `eval`, no inline handlers) and `localResourceRoots` limited to `media/`.
- Model output is treated as untrusted: it is escaped and rendered through the
  extension's own markdown renderer — no raw HTML, and only `https:` links, opened
  with `vscode.env.openExternal`.
- Every message crossing the webview boundary is validated.
- No autonomous file editing, no terminal execution, no Full auto — by design.
