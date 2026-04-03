import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PtyManager } from './pty-manager';
import { WsServer } from './ws-server';
import { IPC } from '../shared/ipc-channels';

/**
 * Watches status files written by Claude Code hooks.
 * Each PTY session has a file at /tmp/airport-{pid}/{sessionId}.status
 * Hook scripts write "busy;message" or "done;message" to these files.
 *
 * Also watches for .spawn files written by the airport-spawn script.
 * These request creation of new terminal tabs from within existing sessions.
 *
 * Uses fs.watch on the status directory for near-instant detection (~ms),
 * with a slow polling fallback as a safety net for missed events.
 */
const PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');

export function startHookWatcher(
  ptyManager: PtyManager,
  server: WsServer
): () => void {
  const lastContent = new Map<string, string>();
  const lastSessionContent = new Map<string, string>();
  const lastPlanContent = new Map<string, string>();
  const lastEditorContent = new Map<string, string>();
  // Track known plan files (by path) so we can detect new ones
  const knownPlanPaths = new Set<string>();
  let plansInitialized = false;
  const STATUS_DIR = path.join(os.tmpdir(), `airport-${process.pid}`);

  function processSession(sessionId: string) {
    const filePath = ptyManager.getStatusFile(sessionId);
    if (!filePath) return;

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8').trim();
    } catch {
      return;
    }

    if (!content || content === lastContent.get(sessionId)) return;
    lastContent.set(sessionId, content);

    const semi = content.indexOf(';');
    const state = (semi >= 0 ? content.slice(0, semi) : content) as 'busy' | 'done';
    const message = semi >= 0 ? content.slice(semi + 1) : '';

    if (state === 'busy' || state === 'done') {
      server.broadcast(IPC.HOOK_STATUS, { sessionId, state, message });
    }
  }

  function processClaudeSessionFile(sessionId: string) {
    const statusFile = ptyManager.getStatusFile(sessionId);
    if (!statusFile) return;

    const sessionFile = statusFile.replace(/\.status$/, '.claude-session');
    let claudeSessionId: string;
    try {
      claudeSessionId = fs.readFileSync(sessionFile, 'utf-8').trim();
    } catch {
      return;
    }

    if (!claudeSessionId || claudeSessionId === lastSessionContent.get(sessionId)) return;
    lastSessionContent.set(sessionId, claudeSessionId);

    server.broadcast(IPC.HOOK_SESSION, { sessionId, claudeSessionId });
  }

  function processPlanFile(sessionId: string) {
    const statusFile = ptyManager.getStatusFile(sessionId);
    if (!statusFile) return;

    const planFile = statusFile.replace(/\.status$/, '.plan');
    let planPath: string;
    try {
      planPath = fs.readFileSync(planFile, 'utf-8').trim();
    } catch {
      return;
    }

    if (!planPath || planPath === lastPlanContent.get(sessionId)) return;
    lastPlanContent.set(sessionId, planPath);

    server.broadcast(IPC.HOOK_PLAN, { sessionId, planPath });
  }

  // Guard against macOS fs.watch firing duplicate events for the same file
  const processedSpawns = new Set<string>();

  function processSpawnFile(filePath: string) {
    const basename = path.basename(filePath);
    if (processedSpawns.has(basename)) return;
    processedSpawns.add(basename);
    // Clean up after a short delay to avoid unbounded growth
    setTimeout(() => processedSpawns.delete(basename), 5000);

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8').trim();
      fs.unlinkSync(filePath);
    } catch {
      return;
    }

    let request: { cwd?: string; command?: string; title?: string };
    try {
      request = JSON.parse(raw);
    } catch {
      return;
    }

    // Forward to renderer — it owns PTY + shadow terminal creation
    server.broadcast(IPC.SPAWN_REQUEST, {
      title: request.title,
      cwd: request.cwd,
      command: request.command,
    });
  }

  function processEditorFile(sessionId: string) {
    const statusFile = ptyManager.getStatusFile(sessionId);
    if (!statusFile) return;

    const editorFile = statusFile.replace(/\.status$/, '.editor');
    let filePath: string;
    try {
      filePath = fs.readFileSync(editorFile, 'utf-8').trim();
    } catch {
      return;
    }

    if (!filePath || filePath === lastEditorContent.get(sessionId)) return;
    lastEditorContent.set(sessionId, filePath);

    server.broadcast(IPC.HOOK_EDITOR, { sessionId, filePath });
  }

  // fs.watch on the directory: OS notifies us the moment any file changes
  let dirWatcher: fs.FSWatcher | undefined;
  try {
    dirWatcher = fs.watch(STATUS_DIR, (_event, filename) => {
      if (filename && filename.endsWith('.status')) {
        const sessionId = filename.slice(0, -7); // strip '.status'
        processSession(sessionId);
      } else if (filename && filename.endsWith('.claude-session')) {
        const sessionId = filename.slice(0, -14); // strip '.claude-session'
        processClaudeSessionFile(sessionId);
      } else if (filename && filename.endsWith('.plan')) {
        const sessionId = filename.slice(0, -5); // strip '.plan'
        processPlanFile(sessionId);
      } else if (filename && filename.endsWith('.spawn')) {
        processSpawnFile(path.join(STATUS_DIR, filename));
      } else if (filename && filename.endsWith('.editor') && !filename.endsWith('.editor-done')) {
        const sessionId = filename.slice(0, -7); // strip '.editor'
        processEditorFile(sessionId);
      } else {
        // filename can be null on some platforms — scan all sessions
        for (const sessionId of ptyManager.getAllSessionIds()) {
          processSession(sessionId);
        }
      }
    });
    dirWatcher.on('error', () => { /* ignore watch errors, polling covers it */ });
  } catch {
    // Directory watch unavailable, rely on polling only
  }

  // Poll ~/.claude/plans/ to track known plan files. Assignment is handled
  // exclusively by the sidecar .plan file mechanism (processPlanFile) which
  // is per-session and authoritative. This poll only keeps knownPlanPaths
  // up to date so the set doesn't miss files.
  function pollPlansDirectory() {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(PLANS_DIR, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        knownPlanPaths.add(path.join(PLANS_DIR, entry.name));
      }
    }
    plansInitialized = true;
  }

  // Slow polling fallback — catches anything fs.watch might miss
  const interval = setInterval(() => {
    for (const sessionId of ptyManager.getAllSessionIds()) {
      processSession(sessionId);
      processClaudeSessionFile(sessionId);
      processPlanFile(sessionId);
      processEditorFile(sessionId);
    }
    pollPlansDirectory();
  }, 2000);

  return () => {
    clearInterval(interval);
    dirWatcher?.close();
    lastContent.clear();
    lastSessionContent.clear();
    lastPlanContent.clear();
    lastEditorContent.clear();
  };
}
