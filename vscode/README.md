# SOVEREIGN for VS Code

Ask SOVEREIGN about the code in front of you — without leaving the editor.

Works in **VS Code**, and in every editor that loads VS Code extensions: **Cursor**,
**Windsurf**, **VSCodium** and **Google Antigravity**.

---

## Screenshots

<!-- Rasmlar shu yerga qo'yiladi. Fayllar: docs/media/*.png (repo'da), Marketplace README'ga
     mutlaq https havola bilan kiritiladi. -->

| | |
|---|---|
| **Chat side panel** — `![Chat panel](https://…/panel.png)` | *Ask about the current file or selection; answers stream in.* |
| **Apply to editor** — `![Apply](https://…/apply.png)` | *Every code block gets Copy and Apply to editor.* |
| **Explain selection** — `![Explain](https://…/explain.png)` | *Editor context menu and `Ctrl+Alt+E`.* |
| **Fix this error** — `![Fix](https://…/fix.png)` | *Uses the diagnostic under the cursor.* |
| **Model picker** — `![Models](https://…/models.png)` | *Status bar → model and plan.* |

---

## What it does

### 1. Chat side panel

A webview in the activity bar. Ask about the file you have open or the lines you
selected. The answer streams in; every code block gets two buttons:

- **Copy** — puts the code on the clipboard.
- **Apply to editor** — inserts it at the cursor, or replaces the selection.
  It is an ordinary editor edit, so **`Ctrl+Z` undoes it**. Nothing is ever written to
  disk behind your back.

### 2. Inline commands

Available from the command palette (`Ctrl+Shift+P`), the editor context menu
(right-click → **SOVEREIGN**) and keybindings:

| Command | Keybinding | What it sends |
|---|---|---|
| SOVEREIGN: Open chat | `Ctrl+Alt+S` | — |
| SOVEREIGN: Explain selection | `Ctrl+Alt+E` | selection + surrounding lines |
| SOVEREIGN: Fix this error | `Ctrl+Alt+X` | the above **+ the diagnostic under the cursor** |
| SOVEREIGN: Write a test for this function | `Ctrl+Alt+T` | selection + surrounding lines |
| SOVEREIGN: Ask about this file | — | your question + selection + surrounding lines |

On macOS the modifier is `Cmd` instead of `Ctrl`.

### 3. What gets sent

Only a **bounded** context:

- the file path relative to the workspace folder (never the absolute path, so your home
  directory and user name stay out of it),
- the language id,
- up to `sovereign.maxContextLines` lines around the selection (default **120**),
- the diagnostic text, for *Fix this error* only.

**The workspace is never sent.** A long selection is trimmed head-and-tail with a marker,
and the snippet is also capped by character count. Turn context off entirely with the
checkbox in the composer, or set `sovereign.maxContextLines` to `0`.

### 4. What it deliberately does **not** do

No autonomous file editing. No terminal execution. No Full auto. No workspace indexing.

That is a deliberate limit: it keeps the extension's security surface small. For agentic
work — writing files, running tests, fixing build errors on its own — use the
**SOVEREIGN CLI** (`npm i -g @islombekrrr/sov-cli`, then `sov`) or **SOVEREIGN Cowork**,
the desktop app. Both have a sandbox and a change-review panel; this extension does not
need one, because it never acts on its own.

---

## Signing in

Two ways, both reusing your existing SOVEREIGN account:

**Device login (default).** Click **Sign in** in the panel, or run
*SOVEREIGN: Sign in*. The extension calls `POST /api/cli/start`, shows you the code,
opens `https://soveregn.xyz/cli/connect?code=…` with `vscode.env.openExternal`, and polls
`GET /api/cli/poll` until you approve it in the browser. Approve only if the code in the
browser matches the one the editor shows.

**Use my existing CLI login.** If you already ran `sov login` in a terminal, run
*SOVEREIGN: Use my existing CLI login*. The extension reads the token from
`~/.sovereign/config.json` and copies it into the editor's secret storage. It does not
modify that file, and it reads nothing else from it.

The token is stored **only** in VS Code **SecretStorage** (the OS keychain). It never goes
into `settings.json`, into any workspace file, or into a log. *SOVEREIGN: Sign out*
revokes it on the server too.

---

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `sovereign.baseUrl` | `https://soveregn.xyz` | Server address. Only `https://` is accepted (plus `http://localhost` for development); anything else falls back to the default. |
| `sovereign.model` | `auto` | Model id from the SOVEREIGN catalogue, or `auto` to let the server choose. Pick one from the status bar. |
| `sovereign.maxContextLines` | `120` | Upper bound on the lines sent around the selection. `0` sends no code at all. |
| `sovereign.language` | `auto` | Panel language: `auto`, `uz`, `uz-cyrl`, `ru`, `en`. |
| `sovereign.telemetry` | `false` | Off. The extension collects no telemetry at all; the switch exists so the answer is explicit. |

No secret is ever stored in settings.

---

## Languages

The panel speaks **uz** (Latin), **uz-cyrl**, **ru** and **en**, following the editor's
display language and overridable with `sovereign.language`.

A note on how VS Code resolves locales, since it matters here: VS Code picks the display
language from a fixed list of Language Packs — `en`, `zh-cn`, `zh-tw`, `fr`, `de`, `it`,
`es`, `ja`, `ko`, `ru`, `pt-br`, `tr`, `pl`, `cs`, `hu`. **Uzbek is not on that list**, so
`vscode.env.language` will never be `uz` in stock VS Code, and neither `package.nls.uz.json`
nor a `bundle.l10n.uz.json` would ever be selected by the editor.

Because of that:

- **Manifest strings** (command titles, setting descriptions) use `package.nls.json` (en,
  the default) plus `package.nls.ru.json`, `package.nls.uz.json` and
  `package.nls.uz-cyrl.json`. `ru` resolves today; the Uzbek files ship so that a fork or
  a future language pack that reports `uz` / `uz-cyrl` picks them up.
- **Runtime strings** (panel, notifications, quick picks) do **not** use `vscode.l10n`.
  They live in `src/core/i18n.ts` with all four languages, so Uzbek works regardless of
  what the editor supports. A unit test asserts every key has all four languages, matching
  placeholders and the right alphabet.

---

## Install the .vsix locally

```bash
cd vscode
npm install
npm run compile
npm test
npm run package        # → vscode/sovereign.vsix
```

Then, in any of the supported editors:

```bash
code      --install-extension sovereign.vsix   # VS Code
cursor    --install-extension sovereign.vsix   # Cursor
windsurf  --install-extension sovereign.vsix   # Windsurf
codium    --install-extension sovereign.vsix   # VSCodium
```

Or from the UI: **Extensions** view → `…` menu → **Install from VSIX…**.

To develop: open the `vscode/` folder in VS Code and press **F5** — that starts an
Extension Development Host with the extension loaded. See `docs/VSCODE.md` (in Uzbek) for
the full run, build and publish procedure.

---

## Security

- **Strict CSP.** The webview runs with `default-src 'none'`; the only script is the local
  `media/panel.js`, allowed by a per-render nonce. No `eval`, no inline handlers, no
  `unsafe-inline`, no remote origins, `connect-src 'none'` (the webview makes no requests
  of its own — the extension host does all networking).
- **Restricted resources.** `enableScripts: true`, but `localResourceRoots` is limited to
  the extension's `media/` folder; the webview cannot read your workspace.
- **Model output is untrusted.** It is escaped and rendered by the extension's own
  markdown renderer (`src/core/markdown.ts`): no raw HTML, no `javascript:`, `data:`,
  `file:` or `vscode:` links, no `http:` links. Only `https:` links become clickable, and
  clicking one posts a message to the extension host, which re-validates the scheme before
  calling `vscode.env.openExternal`. While an answer is streaming it is rendered as plain
  text (`textContent`), never as HTML.
- **Validated protocol.** Every message from the webview goes through
  `src/core/protocol.ts`, which checks the type, length and allowed values of each field
  and drops anything unknown. The webview can only ask to apply a code block *by index* —
  it can never hand the host arbitrary text to insert.
- **Token hygiene.** The token lives in SecretStorage, travels only in an `Authorization`
  header, is shape-checked before storage (so it cannot inject a header), and is never
  logged. Helper `maskToken` exists for the cases where something must be printed.
- **URL hygiene.** `sovereign.baseUrl` is sanitised to `https:` (or `http://localhost`) on
  every use, and the sign-in page URL returned by the server is checked against that host
  before the browser is opened.

---

## License

MIT — see [LICENSE](LICENSE).
