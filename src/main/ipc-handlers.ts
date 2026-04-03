import { app, dialog } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { PtyManager } from './pty-manager';
import { WsServer } from './ws-server';
import { IPC } from '../shared/ipc-channels';
import { PtyCreateOptions, SessionInfo, SavedState, ExternalTerminal, PlanFile, WorktreeCreateRequest, WorktreeCreateResult, UpdateCheckResult, HookEditorEvent } from '../shared/types';
import { saveState, loadState } from './state-manager';

const execFileAsync = promisify(execFile);

/**
 * Walk the process tree from `pid` down to its deepest descendant.
 * In a PTY the chain is typically: zsh → claude → node → …
 * The deepest child's cwd reflects the actual working directory
 * (e.g. a git worktree), not the shell's original cwd.
 */
async function getDeepestDescendant(pid: number): Promise<number> {
  if (process.platform === 'win32') return getDeepestDescendantWindows(pid);
  try {
    const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)]);
    const children = stdout.trim().split('\n').filter(Boolean).map(Number);
    if (children.length === 0) return pid;
    return getDeepestDescendant(children[0]);
  } catch {
    return pid;
  }
}

async function getDeepestDescendantWindows(pid: number): Promise<number> {
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile', '-Command',
      `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}").ProcessId`
    ]);
    const children = stdout.trim().split('\n')
      .map(l => parseInt(l.trim(), 10))
      .filter(n => !isNaN(n));
    if (children.length === 0) return pid;
    return getDeepestDescendantWindows(children[0]);
  } catch { return pid; }
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
    // Use git -C instead of { cwd } to avoid spawning a child process
    // whose CWD is inside a macOS TCC-protected directory (~/Downloads,
    // ~/Documents, ~/Desktop), which triggers endless permission prompts.
    try {
      const { stdout: toplevel } = await execFileAsync('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
      const toplevelPath = toplevel.trim();
      gitRepo = path.basename(toplevelPath);

      // Compare toplevel with the main repo root to detect worktrees
      const { stdout: commonDir } = await execFileAsync('git', ['-C', cwd, 'rev-parse', '--git-common-dir']);
      const mainRepoRoot = path.dirname(path.resolve(cwd, commonDir.trim()));
      isWorktree = toplevelPath !== mainRepoRoot;

      const { stdout: branch } = await execFileAsync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']);
      gitBranch = branch.trim();
    } catch { /* not a git repo */ }

    return { cwd, gitRepo, gitBranch, isWorktree };
  });

  server.handle(IPC.DISCOVER_TERMINALS, async (): Promise<ExternalTerminal[]> => {
    if (process.platform === 'win32') return [];
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

  const REPO = 'talk-fly/airport';

  server.handle(IPC.UPDATE_CHECK, async (): Promise<UpdateCheckResult> => {
    const currentVersion = app.getVersion();
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (!res.ok) return { available: false, currentVersion, latestVersion: currentVersion };
      const release = await res.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> };
      const latestVersion = release.tag_name.replace(/^v/, '');
      if (latestVersion === currentVersion) {
        return { available: false, currentVersion, latestVersion };
      }

      // Fetch CHANGELOG.md from the latest release tag to show what's new
      let changelog = '';
      try {
        const changelogRes = await fetch(`https://raw.githubusercontent.com/${REPO}/${release.tag_name}/CHANGELOG.md`);
        if (changelogRes.ok) {
          const fullChangelog = await changelogRes.text();
          // Extract entries between latest and current version
          const currentHeader = `## ${currentVersion}`;
          const latestIdx = fullChangelog.indexOf(`## ${latestVersion}`);
          const currentIdx = fullChangelog.indexOf(currentHeader);
          if (latestIdx !== -1 && currentIdx !== -1 && latestIdx < currentIdx) {
            changelog = fullChangelog.slice(latestIdx, currentIdx).trim();
          } else if (latestIdx !== -1) {
            // Current version not in changelog — show everything from latest
            changelog = fullChangelog.slice(latestIdx).trim();
          }
        }
      } catch { /* ignore changelog fetch failures */ }

      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const asset = release.assets.find((a) => a.name === `Airport-${arch}.tar.gz`);

      return {
        available: true,
        currentVersion,
        latestVersion,
        changelog: changelog || undefined,
        downloadUrl: asset?.browser_download_url,
      };
    } catch {
      return { available: false, currentVersion, latestVersion: currentVersion };
    }
  });

  server.handle(IPC.UPDATE_INSTALL, async (downloadUrl: string): Promise<void> => {
    const os = await import('node:os');
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'airport-update-'));
    const tarPath = path.join(tmpDir, 'airport.tar.gz');

    // Download
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(tarPath, buffer);

    // Extract
    await execFileAsync('tar', ['xzf', tarPath, '-C', tmpDir]);

    // Replace /Applications/Airport.app
    const appPath = '/Applications/Airport.app';
    try { await execFileAsync('rm', ['-rf', appPath]); } catch { /* ignore */ }
    await execFileAsync('mv', [path.join(tmpDir, 'Airport.app'), appPath]);

    // Clean up temp
    await execFileAsync('rm', ['-rf', tmpDir]);

    // Relaunch
    app.relaunch({ execPath: path.join(appPath, 'Contents', 'MacOS', 'Airport') });
    app.quit();
  });

  server.handle(IPC.CHANGELOG_READ, async (): Promise<string> => {
    const changelogPath = app.isPackaged
      ? path.join(process.resourcesPath, 'CHANGELOG.md')
      : path.join(__dirname, '..', '..', 'CHANGELOG.md');
    try {
      return await fs.promises.readFile(changelogPath, 'utf-8');
    } catch {
      return '';
    }
  });

  // Editor integration: read temp file content for the editor panel
  server.handle(IPC.EDITOR_READ_FILE, async (filePath: string): Promise<string> => {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  });

  // Editor integration: write edited content back and signal the blocking script
  const STATUS_DIR = path.join(os.tmpdir(), `airport-${process.pid}`);

  server.handle(IPC.EDITOR_SUBMIT, async (sessionId: string, content: string): Promise<void> => {
    const editorFile = path.join(STATUS_DIR, `${sessionId}.editor`);
    const doneFile = path.join(STATUS_DIR, `${sessionId}.editor-done`);

    // Read the temp file path from the .editor sidecar
    let tmpFilePath: string;
    try {
      tmpFilePath = await fs.promises.readFile(editorFile, 'utf-8');
      tmpFilePath = tmpFilePath.trim();
    } catch {
      return;
    }

    // Write edited content back to the temp file
    await fs.promises.writeFile(tmpFilePath, content, 'utf-8');
    // Signal the blocking airport-editor script to exit
    await fs.promises.writeFile(doneFile, 'submit', 'utf-8');
  });

  server.handle(IPC.EDITOR_CANCEL, async (sessionId: string): Promise<void> => {
    const doneFile = path.join(STATUS_DIR, `${sessionId}.editor-done`);
    // Signal the blocking airport-editor script to exit with cancel
    await fs.promises.writeFile(doneFile, 'cancel', 'utf-8');
  });
}
