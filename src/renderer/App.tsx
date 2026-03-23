import { useEffect, useCallback, useState, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { MainTerminal } from './components/MainTerminal';
import { SessionControls } from './components/SessionControls';
import { OnboardingScreen } from './components/OnboardingScreen';
import { PlanReviewPanel } from './components/PlanReviewPanel';
import { WhatsNewPanel } from './components/WhatsNewPanel';
import { WorkspaceDots } from './components/WorkspaceDots';
import { WorktreePrompt } from './components/WorktreePrompt';
import { WorkspaceContainer } from './components/WorkspaceContainer';
import { useTerminalStore } from './store/terminal-store';
import { usePtyBridge } from './hooks/usePtyBridge';

const DEFAULT_SIDEBAR_WIDTH = 384; // 320 * 1.2
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;

export function App() {
  const { sessions, activeSessionId, previousSessionId, setActiveSession, planViewSessionId, planViewPath, workspaces, activeWorkspaceId, setActiveWorkspace, showChangelog, openChangelog } = useTerminalStore();
  const workspaceEmpty = sessions.length === 0 || !sessions.some((s) => s.workspaceId === activeWorkspaceId && !s.backlog);
  const { createSession, closeSession, setMainDimensions, restoreState, clearTerminal } = usePtyBridge();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [showWorktreePrompt, setShowWorktreePrompt] = useState(false);
  const [worktreeError, setWorktreeError] = useState('');
  const [worktreeLoading, setWorktreeLoading] = useState(false);
  const dragging = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Restore previous state (no auto-create — show onboarding if empty)
  useEffect(() => {
    restoreState();
  }, []);

  // Listen for Help > What's New menu
  useEffect(() => {
    return window.airport.onMenuWhatsNew(() => {
      openChangelog();
    });
  }, [openChangelog]);

  // Listen for Session > New Worktree menu
  useEffect(() => {
    return window.airport.onMenuNewWorktree(() => {
      setWorktreeError('');
      setShowWorktreePrompt(true);
    });
  }, []);

  const handleNewSession = useCallback(async () => {
    const id = await createSession();
    useTerminalStore.getState().setActiveSession(id);
  }, [createSession]);

  const handleAdoptTerminals = useCallback(async () => {
    const terminals = await window.airport.discoverTerminals();
    if (terminals.length === 0) return;

    let firstId: string | null = null;
    for (const terminal of terminals) {
      const id = await createSession({
        cwd: terminal.cwd,
        title: terminal.cwd.split('/').pop() || terminal.shell,
      });
      if (!firstId) firstId = id;
    }
    if (firstId) {
      useTerminalStore.getState().setActiveSession(firstId);
    }
  }, [createSession]);

  const handleCreateWorktree = useCallback(async (taskDescription: string) => {
    // Get cwd from active workspace folder or active session
    const store = useTerminalStore.getState();
    const workspace = store.workspaces.find((w) => w.id === store.activeWorkspaceId);
    const activeSession = store.sessions.find((s) => s.id === store.activeSessionId);
    const cwd = workspace?.folderPath || activeSession?.cwd;

    if (!cwd) {
      setWorktreeError('Open a terminal in a git repository first');
      return;
    }

    setWorktreeLoading(true);
    setWorktreeError('');

    try {
      const result = await window.airport.createWorktree({ cwd, taskDescription });

      if (!result.success) {
        setWorktreeError(result.error || 'Failed to create worktree');
        setWorktreeLoading(false);
        return;
      }

      setShowWorktreePrompt(false);
      setWorktreeLoading(false);

      // Create a session in the current workspace — git polling will
      // auto-detect the branch and set the title to repo/worktree/branch-name
      const sessionId = await createSession({ cwd: result.worktreePath! });
      useTerminalStore.getState().setActiveSession(sessionId);
    } catch (err) {
      setWorktreeError(err instanceof Error ? err.message : 'Unexpected error');
      setWorktreeLoading(false);
    }
  }, [createSession]);

  const handleDimensions = useCallback(
    (cols: number, rows: number) => {
      setMainDimensions(cols, rows);
    },
    [setMainDimensions]
  );

  // Sidebar resize drag
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = navigator.userAgent.includes('Windows') ? e.ctrlKey : e.metaKey;

      if (isMod && e.key === 'n') {
        e.preventDefault();
        setWorktreeError('');
        setShowWorktreePrompt(true);
        return;
      }

      if (isMod && e.key === 't') {
        e.preventDefault();
        handleNewSession();
        return;
      }

      if (isMod && e.key === 'w') {
        e.preventDefault();
        if (activeSessionId) {
          closeSession(activeSessionId);
        }
        return;
      }

      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (previousSessionId && sessions.some((s) => s.id === previousSessionId)) {
          setActiveSession(previousSessionId);
        }
        return;
      }

      // Workspace switching: Ctrl+Cmd+] / Ctrl+Cmd+[
      if (e.ctrlKey && (navigator.userAgent.includes('Windows') ? e.altKey : e.metaKey) && e.key === ']') {
        e.preventDefault();
        const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
        if (workspaces.length > 1) {
          setActiveWorkspace(workspaces[(idx + 1) % workspaces.length].id);
        }
        return;
      }

      if (e.ctrlKey && (navigator.userAgent.includes('Windows') ? e.altKey : e.metaKey) && e.key === '[') {
        e.preventDefault();
        const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
        if (workspaces.length > 1) {
          setActiveWorkspace(workspaces[(idx - 1 + workspaces.length) % workspaces.length].id);
        }
        return;
      }

      // Workspace switching: Cmd+Right / Cmd+Left
      if (e.metaKey && !e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
        if (workspaces.length > 1) {
          setActiveWorkspace(workspaces[(idx + 1) % workspaces.length].id);
        }
        return;
      }

      if (e.metaKey && !e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
        if (workspaces.length > 1) {
          setActiveWorkspace(workspaces[(idx - 1 + workspaces.length) % workspaces.length].id);
        }
        return;
      }

      // Session shortcuts scoped to active workspace
      const visible = sessions.filter((s) => !s.backlog && s.workspaceId === activeWorkspaceId);

      if (isMod && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < visible.length) {
          setActiveSession(visible[idx].id);
        }
        return;
      }

      if (isMod && e.key === ']') {
        e.preventDefault();
        const idx = visible.findIndex((s) => s.id === activeSessionId);
        if (visible.length > 0) {
          setActiveSession(visible[(idx + 1) % visible.length].id);
        }
        return;
      }

      if (isMod && e.key === '[') {
        e.preventDefault();
        const idx = visible.findIndex((s) => s.id === activeSessionId);
        if (visible.length > 0) {
          setActiveSession(visible[(idx - 1 + visible.length) % visible.length].id);
        }
        return;
      }

      // Session switching: Mod+Down / Mod+Up
      if (isMod && e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = visible.findIndex((s) => s.id === activeSessionId);
        if (visible.length > 0) {
          setActiveSession(visible[(idx + 1) % visible.length].id);
        }
        return;
      }

      if (isMod && e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = visible.findIndex((s) => s.id === activeSessionId);
        if (visible.length > 0) {
          setActiveSession(visible[(idx - 1 + visible.length) % visible.length].id);
        }
        return;
      }

      if (isMod && e.key === 'j') {
        e.preventDefault();
        const idx = visible.findIndex((s) => s.id === activeSessionId);
        for (let i = 1; i <= visible.length; i++) {
          const candidate = visible[(idx + i) % visible.length];
          if (candidate.hookDone) {
            setActiveSession(candidate.id);
            break;
          }
        }
        return;
      }

      if (isMod && e.key === 'k') {
        e.preventDefault();
        if (activeSessionId) {
          clearTerminal(activeSessionId);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSessionId, sessions, handleNewSession, closeSession, setActiveSession, clearTerminal, workspaces, activeWorkspaceId, setActiveWorkspace]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#000000',
      }}
    >
      <TitleBar />

      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>
          {showChangelog ? (
            <WhatsNewPanel />
          ) : workspaceEmpty ? (
            <OnboardingScreen
              onNewSession={handleNewSession}
              onAdoptTerminals={handleAdoptTerminals}
            />
          ) : planViewSessionId && planViewPath ? (
            <PlanReviewPanel
              sessionId={planViewSessionId}
              planPath={planViewPath}
            />
          ) : activeSessionId ? (
            <MainTerminal
              key={activeSessionId}
              sessionId={activeSessionId}
              onDimensions={handleDimensions}
            />
          ) : null}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onResizeStart}
          style={{
            width: 5,
            cursor: 'col-resize',
            background: 'transparent',
            flexShrink: 0,
            position: 'relative',
            zIndex: 10,
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 2,
            width: 1,
            background: '#313244',
            transition: 'background 0.15s',
          }} />
        </div>

        <div
          ref={sidebarRef}
          style={{
            width: sidebarWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#181825',
            overflow: 'hidden',
          }}
        >
          <WorkspaceDots />
          <WorkspaceContainer sidebarWidth={sidebarWidth} onClose={closeSession} sidebarRef={sidebarRef} />
          <SessionControls onNewSession={handleNewSession} onAdoptTerminals={handleAdoptTerminals} />
        </div>
      </div>

      {showWorktreePrompt && (
        <WorktreePrompt
          onSubmit={handleCreateWorktree}
          onCancel={() => { setShowWorktreePrompt(false); setWorktreeLoading(false); }}
          error={worktreeError}
          loading={worktreeLoading}
        />
      )}
    </div>
  );
}
