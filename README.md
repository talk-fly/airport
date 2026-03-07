# Airport

A terminal multiplexer built for AI coding CLIs. Run multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions side-by-side with live status previews, so you always know which session needs your attention.

## Install

```bash
curl -fsSL https://get-airport.com/install.sh | bash
```

Or with Homebrew:

```bash
brew install --cask airport
```

Then launch the app:

```bash
open /Applications/Airport.app
```

## Build from Source

Requires Node 20+, Swift toolchain (Xcode CLI tools), and Git.

```bash
git clone https://github.com/tomer-van-cohen/airport.git
cd airport
npm install --legacy-peer-deps
./scripts/build-native.sh
open dist/Airport.app
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

Airport ships two shell scripts in `hooks/` that let it show real-time Claude Code activity (e.g. "Reading `App.tsx`", "Running agent: fix tests") inside each session tile.

**Hooks are installed automatically** when you launch Airport. The setup is idempotent and won't overwrite your existing hooks.

To remove them, delete the Airport entries from `~/.claude/settings.json` under the `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `Notification` events.

The hooks are no-ops outside Airport — they check for the `AIRPORT` environment variable and exit silently when it's absent.

## License

[MIT](LICENSE)
