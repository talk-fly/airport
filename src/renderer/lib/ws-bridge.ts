import type { ClientMessage, ServerMessage } from '../../shared/ws-protocol';
import type { AirportApi, PtyCreateOptions, PtyDataEvent, PtyExitEvent, HookStatusEvent, HookSessionEvent, HookPlanEvent, SpawnRequestEvent, SessionInfo, SavedState, ExternalTerminal, PlanFile, WorktreeCreateRequest, WorktreeCreateResult, UpdateCheckResult } from '../../shared/types';
import { IPC } from '../../shared/ipc-channels';

let ws: WebSocket;
let wsPort = 0;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempts = 0;
const MAX_BACKOFF = 10_000;

const pending = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
const listeners = new Map<string, Set<(data: unknown) => void>>();

function rejectAllPending() {
  for (const [, p] of pending) {
    p.reject(new Error('WebSocket connection lost'));
  }
  pending.clear();
}

function reconnect() {
  if (reconnectTimer) return;
  connected = false;
  rejectAllPending();

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      ws.onopen = () => {
        connected = true;
        reconnectAttempts = 0;
      };
      ws.onclose = () => {
        connected = false;
        reconnect();
      };
      ws.onerror = () => {
        // onclose will fire after onerror, which triggers reconnect
      };
      ws.onmessage = onMessage;
    } catch {
      reconnect();
    }
  }, delay);
}

function send(type: string, args: unknown[]): void {
  if (!connected || ws.readyState !== WebSocket.OPEN) return;
  const msg: ClientMessage = { type, args };
  ws.send(JSON.stringify(msg));
}

function invoke(type: string, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!connected || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }
    const id = crypto.randomUUID();
    pending.set(id, { resolve, reject });
    const msg: ClientMessage = { type, id, args };
    ws.send(JSON.stringify(msg));
  });
}

function on(channel: string, callback: (data: unknown) => void): () => void {
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set());
  }
  listeners.get(channel)!.add(callback);
  return () => {
    listeners.get(channel)?.delete(callback);
  };
}

function onMessage(event: MessageEvent) {
  let msg: ServerMessage;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  if (msg.type === '__reply' && msg.id) {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      if (msg.error) {
        p.reject(new Error(msg.error));
      } else {
        p.resolve(msg.data);
      }
    }
  } else {
    const cbs = listeners.get(msg.type);
    if (cbs) {
      for (const cb of cbs) {
        cb(msg.data);
      }
    }
  }
}

export function connect(port: number): Promise<void> {
  wsPort = port;
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.onopen = () => {
      connected = true;
      reconnectAttempts = 0;
      resolve();
    };
    ws.onerror = (e) => reject(e);
    ws.onclose = () => {
      connected = false;
      reconnect();
    };
    ws.onmessage = onMessage;
  });
}

// Proactively check connection health when page becomes visible (after sleep/wake)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wsPort > 0) {
      if (!connected || ws.readyState !== WebSocket.OPEN) {
        reconnectAttempts = 0; // reset backoff for immediate retry on wake
        reconnect();
      }
    }
  });
}

export function createAirportApi(): AirportApi {
  return {
    pty: {
      create: (options: PtyCreateOptions) =>
        invoke(IPC.PTY_CREATE, options) as Promise<string>,

      write: (sessionId: string, data: string) =>
        send(IPC.PTY_WRITE, [sessionId, data]),

      resize: (sessionId: string, cols: number, rows: number) =>
        send(IPC.PTY_RESIZE, [sessionId, cols, rows]),

      close: (sessionId: string) =>
        send(IPC.PTY_CLOSE, [sessionId]),

      getProcessName: (sessionId: string) =>
        invoke(IPC.PTY_GET_PROCESS_NAME, sessionId) as Promise<string>,

      onData: (callback: (event: PtyDataEvent) => void) =>
        on(IPC.PTY_DATA, callback as (data: unknown) => void),

      onExit: (callback: (event: PtyExitEvent) => void) =>
        on(IPC.PTY_EXIT, callback as (data: unknown) => void),
    },
    getSessionInfo: (sessionId: string) =>
      invoke(IPC.GET_SESSION_INFO, sessionId) as Promise<SessionInfo>,
    saveState: (state: SavedState) =>
      invoke(IPC.STATE_SAVE, state) as Promise<void>,
    loadState: () =>
      invoke(IPC.STATE_LOAD) as Promise<SavedState | null>,
    onRequestSave: (callback: () => void) =>
      on(IPC.STATE_REQUEST_SAVE, callback),
    discoverTerminals: () =>
      invoke(IPC.DISCOVER_TERMINALS) as Promise<ExternalTerminal[]>,
    pickFolder: () =>
      invoke(IPC.PICK_FOLDER) as Promise<string | null>,
    getPlanFiles: (cwd: string) =>
      invoke(IPC.PLAN_GET_FILES, cwd) as Promise<PlanFile[]>,
    readPlanFile: (filePath: string) =>
      invoke(IPC.PLAN_READ_FILE, filePath) as Promise<string>,
    onHookStatus: (callback: (event: HookStatusEvent) => void) =>
      on(IPC.HOOK_STATUS, callback as (data: unknown) => void),
    onHookSession: (callback: (event: HookSessionEvent) => void) =>
      on(IPC.HOOK_SESSION, callback as (data: unknown) => void),
    onHookPlan: (callback: (event: HookPlanEvent) => void) =>
      on(IPC.HOOK_PLAN, callback as (data: unknown) => void),
    onSpawnRequest: (callback: (event: SpawnRequestEvent) => void) =>
      on(IPC.SPAWN_REQUEST, callback as (data: unknown) => void),
    readChangelog: () =>
      invoke(IPC.CHANGELOG_READ) as Promise<string>,
    onMenuWhatsNew: (callback: () => void) =>
      on('menu:whats-new', callback as (data: unknown) => void),
    onMenuNewWorktree: (callback: () => void) =>
      on('menu:new-worktree', callback as (data: unknown) => void),
    createWorktree: (request: WorktreeCreateRequest) =>
      invoke(IPC.WORKTREE_CREATE, request) as Promise<WorktreeCreateResult>,
    checkForUpdates: () =>
      invoke(IPC.UPDATE_CHECK) as Promise<UpdateCheckResult>,
    installUpdate: (downloadUrl: string) =>
      invoke(IPC.UPDATE_INSTALL, downloadUrl) as Promise<void>,
    onMenuCheckUpdates: (callback: () => void) =>
      on('menu:check-updates', callback as (data: unknown) => void),
  };
}
