/**
 * How the game reaches a player's server. Servers speak plain ws:// (no certificate, like a
 * Minecraft server), which a secure page may not open itself. In a browser on http (the dev server,
 * a self-hosted copy) the page uses WebSocket directly; the desktop app relays through its main
 * process (desktop/electron/main.cjs) and the Android app through NetRelay.java. Only ws://host:port
 * and http://host:port/status can go through the relays.
 */

export interface Transport {
  send(text: string): void;
  close(): void;
  onopen: () => void;
  onmessage: (text: string) => void;
  onerror: () => void;
  onclose: () => void;
  readonly isOpen: boolean;
}

interface AppNet {
  open(url: string): Promise<number>;
  send(id: number, text: string): void;
  close(id: number): void;
  status(url: string): Promise<unknown>;
  onEvent(fn: (id: number, type: string, data?: string) => void): void;
}

interface AndroidNet {
  netOpen(url: string): number;
  netSend(id: number, text: string): boolean;
  netClose(id: number): void;
  netStatus(url: string): number;
  netPoll(): string;
}

const appNet = (window as unknown as { flysimApp?: { net?: AppNet } }).flysimApp?.net;
const androidNet = (() => {
  const b = (window as unknown as { FlySimAndroid?: Partial<AndroidNet> }).FlySimAndroid;
  return b && typeof b.netOpen === 'function' ? (b as AndroidNet) : null;
})();

const noop = () => {};

class BaseTransport implements Transport {
  onopen = noop;
  onmessage: (text: string) => void = noop;
  onerror = noop;
  onclose = noop;
  isOpen = false;
  send(_text: string): void {}
  close(): void {}
  /** Relays call these with their events. */
  event(type: string, data?: string): void {
    if (type === 'open') {
      this.isOpen = true;
      this.onopen();
    } else if (type === 'message') this.onmessage(data ?? '');
    else if (type === 'error') this.onerror();
    else if (type === 'close') {
      this.isOpen = false;
      this.onclose();
    }
  }
}

class BrowserTransport extends BaseTransport {
  private ws: WebSocket;
  constructor(url: string) {
    super();
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.event('open');
    this.ws.onmessage = (e) => this.event('message', String(e.data));
    this.ws.onerror = () => this.event('error');
    this.ws.onclose = () => this.event('close');
  }
  send(text: string): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(text);
  }
  close(): void {
    this.ws.onclose = null;
    this.isOpen = false;
    this.ws.close();
  }
}

// ---------------------------------------------------------------- desktop app relay

const appSockets = new Map<number, AppTransport>();
if (appNet) appNet.onEvent((id, type, data) => appSockets.get(id)?.event(type, data));

class AppTransport extends BaseTransport {
  private id = 0;
  private closed = false;
  constructor(url: string) {
    super();
    appNet!.open(url).then(
      (id) => {
        this.id = id;
        if (this.closed) appNet!.close(id);
        else appSockets.set(id, this);
      },
      () => this.event('error'),
    );
  }
  send(text: string): void {
    if (this.id && this.isOpen) appNet!.send(this.id, text);
  }
  close(): void {
    this.closed = true;
    this.isOpen = false;
    if (this.id) {
      appSockets.delete(this.id);
      appNet!.close(this.id);
    }
  }
}

// ---------------------------------------------------------------- Android relay (polled)

const androidWaiters = new Map<number, (type: string, data?: string) => void>();
let pollTimer = 0;

function androidPoll(): void {
  for (const e of JSON.parse(androidNet!.netPoll()) as { id: number; type: string; data?: string }[]) androidWaiters.get(e.id)?.(e.type, e.data);
  if (!androidWaiters.size) {
    clearInterval(pollTimer);
    pollTimer = 0;
  }
}

function androidListen(id: number, fn: (type: string, data?: string) => void): void {
  androidWaiters.set(id, fn);
  if (!pollTimer) pollTimer = window.setInterval(androidPoll, 8);
}

class AndroidTransport extends BaseTransport {
  private readonly id: number;
  constructor(url: string) {
    super();
    this.id = androidNet!.netOpen(url);
    if (!this.id) {
      setTimeout(() => this.event('error'), 0);
      return;
    }
    androidListen(this.id, (type, data) => {
      if (type === 'close') androidWaiters.delete(this.id);
      this.event(type, data);
    });
  }
  send(text: string): void {
    if (this.isOpen) androidNet!.netSend(this.id, text);
  }
  close(): void {
    this.isOpen = false;
    androidWaiters.delete(this.id);
    if (this.id) androidNet!.netClose(this.id);
  }
}

/** Opens ws://host:port the best way this platform allows. */
export function openTransport(url: string): Transport {
  if (appNet) return new AppTransport(url);
  if (androidNet) return new AndroidTransport(url);
  return new BrowserTransport(url);
}

/** GET http://host:port/status (JSON). */
export async function fetchStatus(url: string, timeoutMs = 4000): Promise<unknown> {
  if (appNet) return appNet.status(url);
  if (androidNet) {
    const id = androidNet.netStatus(url);
    if (!id) throw new Error('Not an address');
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        androidWaiters.delete(id);
        reject(new Error('timeout'));
      }, timeoutMs + 500);
      androidListen(id, (type, data) => {
        clearTimeout(t);
        androidWaiters.delete(id);
        if (type === 'status') {
          try {
            resolve(JSON.parse(data ?? ''));
          } catch (e) {
            reject(e);
          }
        } else reject(new Error(data || 'failed'));
      });
    });
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
