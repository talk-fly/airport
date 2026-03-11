# Airport (Fork)

A terminal multiplexer built for AI coding CLIs. Run multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions side-by-side with live status previews, so you always know which session needs your attention.

**This is a fork of [tomer-van-cohen/airport](https://github.com/tomer-van-cohen/airport)** with the changes described below.

## What's Different from the Original

### 1. Claude Session Resume

The biggest addition: Airport now captures Claude Code **session IDs** via a new `SessionStart` hook. When you quit and relaunch Airport, it can resume Claude sessions instead of starting fresh ones.

**New files:**
- `hooks/airport-session-start.sh` — hook script that captures the Claude session ID and writes it to a `.claude-session` sidecar file
- New `HookSessionEvent` type and `HOOK_SESSION` IPC channel for propagating session IDs from main to renderer

**How it works:**
1. Claude Code fires a `SessionStart` hook when a session begins
2. The hook script extracts `session_id` from the JSON payload and writes it next to the `.status` file
3. Airport's `hook-watcher.ts` detects the `.claude-session` file and broadcasts the ID to the renderer
4. On save, the session ID is persisted; on restore, it's passed as an env var so `.zshrc` can `--resume` the session

**Required `.zshrc` change:** Add this snippet to your `~/.zshrc` so that restored Airport sessions automatically resume their Claude conversation:

```bash
# Auto-resume Claude Code sessions in Airport
if [[ -n "$AIRPORT_CLAUDE_SESSION_ID" ]]; then
  claude --resume "$AIRPORT_CLAUDE_SESSION_ID"
fi
```

Without this, Airport will pass the session ID as an environment variable but nothing will act on it — sessions will start fresh instead of resuming.

### 2. Native Module Packaging Fixes

The original `forge.config.ts` used `asar: true` which broke native modules (`node-pty`) at runtime. This fork:
- Unpacks native `.node` binaries from the asar archive
- Copies `node-pty`, `ws`, and `nan` into the packaged `node_modules/` via a `packageAfterCopy` hook

### 3. Local Install Script

New `scripts/install-local.sh` (run via `npm run install-local`) that:
- Builds a production `Airport.app` with `electron-forge package`
- Copies hooks to `~/.airport/hooks/` (stable prod path)
- Installs the app to `/Applications/Airport.app`
- Re-runs hook setup pointing to prod paths
- Launches the app

### 4. Dev vs Prod Hook Paths

`scripts/setup-hooks.mjs` now distinguishes between dev and prod:
- **Dev** (`AIRPORT_DEV=1`): hooks resolve from the project's `hooks/` directory
- **Prod**: hooks resolve from `~/.airport/hooks/`

### 5. Auto-Open Plan Files

When a `.plan` file is detected for the active session, it automatically opens in the markdown viewer — no need to click "Review Plan" manually.

### 6. Workspace Name & Claude Session ID in PTY Environment

`pty-manager.ts` now passes `AIRPORT_WORKSPACE_NAME` and `AIRPORT_CLAUDE_SESSION_ID` as environment variables to spawned terminals, making them available to hooks and shell scripts.

## Full Diff

<details>
<summary>Click to expand the complete diff against the original</summary>

```diff
diff --git a/forge.config.ts b/forge.config.ts
index 2681f95..cc9d9d4 100644
--- a/forge.config.ts
+++ b/forge.config.ts
@@ -5,11 +5,18 @@ import { VitePlugin } from '@electron-forge/plugin-vite';
 import { FusesPlugin } from '@electron-forge/plugin-fuses';
 import { FuseV1Options, FuseVersion } from '@electron/fuses';
 import { execSync } from 'node:child_process';
-import { resolve } from 'node:path';
+import { cpSync, existsSync } from 'node:fs';
+import { resolve, join } from 'node:path';
+
+// Native/external modules that Vite marks as external but need to be
+// present in the packaged app's node_modules for runtime require().
+const NATIVE_DEPS = ['node-pty', 'ws'];

 const config: ForgeConfig = {
   packagerConfig: {
-    asar: true,
+    asar: {
+      unpack: '{**/node-pty/**,**/*.node}',
+    },
     name: 'Airport',
   },
   hooks: {
@@ -20,6 +27,28 @@ const config: ForgeConfig = {
       execSync(`plutil -replace CFBundleDisplayName -string "Airport Dev" "${plist}"`);
       execSync(`plutil -replace CFBundleName -string "Airport Dev" "${plist}"`);
     },
+    packageAfterCopy: async (_config, buildPath) => {
+      const projectRoot = resolve(__dirname);
+      const srcNM = join(projectRoot, 'node_modules');
+      const destNM = join(buildPath, 'node_modules');
+
+      for (const dep of NATIVE_DEPS) {
+        const src = join(srcNM, dep);
+        if (existsSync(src)) {
+          cpSync(src, join(destNM, dep), { recursive: true });
+        }
+      }
+
+      const nanAddon = join(srcNM, 'nan');
+      if (existsSync(nanAddon)) {
+        cpSync(nanAddon, join(destNM, 'nan'), { recursive: true });
+      }
+    },
   },

diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -24,7 +24,8 @@
-    "build:standalone": "node esbuild.backend.mjs && npx vite build --config vite.standalone.config.ts"
+    "build:standalone": "node esbuild.backend.mjs && npx vite build --config vite.standalone.config.ts",
+    "install-local": "bash scripts/install-local.sh"

diff --git a/scripts/setup-hooks.mjs b/scripts/setup-hooks.mjs
--- a/scripts/setup-hooks.mjs
+++ b/scripts/setup-hooks.mjs
@@ -13,10 +13,15 @@
-const busyScript = join(projectRoot, 'hooks', 'airport-busy.sh');
-const doneScript = join(projectRoot, 'hooks', 'airport-done.sh');
+const isDev = process.env.AIRPORT_DEV === '1';
+const hooksBase = isDev ? join(projectRoot, 'hooks') : join(homedir(), '.airport', 'hooks');
+const busyScript = join(hooksBase, 'airport-busy.sh');
+const doneScript = join(hooksBase, 'airport-done.sh');
+const sessionStartScript = join(hooksBase, 'airport-session-start.sh');

 const DESIRED_HOOKS = {
+  SessionStart:     sessionStartScript,
   UserPromptSubmit: busyScript,

diff --git a/src/main/hook-watcher.ts b/src/main/hook-watcher.ts
  + Watches for .claude-session files and broadcasts HOOK_SESSION events

diff --git a/src/main/pty-manager.ts b/src/main/pty-manager.ts
  + Passes AIRPORT_WORKSPACE_NAME and AIRPORT_CLAUDE_SESSION_ID env vars

diff --git a/src/renderer/hooks/usePtyBridge.ts b/src/renderer/hooks/usePtyBridge.ts
  + Tracks claudeSessionIds map
  + Listens for onHookSession events
  + Marks sessions as Claude sessions on first hook activity
  + Auto-opens plan files for the active session
  + Skips buffer save/restore for Claude sessions (resume handles it)

diff --git a/src/renderer/lib/ws-bridge.ts b/src/renderer/lib/ws-bridge.ts
  + Wires up onHookSession callback via IPC

diff --git a/src/shared/ipc-channels.ts b/src/shared/ipc-channels.ts
  + HOOK_SESSION channel

diff --git a/src/shared/types.ts b/src/shared/types.ts
  + HookSessionEvent interface
  + claudeSession flag on TerminalSession
  + workspaceName and claudeSessionId on PtyCreateOptions and SavedSession
```

</details>

---

## Install (Original)

```bash
curl -fsSL https://get-airport.com/install.sh | bash
```

Or with Homebrew:

```bash
brew install --cask airport
```

## Build from Source

Requires Node 20+, Swift toolchain (Xcode CLI tools), and Git.

```bash
git clone https://github.com/talk-fly/airport.git
cd airport
npm install --legacy-peer-deps
./scripts/build-native.sh
npm run install-local   # builds, installs to /Applications, launches
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+T` | New session |
| `Cmd+W` | Close session |
| `Cmd+1`–`Cmd+9` | Switch to session 1–9 |
| `Cmd+[` / `Cmd+]` | Previous / next session |
| `Cmd+Shift+[` / `Cmd+Shift+]` | Previous / next session (alt) |
| `Cmd+J` | Jump to next waiting session |
| `Cmd+K` | Clear terminal |

## Claude Code Hooks

Airport ships shell scripts in `hooks/` that let it show real-time Claude Code activity (e.g. "Reading `App.tsx`", "Running agent: fix tests") inside each session tile.

**Hooks are installed automatically** when you launch Airport. The setup is idempotent and won't overwrite your existing hooks.

To remove them, delete the Airport entries from `~/.claude/settings.json` under the `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `Notification` events.

The hooks are no-ops outside Airport — they check for the `AIRPORT` environment variable and exit silently when it's absent.

## License

[MIT](LICENSE)
