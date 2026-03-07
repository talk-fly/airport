import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/ws-protocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => unknown | Promise<unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

export class WsServer {
  private wss: WebSocketServer | null = null;
  private handlers = new Map<string, Handler>();
  private listeners = new Map<string, Listener>();
  private clients = new Set<WebSocket>();
  private port = 0;

  handle(channel: string, fn: Handler): void {
    this.handlers.set(channel, fn);
  }

  on(channel: string, fn: Listener): void {
    this.listeners.set(channel, fn);
  }

  broadcast(channel: string, data?: unknown): void {
    const msg: ServerMessage = { type: channel, data };
    const raw = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  getPort(): number {
    return this.port;
  }

  start(httpServer?: http.Server): Promise<void> {
    if (httpServer) {
      this.wss = new WebSocketServer({ server: httpServer });
      const addr = httpServer.address();
      if (typeof addr === 'object' && addr) {
        this.port = addr.port;
      }
      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        ws.on('close', () => this.clients.delete(ws));
        ws.on('message', (raw) => this.onMessage(ws, raw.toString()));
      });
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });

      this.wss.on('listening', () => {
        const addr = this.wss!.address();
        if (typeof addr === 'object' && addr) {
          this.port = addr.port;
        }
        resolve();
      });

      this.wss.on('error', reject);

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        ws.on('close', () => this.clients.delete(ws));
        ws.on('message', (raw) => this.onMessage(ws, raw.toString()));
      });
    });
  }

  close(): void {
    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }

  private async onMessage(ws: WebSocket, raw: string) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.id) {
      // Request-reply
      const handler = this.handlers.get(msg.type);
      if (!handler) {
        const reply: ServerMessage = { type: '__reply', id: msg.id, error: `No handler for ${msg.type}` };
        ws.send(JSON.stringify(reply));
        return;
      }
      try {
        const data = await handler(...msg.args);
        const reply: ServerMessage = { type: '__reply', id: msg.id, data };
        ws.send(JSON.stringify(reply));
      } catch (err) {
        const reply: ServerMessage = { type: '__reply', id: msg.id, error: String(err) };
        ws.send(JSON.stringify(reply));
      }
    } else {
      // Fire-and-forget
      const listener = this.listeners.get(msg.type);
      if (listener) {
        listener(...msg.args);
      }
    }
  }
}
