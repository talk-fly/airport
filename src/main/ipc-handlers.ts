import { app, dialog } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { PtyManager } from './pty-manager';
import { WsServer } from './ws-server';
import { IPC } from '../shared/ipc-channels';
import { PtyCreateOptions, SessionInfo, SavedState, ExternalTerminal, PlanFile, WorktreeCreateRequest, WorktreeCreateResult } from '../shared/types';
import { saveState, loadState } from './state-manager';

const execFileAsync = promisify(execFile);

/**
 * Walk the process tree from `pid` down to its deepest descendant.
 * In a PTY the chain is typically: zsh → claude → node → …
 * The deepest child's cwd reflects the actual working directory
 * (e.g. a git worktree), not the shell's original cwd.
 */
async function getDeepestDescendant(pid: number): Promise<number> {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)]);
    const children = stdout.trim().split('\n').filter(Boolean).map(Number);
    if (children.length === 0) return pid;
    return getDeepestDescendant(children[0]);
  } catch {
    return pid; // no children — this is the leaf
  }
}

export function registerIpcHandlers(ptyManager: PtyManager, server: WsServer): void {
  server.handle(IPC.PTY_CREATE, (options: PtyCreateOptions) => {
    return ptyManager.create(
      options,
      (sessionId, data) => {
        server.broadcast(IPC.PTY_DATA, { sessionId, data });
      },
      (sessionId, exitCode) => {
        server.broadcast(IPC.PTY_EXIT, { sessionId, exitCode });
      }
    );
  });

  server.on(IPC.PTY_WRITE, (sessionId: string, data: string) => {
    ptyManager.write(sessionId, data);
  });

  server.on(IPC.PTY_RESIZE, (sessionId: string, cols: number, rows: number) => {
    ptyManager.resize(sessionId, cols, rows);
  });

  server.on(IPC.PTY_CLOSE, (sessionId: string) => {
    ptyManager.close(sessionId);
  });

  server.handle(IPC.PTY_GET_PROCESS_NAME, (sessionId: string) => {
    return ptyManager.getProcessName(sessionId);
  });

  server.handle(IPC.GET_SESSION_INFO, async (sessionId: string): Promise<SessionInfo> => {
    const pid = ptyManager.getPid(sessionId);
    if (!pid) return { cwd: '', gitRepo: '', gitBranch: '', isWorktree: false };

    // Check for hook-reported CWD override (e.g. from EnterWorktree)
    let cwd = '';
    const statusFile = ptyManager.getStatusFile(sessionId);
    if (statusFile) {
      const cwdFile = statusFile.replace(/\.status$/, '.cwd');
      try {
        cwd = fs.readFileSync(cwdFile, 'utf-8').trim();
      } catch { /* no override */ }
    }

    // Fall back to walking the process tree and reading the foreground CWD
    if (!cwd) {
      const fgPid = await getDeepestDescendant(pid);
      try {
        const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(fgPid), '-d', 'cwd', '-Fn']);
        const match = stdout.match(/\nn(.*)/);
        if (match) cwd = match[1];
      } catch { /* ignore */ }
    }

    if (!cwd) return { cwd: '', gitRepo: '', gitBranch: '', isWorktree: false };

    let gitRepo = '';
    let gitBranch = '';
    let isWorktree = false;
    try {
      const { stdout: toplevel } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
      const toplevelPath = toplevel.trim();
      gitRepo = path.basename(toplevelPath);

      // Compare toplevel with the main repo root to detect worktrees
      const { stdout: commonDir } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd });
      const mainRepoRoot = path.dirname(path.resolve(cwd, commonDir.trim()));
      isWorktree = toplevelPath !== mainRepoRoot;

      const { stdout: branch } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
      gitBranch = branch.trim();
    } catch { /* not a git repo */ }

    return { cwd, gitRepo, gitBranch, isWorktree };
  });

  server.handle(IPC.DISCOVER_TERMINALS, async (): Promise<ExternalTerminal[]> => {
    const ownPids = new Set(ptyManager.getOwnPids());
    const shellNames = new Set(['zsh', 'bash', 'fish', 'sh', 'tcsh', 'ksh']);

    let psOutput: string;
    try {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid,tty,comm']);
      psOutput = stdout;
    } catch {
      return [];
    }

    const candidates: Array<{ pid: number; tty: string; shell: string }> = [];
    for (const line of psOutput.trim().split('\n').slice(1)) {
      const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) continue;

      const pid = parseInt(match[1], 10);
      const tty = match[2];
      const comm = match[3];

      if (tty === '??' || tty === '-') continue;

      const baseName = comm.split('/').pop()?.replace(/^-/, '') || '';
      if (!shellNames.has(baseName)) continue;
      if (ownPids.has(pid)) continue;

      candidates.push({ pid, tty, shell: baseName });
    }

    const results: ExternalTerminal[] = [];
    for (const candidate of candidates) {
      try {
        const { stdout } = await execFileAsync('lsof', [
          '-a', '-p', String(candidate.pid), '-d', 'cwd', '-Fn',
        ]);
        const cwdMatch = stdout.match(/\nn(.*)/);
        if (cwdMatch && cwdMatch[1]) {
          results.push({
            pid: candidate.pid,
            tty: candidate.tty,
            shell: candidate.shell,
            cwd: cwdMatch[1],
          });
        }
      } catch {
        // Skip processes we cannot inspect
      }
    }

    // Deduplicate by CWD
    const seen = new Set<string>();
    return results.filter((t) => {
      if (seen.has(t.cwd)) return false;
      seen.add(t.cwd);
      return true;
    });
  });

  server.handle(IPC.PLAN_GET_FILES, async (_cwd: string): Promise<PlanFile[]> => {
    // Claude Code stores all plans globally in ~/.claude/plans/.
    // Return all plan files so the renderer can track which are new.
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (!home) return [];
    const plansDir = path.join(home, '.claude', 'plans');

    try {
      const entries = await fs.promises.readdir(plansDir, { withFileTypes: true });
      const files: PlanFile[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const filePath = path.join(plansDir, entry.name);
        const stat = await fs.promises.stat(filePath);
        files.push({ name: entry.name, path: filePath, modifiedAt: stat.mtimeMs });
      }
      return files;
    } catch {
      return [];
    }
  });

  server.handle(IPC.PLAN_READ_FILE, async (filePath: string): Promise<string> => {
    if (!filePath.includes('.claude/plans/') && !filePath.includes('.claude\\plans\\')) return '';
    if (!filePath.endsWith('.md')) return '';
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  });

  server.handle(IPC.PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Workspace Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  server.handle(IPC.STATE_SAVE, (state: SavedState) => {
    saveState(state);
  });

  server.handle(IPC.STATE_LOAD, () => {
    return loadState();
  });

  server.handle(IPC.WORKTREE_CREATE, async (request: WorktreeCreateRequest): Promise<WorktreeCreateResult> => {
    const { cwd, taskDescription } = request;

    // Resolve git repo root
    let repoRoot: string;
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
      repoRoot = stdout.trim();
    } catch {
      return { success: false, error: 'Current directory is not a git repository' };
    }

    // Validate staging branch exists
    try {
      await execFileAsync('git', ['rev-parse', '--verify', 'staging'], { cwd: repoRoot });
    } catch {
      return { success: false, error: "Branch 'staging' not found in this repository" };
    }

    // Convert task description to kebab-case branch name
    const kebab = taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    if (!kebab) {
      return { success: false, error: 'Invalid task description' };
    }

    const branchName = `worktree/${kebab}`;
    const worktreePath = path.join(repoRoot, '.claude', 'worktrees', kebab);

    // Create parent directory
    await fs.promises.mkdir(path.dirname(worktreePath), { recursive: true });

    // Create worktree
    try {
      await execFileAsync('git', ['worktree', 'add', worktreePath, '-b', branchName, 'staging'], { cwd: repoRoot });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }

    return { success: true, worktreePath, branchName };
  });

  server.handle(IPC.CHANGELOG_READ, async (): Promise<string> => {
    const changelogPath = app.isPackaged
      ? path.join(process.resourcesPath, 'CHANGELOG.md')
      : path.join(__dirname, '..', '..', '..', 'CHANGELOG.md');
    try {
      return await fs.promises.readFile(changelogPath, 'utf-8');
    } catch {
      return '';
    }
  });
}
