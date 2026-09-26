# SOVEREIGN Cowork — desktop design (v0.5)

Short spec + architecture for the Electron app. Web design language is reused
(`src/app/globals.css`): base `#060812`, elevated `#0d1033`, floating `#141840`,
accent `#5B50F0` / soft `#7C6FF7`, success `#10d4a0`, warning `#f59e0b`,
error `#ef4444`. Light theme mirrors it on `#f7f8fc`.

## 1. Screens and states

| Screen | States |
|---|---|
| **Boot** | splash (logo pulse) → `init()` resolves; bridge missing → full-screen error |
| **Onboarding** (first run, `settings.onboarded=false`) | 1 Welcome + language · 2 Account (connected / sign in via browser: code + waiting / cancelled / expired / error / offline / skip) · 3 Working folder (pick / recent / skip) · 4 Safety model (approve-before-write, risky-command flags, undo, "what actually happened" ledger) |
| **Workspace** | title bar (drag, breadcrumb, Ctrl+K button, OS window controls via `titleBarOverlay`) · sidebar (Tasks history / Files tree) · conversation · right panel (Changes / Terminal) · status bar |
| Conversation | empty (per mode; no folder / not signed in callouts) · user msg · assistant markdown (code copy) · tool step (running / awaiting approval / ok / failed / declined / skipped, expandable result) · ledger card · error card (retry / sign in) · thinking indicator with Stop |
| Right panel | Changes: empty / list with +/− / inline diff / Undo, Undo all · Terminal: empty / commands with exit status + copy |
| Overlays | Confirm dialog (focus on Cancel, Enter never auto-confirms, Esc = cancel, focus trap) · Command palette (Ctrl+K) · Shortcuts (Ctrl+/) · Settings (General, Model, Workspace, Account, History, About/Updates) · file viewer · toasts |

## 2. Keyboard

Ctrl+K palette · Ctrl+/ shortcuts · Ctrl+N new task · Ctrl+O open folder ·
Ctrl+, settings · Ctrl+B sidebar · Ctrl+J right panel · Ctrl+L focus composer ·
Ctrl+E Chat/Code · Ctrl+. stop · Enter send · Shift+Enter newline · Esc close.

## 3. Architecture (module boundaries)

```
desktop/
  main.mjs            entry: window, lifecycle, IPC wiring, agent loop (uses ../cli/src exports only)
  electron/
    settings.mjs      userData/settings.json — validated prefs + window bounds
    history.mjs       userData/history/*.json — task metadata, model messages, UI events (capped)
    auth.mjs          device login (POST /api/cli/start → poll) — config saved via injected saveConfig
    updater.mjs       electron-updater (GitHub Releases), manual download, silent when offline / no release
    net.mjs           offline guard (SOV_OFFLINE=1 / --offline): patches fetch to localhost-only
  preload.cjs         window.sovereign — narrow, typed IPC surface (contextIsolation, sandbox)
  ui/src/
    App.jsx           boot → Onboarding | Workspace, theme/lang application, global hotkeys
    lib/              i18n (uz, uz-Cyrl via transliteration, ru, en), agent reducer, md, diff, bridge(+dev mock)
    components/       TitleBar, Sidebar, FileTree, Conversation, ToolStep, LedgerCard, Composer,
                      RightPanel, DiffView, ConfirmDialog, ModelPicker, CommandPalette, Shortcuts,
                      Settings, Onboarding, Modal (focus trap), Toasts, StatusBar, Icon
```

Dependency direction: `ui → preload API → main → cli/src` (never reversed). Renderer has no
Node access; the CLI package is imported only by the main process.

## 4. IPC contract (`window.sovereign`)

| Call | Direction | Notes |
|---|---|---|
| `init()` | invoke | `{authed,email,baseUrl,cwd\|null,model,version,offline,settings,recent,history}` |
| `pickFolder()` / `openRecent(path)` | invoke | recent path must be in main's own recent list and be a directory |
| `revealWorkspace()` | invoke | opens *current* workspace in Explorer only |
| `newTask()` / `stop()` / `send(text, mode)` / `retry()` | invoke/send | one active turn; stop keeps history |
| `confirmReply(id, ok)` | send | resolves a pending approval |
| `fsTree()` / `fsRead(path)` | invoke | read-only, path must resolve inside workspace, protected paths refused |
| `fsRestore(backupId)` | invoke | Undo only from main-held backups — **no renderer-supplied write path** |
| `setModel(id)` / `models(qs)` | invoke | catalog fetched by main (renderer CSP has no network) |
| `settings.get/set(patch)` | invoke | whitelisted keys, validated values |
| `auth.login/cancel/logout()` | invoke | events `auth` {state, code?} |
| `history.list/open/remove/clear()` | invoke | ids validated (uuid) |
| `updates.check/download/install()` | invoke | events `update` {state, version?} |
| `onEvent(cb)` | on | `text, tool, tool-done, confirm, terminal, ledger, done, stopped, error, task, auth, update` |

Every handler checks the sender frame is the app's own page (`validSender`).

## 5. Security model (unchanged, enforced in main)

contextIsolation + sandbox + no nodeIntegration; strict CSP; navigation/new windows
denied; permission requests denied except clipboard write; every write/command goes
through `runTool` → confirm dialog in the renderer; Undo backups live in main;
`openExternal` only for the device-login URL (https, same site as baseUrl) and a fixed
allowlist of SOVEREIGN pages.

## 6. Packaging

electron-builder NSIS, per-user (`perMachine:false`, no elevation), desktop + Start
menu shortcuts, `build/icon.ico` generated from `public/logo.svg`
(`npm run icons`), artifact `SOVEREIGN-Cowork-Setup-<version>.exe`.
Unsigned: Windows SmartScreen shows "Windows protected your PC" → *More info* →
*Run anyway* until a code-signing certificate is added (`win.signtoolOptions` / CSC_LINK).
Version: 0.5.0 (package was already 0.4.1, so "0.2.0" would have been a downgrade and would
break updater ordering). Release: push tag `desktop-vX.Y.Z` → `.github/workflows/desktop-release.yml` builds and
uploads installer + `latest.yml` to a GitHub Release; the app's updater reads that
release (it must be the repo's *latest* release, and the repo must be public or the
update check silently finds nothing).
