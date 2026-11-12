import * as THREE from 'three';
import type { Object3D, Scene } from 'three';
import { PHYSICS_MODS } from '../physics/quad';

/**
 * Plugins: JavaScript modules the player adds in the Plugins tab. Each one gets an `api` object
 * (events, the drone, physics, sticks, the 3D world, camera, on-screen UI, keys and controller
 * buttons, sound, storage, multiplayer) plus the raw game for anything the API doesn't cover.
 * Everything a plugin adds through the API is undone when it is switched off.
 * Docs: Game-Website/plugins.html.
 */

export const API_VERSION = 2;
const KEY = 'flysim.plugins';
const BINDS_KEY = 'flysim.pluginKeys';

/** A shortcut a plugin declares in info.keys; the player can change it in Settings. */
export interface KeyDecl {
  /** Shown in Settings. */
  name: string;
  /** Default keyboard key (KeyboardEvent.code, e.g. 'KeyG'), or '' for none. */
  key?: string;
  /** Default controller button number (0 = A / Cross…), if any. */
  pad?: number;
}

/** What the player chose for a shortcut (undefined field = the plugin's default). */
interface Binding {
  key?: string;
  pad?: number | null;
}

export interface StoredPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  code: string;
  enabled: boolean;
  /** Shortcuts from info.keys (filled when the plugin first runs). */
  keys?: Record<string, KeyDecl>;
}

export interface PluginInfo {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  /** Lowest API version the plugin needs. */
  api?: number;
  keys?: Record<string, KeyDecl>;
}

export type EventName =
  | 'frame'
  | 'flightStart'
  | 'flightEnd'
  | 'crash'
  | 'reset'
  | 'trick'
  | 'chat'
  | 'pause'
  | 'resume'
  | 'tab'
  | 'arm'
  | 'disarm'
  | 'join'
  | 'leave'
  | 'playerJoin'
  | 'playerLeave';

export interface Sticks {
  throttle: number;
  yaw: number;
  pitch: number;
  roll: number;
}

/** What the game hands the host: live objects and a few actions. */
export interface GameLink {
  raw: unknown;
  state(): string;
  settings: object;
  scene(): Scene;
  world(): { def: { id: string; name: string }; spawn: THREE.Vector3; collision: { groundDistance(p: THREE.Vector3, max?: number): number } } | null;
  quad(): { pos: THREE.Vector3; vel: THREE.Vector3; quat: THREE.Quaternion; omega: THREE.Vector3; battery: { voltage: number; soc: number; usedMah: number } } | undefined;
  spec(): object | undefined;
  fc(): { armed: boolean; mode: string; arm(): void; disarm(): void } | undefined;
  crashed(): boolean;
  multiplayer(): boolean;
  respawn(): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  camera(): { camera: THREE.PerspectiveCamera; mode: string; fovDeg: number; uptiltDeg: number; applyFov(): void; cycle(): string };
  sticks(): Sticks;
  pads(): Gamepad[];
  players(): { id: number; name: string; drone: string; level?: number; ping: number }[];
  others(): Iterable<[number, THREE.Vector3, string]>;
  myId(): number;
  osdMessage(text: string, kind?: string, secs?: number): void;
  popup(html: string, kind?: string): void;
  notice(text: string): void;
  say(text: string): void;
  connected(): boolean;
  showTab(id: string): void;
  rerenderSettings(): void;
}

type Handler = (data: any) => void;
type When = 'flying' | 'menu' | 'paused' | 'always';

/** One running plugin and everything it added (so switching it off removes it all). */
interface Running {
  stored: StoredPlugin;
  handlers: Map<EventName, Set<Handler>>;
  cleanups: (() => void)[];
  settingsSections: { title: string; render: (el: HTMLElement) => void }[];
  stickMods: Set<(s: Sticks) => void>;
  physics: Partial<typeof PHYSICS_MODS>;
  timeScale: number;
  errors: number;
}

const $ = (id: string) => document.getElementById(id)!;

/** Stands in for the drone before the first flight, so reading it never throws. */
const IDLE_FC = { armed: false, mode: 'acro', arm() {}, disarm() {} };
const IDLE_QUAD = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), omega: new THREE.Vector3(), battery: { voltage: 0, soc: 1, usedMah: 0 } };

function makeEl<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class' || k === 'className') e.className = String(v);
    else if (k in e) (e as any)[k] = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of children) e.append(c);
  return e;
}

/** The text of `export const info = { … }` (braces matched, strings skipped). */
function infoSource(code: string): string | null {
  const m = /export\s+const\s+info\s*=\s*\{/.exec(code);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let quote = '';
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return code.slice(start, i + 1);
  }
  return null;
}

/** Reads `export const info = {...}` (for the list, before the plugin runs). */
export function readInfo(code: string, fallbackName: string): PluginInfo {
  const src = infoSource(code);
  let info: PluginInfo = { id: '' };
  if (src) {
    try {
      // A plain object literal; the plugin itself runs right after anyway.
      info = { ...(new Function(`return (${src});`)() as PluginInfo) };
    } catch {
      for (const key of ['id', 'name', 'version', 'description', 'author'] as const) {
        const v = src.match(new RegExp(`${key}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`));
        if (v) info[key] = v[2];
      }
    }
  }
  const base = fallbackName.replace(/\.(m?js)$/i, '');
  info.id = String(info.id || base).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 40) || `plugin-${Date.now()}`;
  info.name ??= base;
  return info;
}

/** "KeyG" -> "G", "Digit1" -> "1", "ArrowUp" -> "↑". */
export function keyLabel(code: string | undefined): string {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' } as Record<string, string>)[code] ?? code;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L stick', 'R stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];
export const padLabel = (i: number) => `🎮 ${PAD_NAMES[i] ?? `Button ${i + 1}`}`;

/** Keys the game itself uses (a plugin shortcut on one of these does both). */
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyX', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'KeyP', 'KeyR', 'KeyC', 'KeyN', 'KeyM', 'KeyV', 'KeyT']);

export class PluginHost {
  private stored: StoredPlugin[] = [];
  private readonly running = new Map<string, Running>();
  /** Last error per plugin id (shown in the Plugins tab). */
  readonly errors = new Map<string, string>();
  private readonly hud: HTMLElement;
  private readonly binds = new Set<{ plugin: string; action: string | null; code: string; pad: number | null; fn: (e?: KeyboardEvent) => void; when: When }>();
  private bindings: Record<string, Record<string, Binding>> = {};
  private readonly held = new Set<string>();
  private padPrev: boolean[] = [];
  /** Set while Settings waits for a key or button to assign. */
  private capture: ((b: { key?: string; pad?: number } | null) => void) | null = null;
  private lastArmed = false;
  private policy: { allow: boolean; ids: string[] } | null = null;
  /** Plugins on but paused because the server doesn't allow them. */
  readonly blocked = new Set<string>();
  /** Game speed (1 = real time); the product of every plugin's api.time.scale. */
  timeScale = 1;
  private audio: AudioContext | null = null;
  onChange: () => void = () => {};

  constructor(private readonly game: GameLink) {
    this.hud = document.createElement('div');
    this.hud.id = 'plugin-hud';
    document.body.appendChild(this.hud);
    try {
      this.stored = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      this.bindings = JSON.parse(localStorage.getItem(BINDS_KEY) ?? '{}');
    } catch {
      this.stored = [];
    }
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.capture) {
          // Assigning a shortcut in Settings: this key is the answer, not a game command.
          e.preventDefault();
          e.stopImmediatePropagation();
          this.capture(e.code === 'Escape' ? null : e.code === 'Backspace' || e.code === 'Delete' ? { key: '' } : { key: e.code });
          return;
        }
        this.held.add(e.code);
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        // A plugin's key (F5, PageUp…) must not also reload or scroll the page.
        if (this.hasBind(e.code)) e.preventDefault();
        if (!e.repeat) this.fire((b) => b.code === e.code, e);
      },
      true,
    );
    window.addEventListener('keyup', (e) => this.held.delete(e.code), true);
    window.addEventListener('blur', () => this.held.clear());
  }

  get list(): readonly StoredPlugin[] {
    return this.stored;
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.stored));
    } catch (err) {
      this.game.notice(`Could not save plugins: ${(err as Error).message}`);
    }
  }

  private hasBind(code: string): boolean {
    for (const b of this.binds) if (b.code === code) return true;
    return false;
  }

  private fire(match: (b: { code: string; pad: number | null }) => boolean, e?: KeyboardEvent): void {
    const state = this.game.state();
    for (const b of [...this.binds]) {
      if (!match(b)) continue;
      if (b.when === 'always' || b.when === state || (b.when === 'flying' && state === 'flying')) this.safe(b.plugin, () => b.fn(e), this.running.get(b.plugin));
    }
  }

  /** Starts every enabled plugin (once, at startup). */
  async startAll(): Promise<void> {
    for (const p of this.stored) if (p.enabled) await this.start(p);
    this.onChange();
  }

  /** Adds (or replaces, same id) a plugin from its source. Returns its id. */
  async add(code: string, fileName: string): Promise<string> {
    const info = readInfo(code, fileName);
    const old = this.stored.find((p) => p.id === info.id);
    if (old) this.stop(old.id);
    const p: StoredPlugin = {
      id: info.id,
      name: info.name ?? info.id,
      version: info.version ?? '',
      description: info.description ?? '',
      author: info.author ?? '',
      code,
      enabled: true,
      keys: info.keys,
    };
    this.stored = old ? this.stored.map((s) => (s.id === p.id ? p : s)) : [...this.stored, p];
    this.save();
    await this.start(p);
    this.onChange();
    return p.id;
  }

  remove(id: string): void {
    this.stop(id);
    this.stored = this.stored.filter((p) => p.id !== id);
    this.errors.delete(id);
    this.blocked.delete(id);
    delete this.bindings[id];
    this.saveBindings();
    this.save();
    this.onChange();
  }

  async setEnabled(id: string, on: boolean): Promise<void> {
    const p = this.stored.find((s) => s.id === id);
    if (!p) return;
    p.enabled = on;
    this.save();
    if (on) await this.start(p);
    else {
      this.stop(id);
      this.blocked.delete(id);
    }
    this.onChange();
  }

  /** Stops and starts every enabled plugin again. */
  async reloadAll(): Promise<void> {
    for (const id of [...this.running.keys()]) this.stop(id);
    await this.startAll();
  }

  // ------------------------------------------------------------------ server policy

  private allowedHere(id: string): boolean {
    const p = this.policy;
    if (!p) return true;
    return p.allow && (p.ids.length === 0 || p.ids.includes(id));
  }

  /** What the server we're on allows (null = not on a server: everything). */
  async setPolicy(policy: { allow: boolean; ids: string[] } | null): Promise<void> {
    const same = JSON.stringify(policy) === JSON.stringify(this.policy);
    this.policy = policy;
    if (same) return;
    const paused: string[] = [];
    for (const id of [...this.running.keys()]) {
      if (this.allowedHere(id)) continue;
      this.stop(id);
      this.blocked.add(id);
      paused.push(this.stored.find((s) => s.id === id)?.name ?? id);
    }
    for (const id of [...this.blocked]) {
      const p = this.stored.find((s) => s.id === id);
      if (!p?.enabled || !this.allowedHere(id)) continue;
      this.blocked.delete(id);
      await this.start(p);
    }
    if (paused.length) this.game.notice(`This server ${policy?.allow ? 'only allows some plugins' : "doesn't allow plugins"}. Paused while you're here: ${paused.join(', ')}.`);
    this.onChange();
  }

  // ------------------------------------------------------------------ events

  /** Tells every plugin about something that happened in the game. */
  emit(event: EventName, data?: unknown): void {
    for (const r of this.running.values()) {
      const set = r.handlers.get(event);
      if (!set) continue;
      for (const fn of set) this.safe(r.stored.id, () => fn(data), r);
    }
  }

  /** Once per frame, before the 'frame' event: controller buttons, arm / disarm. */
  tick(state: string): void {
    const pads = this.game.pads();
    const now: boolean[] = [];
    for (const g of pads) g.buttons.forEach((b, i) => (now[i] ||= b.pressed || b.value > 0.6));
    if (this.capture) {
      const i = now.findIndex((on, k) => on && !this.padPrev[k]);
      if (i >= 0) this.capture({ pad: i });
    } else {
      for (let i = 0; i < now.length; i++) if (now[i] && !this.padPrev[i]) this.fire((b) => b.pad === i);
    }
    this.padPrev = now;
    if (state === 'flying') {
      const armed = !!this.game.fc()?.armed;
      if (armed !== this.lastArmed) this.emit(armed ? 'arm' : 'disarm');
      this.lastArmed = armed;
    }
  }

  /** Lets plugins change the sticks before the flight controller reads them. */
  modifySticks(s: Sticks): void {
    for (const r of this.running.values()) for (const fn of r.stickMods) this.safe(r.stored.id, () => fn(s), r);
    s.throttle = Math.min(1, Math.max(0, s.throttle));
    s.yaw = Math.min(1, Math.max(-1, s.yaw));
    s.pitch = Math.min(1, Math.max(-1, s.pitch));
    s.roll = Math.min(1, Math.max(-1, s.roll));
  }

  /** Combines every running plugin's physics and time changes. */
  private applyMods(): void {
    const keys = Object.keys(PHYSICS_MODS) as (keyof typeof PHYSICS_MODS)[];
    for (const k of keys) PHYSICS_MODS[k] = 1;
    let time = 1;
    for (const r of this.running.values()) {
      for (const k of keys) if (r.physics[k] !== undefined) PHYSICS_MODS[k] *= r.physics[k]!;
      time *= r.timeScale;
    }
    this.timeScale = Math.min(4, Math.max(0.05, time));
  }

  // ------------------------------------------------------------------ shortcuts

  private saveBindings(): void {
    try {
      localStorage.setItem(BINDS_KEY, JSON.stringify(this.bindings));
    } catch {
      /* full or blocked */
    }
  }

  /** The key and button a declared shortcut uses now (the player's choice, else the default). */
  private resolve(pluginId: string, action: string): { code: string; pad: number | null } {
    const decl = this.stored.find((s) => s.id === pluginId)?.keys?.[action];
    const b = this.bindings[pluginId]?.[action];
    return {
      code: b?.key !== undefined ? b.key : decl?.key ?? '',
      pad: b?.pad !== undefined ? b.pad : decl?.pad ?? null,
    };
  }

  private rebindAll(pluginId: string): void {
    for (const b of this.binds) {
      if (b.plugin !== pluginId || !b.action) continue;
      const r = this.resolve(pluginId, b.action);
      b.code = r.code;
      b.pad = r.pad;
    }
  }

  // ------------------------------------------------------------------ settings

  /** Plugin shortcuts and plugin settings sections, at the end of Settings. */
  renderSettings(container: HTMLElement): void {
    const withKeys = this.stored.filter((p) => p.keys && Object.keys(p.keys).length && this.running.has(p.id));
    if (withKeys.length) {
      const block = makeEl('div', { class: 'block plugin-block' }, [
        makeEl('h3', { textContent: 'Plugin shortcuts' }),
        makeEl('p', { textContent: 'Click a key box, then press a key or a controller button. Backspace clears it, Esc cancels.' }),
      ]);
      for (const p of withKeys) {
        for (const [action, decl] of Object.entries(p.keys!)) {
          const cur = this.resolve(p.id, action);
          const box = makeEl('button', { class: 'keybox' });
          const draw = () => {
            const c = this.resolve(p.id, action);
            const parts = [keyLabel(c.code), c.pad !== null ? padLabel(c.pad) : ''].filter(Boolean);
            box.textContent = parts.join('  +  ') || 'none';
            box.classList.toggle('clash', GAME_KEYS.has(c.code));
            box.title = GAME_KEYS.has(c.code) ? 'The game also uses this key' : '';
          };
          draw();
          box.addEventListener('click', () => {
            box.textContent = 'Press a key or button…';
            box.classList.add('waiting');
            this.capture = (got) => {
              this.capture = null;
              box.classList.remove('waiting');
              if (got) {
                const b = (this.bindings[p.id] ??= {})[action] ?? {};
                if (got.key !== undefined) b.key = got.key;
                if (got.pad !== undefined) b.pad = got.pad;
                if (got.key === '') b.pad = null;
                this.bindings[p.id][action] = b;
                this.saveBindings();
                this.rebindAll(p.id);
              }
              draw();
            };
          });
          const reset = makeEl('button', {
            textContent: 'Default',
            onclick: () => {
              delete this.bindings[p.id]?.[action];
              this.saveBindings();
              this.rebindAll(p.id);
              draw();
            },
          });
          void cur;
          block.append(makeEl('div', { class: 'field' }, [makeEl('label', { textContent: `${p.name}: ${decl.name}` }), makeEl('div', { class: 'keyrow' }, [box, reset]), makeEl('span')]));
        }
      }
      container.appendChild(block);
    }
    for (const r of this.running.values()) {
      for (const s of r.settingsSections) {
        const block = makeEl('div', { class: 'block plugin-block' }, [makeEl('h3', { textContent: s.title })]);
        container.appendChild(block);
        this.safe(r.stored.id, () => s.render(block), r);
      }
    }
  }

  // ------------------------------------------------------------------ running

  private safe(id: string, fn: () => void, r?: Running): void {
    try {
      fn();
    } catch (err) {
      console.error(`[plugin ${id}]`, err);
      if (r) {
        r.errors++;
        this.errors.set(id, String((err as Error)?.message ?? err));
        // A plugin that keeps throwing every frame is switched off so the game stays playable.
        if (r.errors >= 50) {
          this.stop(id);
          this.errors.set(id, `Stopped after repeated errors: ${(err as Error)?.message ?? err}`);
          this.game.notice(`Plugin "${r.stored.name}" kept failing and was stopped. See the Plugins tab.`);
          this.onChange();
        }
      }
    }
  }

  private async start(p: StoredPlugin): Promise<void> {
    if (this.running.has(p.id)) return;
    if (!this.allowedHere(p.id)) {
      this.blocked.add(p.id);
      return;
    }
    const r: Running = { stored: p, handlers: new Map(), cleanups: [], settingsSections: [], stickMods: new Set(), physics: {}, timeScale: 1, errors: 0 };
    this.errors.delete(p.id);
    const url = URL.createObjectURL(new Blob([p.code], { type: 'text/javascript' }));
    try {
      const mod = await import(/* @vite-ignore */ url);
      const info: PluginInfo | undefined = mod.info;
      if (info?.api && info.api > API_VERSION) throw new Error(`needs plugin API ${info.api}; this game has ${API_VERSION}. Update FPV Sim.`);
      if (info?.keys && JSON.stringify(info.keys) !== JSON.stringify(p.keys)) {
        p.keys = info.keys;
        this.save();
      }
      const setup = mod.default ?? mod.setup;
      if (typeof setup !== 'function') throw new Error('no "export default function (api) { ... }" found');
      this.running.set(p.id, r);
      const cleanup = await setup(this.makeApi(r));
      if (typeof cleanup === 'function') r.cleanups.push(cleanup);
      if (r.settingsSections.length || p.keys) this.game.rerenderSettings();
    } catch (err) {
      this.running.delete(p.id);
      this.undo(r);
      const msg = String((err as Error)?.message ?? err);
      this.errors.set(p.id, msg);
      console.error(`[plugin ${p.id}] failed to start:`, err);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private stop(id: string): void {
    const r = this.running.get(id);
    if (!r) return;
    this.running.delete(id);
    this.undo(r);
    this.applyMods();
    if (r.settingsSections.length || r.stored.keys) this.game.rerenderSettings();
  }

  private undo(r: Running): void {
    for (const c of r.cleanups.reverse()) {
      try {
        c();
      } catch (err) {
        console.error(`[plugin ${r.stored.id}] cleanup failed:`, err);
      }
    }
    r.cleanups = [];
    r.handlers.clear();
    r.stickMods.clear();
    r.physics = {};
    r.timeScale = 1;
  }

  // ------------------------------------------------------------------ the API

  private makeApi(r: Running) {
    const g0 = this.game;
    // Every drone read goes through quad(): before the first flight it's a still, idle stand-in.
    const g = { ...g0, quad: () => g0.quad() ?? IDLE_QUAD, fc: () => g0.fc() ?? IDLE_FC, spec: () => g0.spec() ?? {} } as Omit<GameLink, 'quad' | 'fc'> & { quad(): typeof IDLE_QUAD; fc(): typeof IDLE_FC };
    const host = this;
    const id = r.stored.id;
    const track = (fn: () => void) => r.cleanups.push(fn);
    const on = (event: EventName, fn: Handler) => {
      let set = r.handlers.get(event);
      if (!set) r.handlers.set(event, (set = new Set()));
      set.add(fn);
      return () => set!.delete(fn);
    };
    const storeKey = `flysim.plugin.${id}.`;
    const hud = this.hud;
    const physics = (key: keyof typeof PHYSICS_MODS) => ({
      get: () => r.physics[key] ?? 1,
      set: (v: number) => {
        r.physics[key] = Math.max(0, Number(v) || 0);
        host.applyMods();
      },
    });
    const prop = <T>(o: { get: () => T; set: (v: T) => void }) => ({ get: o.get, set: o.set, enumerable: true });

    const api = {
      version: API_VERSION,
      info: { id, name: r.stored.name, version: r.stored.version },
      THREE,
      log: (...args: unknown[]) => console.log(`[${id}]`, ...args),
      /** Run fn on a game event; returns a function that stops listening. */
      on,
      off: (event: EventName, fn: Handler) => void r.handlers.get(event)?.delete(fn),
      /** Called when the plugin is switched off or removed. */
      onUnload: (fn: () => void) => track(fn),
      /** Calls fn every `ms` milliseconds until the plugin stops. */
      every: (ms: number, fn: () => void) => {
        const t = window.setInterval(() => this.safe(id, fn, r), Math.max(16, ms));
        track(() => window.clearInterval(t));
        return () => window.clearInterval(t);
      },
      /** Calls fn once after `ms` milliseconds (cancelled if the plugin stops). */
      after: (ms: number, fn: () => void) => {
        const t = window.setTimeout(() => this.safe(id, fn, r), ms);
        track(() => window.clearTimeout(t));
        return () => window.clearTimeout(t);
      },

      game: {
        get state() {
          return g.state();
        },
        get multiplayer() {
          return g.multiplayer();
        },
        /** The player's settings (live: change a value, then call game.applySettings()). */
        get settings() {
          return g.settings;
        },
        applySettings: () => g.rerenderSettings(),
        /** The whole game object, for anything the API doesn't cover. Internals may change between versions. */
        get raw() {
          return g.raw;
        },
      },

      drone: {
        /** Live position / velocity / attitude / body rates (three.js objects: change them to move the drone). */
        get position() {
          return g.quad().pos;
        },
        get velocity() {
          return g.quad().vel;
        },
        get quaternion() {
          return g.quad().quat;
        },
        get rates() {
          return g.quad().omega;
        },
        get armed() {
          return g.fc().armed;
        },
        get mode() {
          return g.fc().mode;
        },
        set mode(m: string) {
          if (['acro', 'angle', 'horizon'].includes(m)) g.fc().mode = m;
        },
        get crashed() {
          return g.crashed();
        },
        /** The drone's spec (mass, motors, props, rates…). */
        get spec() {
          return g.spec();
        },
        get speed() {
          return g.quad().vel.length();
        },
        /** Height above the ground below (m). */
        get altitude() {
          const w = g.world();
          return w ? w.collision.groundDistance(g.quad().pos, 500) : Infinity;
        },
        get heading() {
          const f = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quad().quat);
          return Math.atan2(-f.x, -f.z);
        },
        /** Battery: voltage (V), charge 0..1, used mAh. */
        get battery() {
          const b = g.quad().battery;
          return { voltage: b.voltage, charge: b.soc, usedMah: b.usedMah };
        },
        arm: () => g.fc().arm(),
        disarm: () => g.fc().disarm(),
        reset: () => g.respawn(),
        teleport: (x: number, y: number, z: number, yaw?: number) => g.teleport(x, y, z, yaw),
      },

      /** Multipliers on the real physics (1 = normal). Undone when the plugin stops. */
      physics: Object.defineProperties({} as { thrust: number; drag: number; gravity: number; propSpeed: number; battery: number; reset(): void }, {
        thrust: prop(physics('thrust')),
        drag: prop(physics('drag')),
        gravity: prop(physics('gravity')),
        propSpeed: prop(physics('propSpeed')),
        battery: prop(physics('battery')),
        reset: {
          value: () => {
            r.physics = {};
            host.applyMods();
          },
        },
      }),

      /** Game speed: 1 = real time, 0.25 = slow motion, 2 = double. */
      time: Object.defineProperties({} as { scale: number }, {
        scale: prop({
          get: () => r.timeScale,
          set: (v: number) => {
            r.timeScale = Math.min(4, Math.max(0.05, Number(v) || 1));
            host.applyMods();
          },
        }),
      }),

      input: {
        /** The sticks this frame (throttle 0..1, yaw / pitch / roll -1..1). A copy: use modify() to change them. */
        get sticks() {
          return { ...g.sticks() };
        },
        /** fn(sticks) runs every frame before the flight controller reads the sticks; change them to fly the drone. */
        modify: (fn: (s: Sticks) => void) => {
          r.stickMods.add(fn);
          const off = () => void r.stickMods.delete(fn);
          track(off);
          return off;
        },
        /** True while that key (KeyboardEvent.code) is held. */
        isDown: (code: string) => host.held.has(code),
        /** Controller buttons pressed right now (numbers). */
        get buttons() {
          const out: number[] = [];
          for (const p of g.pads()) p.buttons.forEach((b, i) => (b.pressed || b.value > 0.6) && !out.includes(i) && out.push(i));
          return out;
        },
      },

      camera: {
        /** The three.js camera being drawn. */
        get object() {
          return g.camera().camera;
        },
        /** 'fpv', 'chase' or 'los'. */
        get mode() {
          return g.camera().mode;
        },
        /** FPV field of view in degrees (horizontal). */
        get fov() {
          return g.camera().fovDeg;
        },
        set fov(deg: number) {
          const c = g.camera();
          c.fovDeg = Math.min(170, Math.max(10, deg));
          c.applyFov();
        },
        /** FPV camera uptilt in degrees. */
        get uptilt() {
          return g.camera().uptiltDeg;
        },
        set uptilt(deg: number) {
          g.camera().uptiltDeg = Math.min(90, Math.max(-30, deg));
        },
        /** Switches to the next camera (FPV, chase, line of sight). */
        cycle: () => g.camera().cycle(),
      },

      world: {
        get scene() {
          return g.scene();
        },
        get map() {
          const w = g.world();
          return w ? { id: w.def.id, name: w.def.name } : null;
        },
        get spawn() {
          return g.world()?.spawn ?? null;
        },
        /** Adds a three.js object to the scene (removed when the plugin stops). */
        add: (obj: Object3D) => {
          g.scene().add(obj);
          track(() => obj.removeFromParent());
          return obj;
        },
        remove: (obj: Object3D) => void obj.removeFromParent(),
        /** Distance straight down from (x, y, z) to the first surface, or Infinity. */
        groundDistance: (x: number, y: number, z: number, max = 500) => g.world()?.collision.groundDistance(new THREE.Vector3(x, y, z), max) ?? Infinity,
      },

      ui: {
        /** Builds an element: ui.el('button', { textContent: 'Go', onclick: fn }, [children]). */
        el: makeEl,
        /**
         * Text or HTML on the screen. when: 'flying' (default), 'menu' or 'always'.
         * x / y: 0..1 of the screen (anchor top-left of the box), or use style for anything else.
         */
        text: (content: string, opts: { x?: number; y?: number; html?: boolean; when?: 'flying' | 'menu' | 'always'; style?: Partial<CSSStyleDeclaration> } = {}) => {
          const e = makeEl('div', { class: 'plugin-text' });
          e.dataset.when = opts.when ?? 'flying';
          if (opts.x !== undefined) e.style.left = `${opts.x * 100}%`;
          if (opts.y !== undefined) e.style.top = `${opts.y * 100}%`;
          if (opts.style) Object.assign(e.style, opts.style);
          const set = (c: string) => (opts.html ? (e.innerHTML = c) : (e.textContent = c));
          set(content);
          hud.appendChild(e);
          this.updateVisibility(g.state());
          track(() => e.remove());
          return { el: e, set, show: (on = true) => (e.style.display = on ? '' : 'none'), remove: () => e.remove() };
        },
        /** A boxed panel with a title; put anything in .body. Same `when` / x / y as text(). */
        panel: (title: string, opts: { x?: number; y?: number; width?: number; when?: 'flying' | 'menu' | 'always' } = {}) => {
          const body = makeEl('div', { class: 'plugin-panel-body' });
          const close = makeEl('button', { class: 'plugin-panel-x', textContent: '×', title: 'Hide' });
          const e = makeEl('div', { class: 'plugin-panel' }, [makeEl('div', { class: 'plugin-panel-title' }, [makeEl('span', { textContent: title }), close]), body]);
          e.dataset.when = opts.when ?? 'always';
          e.style.left = `${(opts.x ?? 0.02) * 100}%`;
          e.style.top = `${(opts.y ?? 0.2) * 100}%`;
          if (opts.width) e.style.width = `${opts.width}px`;
          close.addEventListener('click', () => (e.style.display = 'none'));
          hud.appendChild(e);
          this.updateVisibility(g.state());
          track(() => e.remove());
          return { el: e, body, show: (on = true) => (e.style.display = on ? '' : 'none'), remove: () => e.remove() };
        },
        /** A new tab in the main menu; render(container) draws it each time it opens. */
        menuTab: (title: string, render: (container: HTMLElement) => void) => {
          const tabId = `plugin-${id}-${Math.random().toString(36).slice(2, 7)}`;
          const button = makeEl('button', { textContent: title, class: 'plugin-tab' });
          button.dataset.tab = tabId;
          const section = makeEl('section', { id: `tab-${tabId}`, class: 'tab' });
          const draw = () => {
            section.innerHTML = '';
            this.safe(id, () => render(section), r);
          };
          button.addEventListener('click', () => {
            g.showTab(tabId);
            draw();
          });
          $('tabs').appendChild(button);
          document.querySelector('#menu main')?.appendChild(section);
          track(() => {
            button.remove();
            section.remove();
          });
          return { open: () => button.click(), redraw: draw };
        },
        /** A section at the end of Settings. */
        settingsSection: (title: string, render: (container: HTMLElement) => void) => {
          r.settingsSections.push({ title, render });
          if (this.running.has(id)) g.rerenderSettings();
        },
        /** A message in the flight OSD. kind: '' | 'warn' | 'bad'. */
        osd: (text: string, kind = '', seconds = 2) => g.osdMessage(text, kind, seconds),
        /** A short popup (like trick points). kind: '' | 'bank' | 'bail'. */
        popup: (html: string, kind = '') => g.popup(html, kind),
        /** A message box with an OK button. */
        notice: (text: string) => g.notice(text),
        /** Adds CSS to the page (removed with the plugin). */
        css: (text: string) => {
          const s = makeEl('style', { textContent: text });
          document.head.appendChild(s);
          track(() => s.remove());
        },
      },

      keys: {
        /**
         * Runs fn when a shortcut is pressed. `name` is either a shortcut declared in info.keys (the
         * player can change it in Settings → Plugin shortcuts; it can be a key and/or a controller
         * button) or a raw KeyboardEvent.code like 'KeyG'. when: 'flying' (default), 'menu',
         * 'paused' or 'always'. Not while typing in a text box. Returns an unbind function.
         */
        bind: (name: string, fn: (e?: KeyboardEvent) => void, when: When = 'flying') => {
          const declared = !!r.stored.keys?.[name];
          const res = declared ? this.resolve(id, name) : { code: name, pad: null };
          const b = { plugin: id, action: declared ? name : null, code: res.code, pad: res.pad, fn, when };
          this.binds.add(b);
          const off = () => void this.binds.delete(b);
          track(off);
          return off;
        },
        /** What a declared shortcut is set to now, for showing it: e.g. "G" or "G + 🎮 Y". */
        label: (name: string) => {
          const c = this.resolve(id, name);
          return [keyLabel(c.code), c.pad !== null ? padLabel(c.pad) : ''].filter(Boolean).join(' / ') || 'none';
        },
      },

      sound: {
        /** A beep: frequency in Hz, length in ms, volume 0..1, wave 'sine' | 'square' | 'sawtooth' | 'triangle'. */
        beep: (freq = 880, ms = 120, volume = 0.2, wave: OscillatorType = 'sine') => {
          try {
            const ctx = (this.audio ??= new AudioContext());
            const o = ctx.createOscillator();
            const gain = ctx.createGain();
            o.type = wave;
            o.frequency.value = freq;
            gain.gain.value = Math.min(1, Math.max(0, volume));
            gain.gain.setTargetAtTime(0, ctx.currentTime + ms / 1000 - 0.03, 0.01);
            o.connect(gain).connect(ctx.destination);
            o.start();
            o.stop(ctx.currentTime + ms / 1000 + 0.05);
          } catch {
            /* no audio */
          }
        },
        /** Reads text aloud (the system voice). */
        say: (text: string) => {
          try {
            speechSynthesis.speak(new SpeechSynthesisUtterance(String(text)));
          } catch {
            /* no speech */
          }
        },
      },

      storage: {
        get: <T = unknown>(key: string, fallback?: T): T => {
          try {
            const v = localStorage.getItem(storeKey + key);
            return v === null ? (fallback as T) : JSON.parse(v);
          } catch {
            return fallback as T;
          }
        },
        set: (key: string, value: unknown) => {
          try {
            localStorage.setItem(storeKey + key, JSON.stringify(value));
          } catch {
            /* full or blocked */
          }
        },
        remove: (key: string) => localStorage.removeItem(storeKey + key),
      },

      multiplayer: {
        get connected() {
          return g.connected();
        },
        /** Your player id on the server (0 when not connected). */
        get myId() {
          return g.myId();
        },
        /** Everyone on the server: id, name, drone, level, ping. */
        get players() {
          return g.players().map((p) => ({ ...p }));
        },
        /** Where the other drones are right now: [{ id, position, drone }]. */
        get drones() {
          return [...g.others()].map(([pid, p, drone]) => ({ id: pid, position: p.clone(), drone }));
        },
        /** Sends a chat line to the server you're on (if chat is on). */
        say: (text: string) => g.say(String(text)),
      },
    };
    return api;
  }

  /** Shows plugin HUD items for the current game state. */
  updateVisibility(state: string): void {
    const shown = state === 'flying' || state === 'paused' ? 'flying' : state === 'menu' ? 'menu' : '';
    for (const e of Array.from(this.hud.children) as HTMLElement[]) {
      const when = e.dataset.when;
      e.classList.toggle('plugin-off', !(when === 'always' || when === shown));
    }
  }
}
