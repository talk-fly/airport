# What's New in Airport

## 1.8.0

- **Check for Updates** — check for and install updates from Help > Check for Updates

## 1.7.0

- **Worktree creation** — create git worktrees from a prompt (Cmd+N or Session > New Worktree), branches from staging
- **Workspace folders** — attach a folder to a workspace; new sessions inherit its cwd and auto-launch Claude
- **Keyboard shortcuts** — Cmd+Arrow keys for workspace/session switching, Cmd+Enter sends newline
- **Worktree detection** — sessions in worktrees show a green tree icon in the tab
- **What's New panel** — view release notes from the Help menu
- **Session resume fallback** — `claude --resume` falls back to `claude` if the session ID is stale

## 1.6.1

- Fixed title bar drag region on macOS
- Fixed install script compatibility with `--legacy-peer-deps`

## 1.6.0

- **Claude session resume** — pick up where you left off after restarting Airport
- Native macOS app shell and build pipeline
- Release workflow and install scripts

## 1.5.2

- Improved node-pty startup check for npx environments
- Fixed Review Plan button showing wrong plan in multi-session setups

## 1.5.1

- Hebrew and Arabic RTL text support with BiDi overlay

## 1.5.0

- **Workspaces** — organize sessions into separate workspaces with smooth swipe gesture navigation
- **Agent spawn** — create terminal tabs from within sessions
- **Plan review** — view Claude Code plans in a styled markdown panel
- Backlog drag-and-drop fixes

## 1.4.0

- Migrated from Electron IPC to WebSocket transport
- Onboarding screen improvements
