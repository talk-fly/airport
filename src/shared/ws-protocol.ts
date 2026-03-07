export interface ClientMessage {
  type: string;
  id?: string;
  args: unknown[];
}

export interface ServerMessage {
  type: string;
  id?: string;
  data?: unknown;
  error?: string;
}
