/**
 * Talks to an FPV Sim server (Servers-Website/server/flysim-server.mjs) over a WebSocket.
 * The protocol is small JSON messages; drone states go up and come back for everyone at the
 * server's state rate (20 per second by default).
 */
import { fetchStatus, openTransport, type Transport } from './transport';

export const PROTOCOL = 1;
export const DEFAULT_PORT = 25580;

export interface ServerSettings {
  name: string;
  motd: string;
  collision: boolean;
  show: boolean;
  names: boolean;
  teleport: boolean;
  recording: boolean;
  /** Players may use game plugins here (older servers: not sent = allowed). */
  plugins?: boolean;
  /** Only these plugin ids (empty = any). */
  allowedPlugins?: string[];
  maxDrones: number;
  rate: number;
}

export interface NetPlayer {
  id: number;
  name: string;
  drone: string;
  owner: boolean;
  ping: number;
  /** Pilot Level from the Flight Path (0 = no account / older server). */
  level?: number;
}

/** One player's drone as the server relays it. */
export interface NetState {
  id: number;
  /** Position and rotation (three.js world). */
  p: [number, number, number];
  q: [number, number, number, number];
  /** Average motor speed (rad/s), for the props. */
  w: number;
  a: boolean;
  c: boolean;
  d: string;
  /** Skin id. */
  s?: string;
}

export type Phase = 'lobby' | 'voting' | 'playing';

export type ServerMessage =
  | { t: 'welcome'; id: number; version: string; settings: ServerSettings; owner: boolean; maps: string[] }
  | { t: 'refused'; reason: string }
  | { t: 'kicked'; reason: string }
  | { t: 'players'; list: NetPlayer[] }
  | { t: 'phase'; phase: Phase; map: string | null; maps?: string[]; votes?: Record<string, number>; left?: number }
  | { t: 'votes'; votes: Record<string, number>; left: number }
  | { t: 'states'; s: NetState[] }
  | { t: 'tp'; p: [number, number, number]; name: string }
  | { t: 'msg'; text: string; kind: '' | 'warn' | 'bad' }
  | { t: 'chat'; from: string; text: string }
  | { t: 'joined'; id: number; name: string }
  | { t: 'left'; id: number; name: string }
  | { t: 'settings'; settings: ServerSettings; owner: boolean }
  | { t: 'owner'; owner: boolean }
  | { t: 'pong'; id: number };

/** "host", "host:port", "ws://host:port" or "http://host:port" -> host and port. */
export function parseAddress(input: string): { host: string; port: number } | null {
  let s = input.trim().replace(/^(wss?|https?|tcp):\/\//i, '').replace(/\/.*$/, '');
  if (!s) return null;
  let port = DEFAULT_PORT;
  const v6 = s.match(/^\[(.+)\](?::(\d+))?$/);
  if (v6) {
    s = `[${v6[1]}]`;
    if (v6[2]) port = Number(v6[2]);
  } else {
    const m = s.match(/^(.*):(\d+)$/);
    if (m) {
      s = m[1];
      port = Number(m[2]);
    }
  }
  if (!s || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: s, port };
}

export interface ServerStatus {
  name: string;
  motd: string;
  players: number;
  maxDrones: number;
  phase: Phase;
  map: string | null;
  password: boolean;
  protocol: number;
  version: string;
}

/** Asks a server for its name and player count (the page at http://host:port/status). */
export async function queryStatus(address: string, timeoutMs = 4000): Promise<ServerStatus> {
  const a = parseAddress(address);
  if (!a) throw new Error('Not an address');
  const j = (await fetchStatus(`http://${a.host}:${a.port}/status`, timeoutMs)) as ServerStatus & { game?: string };
  if (j?.game !== 'flysim') throw new Error('Not an FPV Sim server');
  return j;
}

export class NetClient {
  private ws: Transport | null = null;
  private pingTimer = 0;
  private pingSent = new Map<number, number>();
  private pingId = 0;
  rtt = 0;
  id = 0;
  onMessage: (m: ServerMessage) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private closeReason = '';

  get connected(): boolean {
    return !!this.ws?.isOpen;
  }

  /** Connects and says hello; resolves with the welcome, rejects with the reason it failed. */
  connect(address: string, name: string, drone: string, password = '', extra: Record<string, unknown> = {}): Promise<Extract<ServerMessage, { t: 'welcome' }>> {
    const a = parseAddress(address);
    if (!a) return Promise.reject(new Error('That is not a server address (host or host:port).'));
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (why: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(why));
      };
      let ws: Transport;
      try {
        ws = openTransport(`ws://${a.host}:${a.port}`);
      } catch (e) {
        fail((e as Error).message);
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        fail('No answer from the server (is it running? is the address and port right?).');
        ws.close();
      }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ ...extra, t: 'hello', name, drone, password, protocol: PROTOCOL }));
      ws.onmessage = (text) => {
        let m: ServerMessage;
        try {
          m = JSON.parse(text);
        } catch {
          return;
        }
        if (!settled) {
          if (m.t === 'welcome') {
            settled = true;
            clearTimeout(timer);
            this.id = m.id;
            this.startPing();
            resolve(m);
          } else if (m.t === 'refused') {
            clearTimeout(timer);
            fail(m.reason);
          }
          // Messages right after the welcome (phase, players) still go to onMessage.
        }
        if (m.t === 'kicked' || m.t === 'refused') this.closeReason = m.reason;
        if (m.t === 'pong') {
          const sent = this.pingSent.get(m.id);
          if (sent) this.rtt = performance.now() - sent;
          this.pingSent.delete(m.id);
          return;
        }
        if (settled) this.onMessage(m);
      };
      ws.onerror = () => fail('Could not connect to the server.');
      ws.onclose = () => {
        clearTimeout(timer);
        clearInterval(this.pingTimer);
        fail('The server closed the connection.');
        if (this.ws === ws) {
          this.ws = null;
          this.onClose(this.closeReason || 'Disconnected from the server.');
        }
      };
    });
  }

  send(obj: object): void {
    if (this.ws?.isOpen) this.ws.send(JSON.stringify(obj));
  }

  private startPing(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      const id = ++this.pingId;
      this.pingSent.set(id, performance.now());
      this.send({ t: 'ping', id, rtt: this.rtt });
    }, 2000);
  }

  close(): void {
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    this.closeReason = '';
    if (ws) {
      ws.onclose = () => {};
      ws.close();
    }
  }
}
