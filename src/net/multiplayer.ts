import { DRONES, getDrone } from '../drones/specs';
import { getMap } from '../maps/maps';
import type { Settings } from '../settings';
import { NetClient, parseAddress, queryStatus, type NetPlayer, type Phase, type ServerMessage, type ServerSettings } from './client';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SERVERS_KEY = 'flysim.servers.v1';
const NAME_RE = /^[\w .|\-]{2,20}$/u;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface SavedServer {
  label: string;
  address: string;
}

export interface MultiplayerHooks {
  /** The round starts on this map: load it and fly. */
  play(mapId: string): void;
  /** The round ended (or never started): show the lobby. */
  lobby(): void;
  /** Left or lost the server: back to the menu with this reason ('' = left on purpose). */
  closed(reason: string): void;
  /** The server moved us next to another player. */
  teleport(p: [number, number, number], name: string): void;
  /** A line for the pilot (OSD while flying). */
  say(text: string, kind: '' | 'warn' | 'bad'): void;
  /** Live drone states from the server. */
  states(m: Extract<ServerMessage, { t: 'states' }>): void;
  /** Settings or owner status changed. */
  settingsChanged(): void;
  /** A chat line (system: joins, leaves). */
  chat(from: string, text: string, system: boolean): void;
  /** For plugins: we joined a server, or another pilot joined / left. */
  event?(name: 'join' | 'playerJoin' | 'playerLeave', data: object): void;
}

/** The Multiplayer tab (user name, saved servers) and the lobby with its map vote. */
export class Multiplayer {
  readonly net = new NetClient();
  settings: ServerSettings | null = null;
  owner = false;
  phase: Phase = 'lobby';
  map: string | null = null;
  players: NetPlayer[] = [];
  private maps: string[] = [];
  private votes: Record<string, number> = {};
  private myVote = '';
  private voteEndsAt = 0;
  private address = '';
  private voteTimer = 0;
  /** Our Pilot Level (0 = signed out), sent with hello and when it changes. */
  private level = 0;

  constructor(
    private readonly game: Settings,
    private readonly save: () => void,
    private readonly hooks: MultiplayerHooks,
  ) {
    this.net.onMessage = (m) => this.handle(m);
    this.net.onClose = (reason) => this.leave(reason);
    $('mp-name-save').addEventListener('click', () => this.saveName());
    $('mp-add').addEventListener('click', () => this.addServer());
    $('mp-leave').addEventListener('click', () => this.leave(''));
    $('mp-start').addEventListener('click', () => this.net.send({ t: 'start' }));
    $('mp-drone').addEventListener('change', () => {
      this.game.droneId = $<HTMLSelectElement>('mp-drone').value;
      this.save();
      this.net.send({ t: 'drone', d: this.game.droneId });
    });
    for (const id of ['mp-name', 'mp-address', 'mp-label', 'mp-chat-input', 'mp-cmd']) {
      // Typing must not fly the drone or press game keys.
      $(id).addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key !== 'Enter') return;
        if (id === 'mp-name') this.saveName();
        else if (id === 'mp-chat-input') this.sendChat();
        else if (id === 'mp-cmd') this.sendCmd();
        else this.addServer();
      });
      $(id).addEventListener('keyup', (e) => e.stopPropagation());
    }
    $('mp-chat-send').addEventListener('click', () => this.sendChat());
    $('mp-cmd-send').addEventListener('click', () => this.sendCmd());
  }

  /** Set by the game: drones the player may fly. */
  owns: (droneId: string) => boolean = () => true;

  get inGame(): boolean {
    return this.net.connected;
  }

  // ---------------------------------------------------------------- the tab

  renderTab(): void {
    const named = NAME_RE.test(this.game.username || '');
    $('mp-ask-name').classList.toggle('hidden', named);
    $('mp-servers-wrap').classList.toggle('hidden', !named);
    if (!named) {
      setTimeout(() => $('mp-name').focus(), 50);
      return;
    }
    $('mp-you').textContent = this.game.username;
    const list = $('mp-servers');
    list.innerHTML = '';
    const servers = this.loadServers();
    if (!servers.length) {
      list.innerHTML = '<div class="rec-empty">No servers yet. Add one above with the address your friend gave you (an IP like <b>192.168.1.20:25580</b> or a tunnel address like <b>name.gl.joinmc.link:12345</b>).<br>Want your own? <a href="https://guyka2212.github.io/flysim-servers/" target="_blank" rel="noopener">Get the server from the FPV Sim servers website</a>.</div>';
      return;
    }
    servers.forEach((s, i) => {
      const c = document.createElement('div');
      c.className = 'card mp-card';
      c.innerHTML = `<h3>${esc(s.label || s.address)}</h3><div class="sub">${esc(s.address)}</div><div class="sub mp-status">Checking…</div>
        <div class="row"><button class="fly mp-join">Join</button><button class="mp-del">Remove</button></div>`;
      c.querySelector('.mp-join')!.addEventListener('click', () => void this.join(s.address));
      c.querySelector('.mp-del')!.addEventListener('click', () => {
        if (!confirm(`Remove ${s.label || s.address}?`)) return;
        const all = this.loadServers();
        all.splice(i, 1);
        localStorage.setItem(SERVERS_KEY, JSON.stringify(all));
        this.renderTab();
      });
      list.appendChild(c);
      const status = c.querySelector('.mp-status')!;
      queryStatus(s.address).then(
        (st) => {
          if (!s.label) c.querySelector('h3')!.textContent = st.name;
          status.innerHTML = `<span class="mp-on">● Online</span> · ${st.players}/${st.maxDrones} pilots · ${st.phase === 'playing' && st.map ? `flying ${esc(getMap(st.map).name)}` : st.phase}${st.password ? ' · 🔒' : ''}<br>${esc(st.motd)}`;
        },
        () => (status.innerHTML = '<span class="mp-off">● Offline</span> (or not reachable from here)'),
      );
    });
  }

  private saveName(): void {
    const v = $<HTMLInputElement>('mp-name').value.trim();
    if (!NAME_RE.test(v)) {
      $('mp-name-err').textContent = '2 to 20 letters, numbers, space or . _ - |';
      return;
    }
    this.game.username = v;
    this.save();
    $('mp-name-err').textContent = '';
    this.renderTab();
  }

  private loadServers(): SavedServer[] {
    try {
      const v = JSON.parse(localStorage.getItem(SERVERS_KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private addServer(): void {
    const address = $<HTMLInputElement>('mp-address').value.trim();
    const label = $<HTMLInputElement>('mp-label').value.trim();
    if (!parseAddress(address)) {
      $('mp-add-err').textContent = 'Type an address like 192.168.1.20:25580 or name.example.gg:12345';
      return;
    }
    const all = this.loadServers();
    all.unshift({ label, address });
    localStorage.setItem(SERVERS_KEY, JSON.stringify(all));
    $<HTMLInputElement>('mp-address').value = '';
    $<HTMLInputElement>('mp-label').value = '';
    $('mp-add-err').textContent = '';
    this.renderTab();
  }

  // ---------------------------------------------------------------- joining

  async join(address: string, password = ''): Promise<void> {
    $('mp-joining').classList.remove('hidden');
    $('mp-joining-text').textContent = `Connecting to ${address}…`;
    try {
      const w = await this.net.connect(address, this.game.username, this.game.droneId, password, { level: this.level, skin: this.game.skins[this.game.droneId] ?? 'stock' });
      this.address = address;
      this.settings = w.settings;
      this.owner = w.owner;
      this.maps = w.maps;
      this.players = [];
      $('mp-chat-log').innerHTML = '';
      $('mp-joining').classList.add('hidden');
      this.showLobby();
      this.hooks.settingsChanged();
      this.hooks.event?.('join', { address, server: w.settings.name });
    } catch (err) {
      $('mp-joining').classList.add('hidden');
      const msg = (err as Error).message;
      if (/password/i.test(msg)) {
        const pw = prompt(`${msg}\nPassword:`);
        if (pw) return this.join(address, pw);
        return;
      }
      alert(`Could not join ${address}:\n${msg}`);
    }
  }

  leave(reason: string): void {
    const was = this.inGame || this.settings !== null;
    this.net.close();
    this.settings = null;
    this.owner = false;
    this.phase = 'lobby';
    this.map = null;
    this.players = [];
    clearInterval(this.voteTimer);
    $('mp-lobby').classList.add('hidden');
    if (was) this.hooks.closed(reason);
  }

  // ---------------------------------------------------------------- lobby

  showLobby(): void {
    $('mp-lobby').classList.remove('hidden');
    this.renderLobby();
  }

  hideLobby(): void {
    $('mp-lobby').classList.add('hidden');
  }

  private renderLobby(): void {
    const s = this.settings;
    if (!s) return;
    $('mp-server-name').textContent = s.name;
    $('mp-motd').textContent = s.motd;
    $('mp-address-shown').textContent = this.address;
    $('mp-rules').textContent = [
      s.collision ? 'drones collide' : 'no collisions',
      s.show ? 'pilots visible' : 'pilots hidden',
      s.names ? 'names on' : 'names off',
      s.teleport ? 'teleport allowed' : 'no teleport',
    ].join(' · ');
    $('mp-players').innerHTML = this.players
      .map((p) => `<li>${p.owner ? '<span class="mp-crown" title="Owner">★</span>' : ''}<b>${esc(p.name)}</b>${p.level ? `<span class="mp-lv">Lv ${p.level}</span>` : ''}${p.name === this.game.username ? ' (you)' : ''}<span class="sub"> · ${esc(getDrone(p.drone).name)} · ${p.ping} ms</span></li>`)
      .join('');
    $('mp-count').textContent = `${this.players.length}/${s.maxDrones}`;
    const sel = $<HTMLSelectElement>('mp-drone');
    sel.innerHTML = DRONES.filter((d) => this.owns(d.id)).map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    sel.value = this.game.droneId;
    const start = $<HTMLButtonElement>('mp-start');
    start.classList.toggle('hidden', !this.owner || this.phase === 'voting');
    start.textContent = this.phase === 'playing' ? 'End round' : 'Start';
    $('mp-owner-tools').classList.toggle('hidden', !this.owner);
    // Chat switched off in Settings: no chat in the lobby either.
    $('mp-chat').classList.toggle('hidden', !this.game.chat);
    $('mp-wait').textContent =
      this.phase === 'lobby' ? (this.owner ? 'Everyone in? Press Start to vote for a map.' : 'Waiting for the owner to start…') : this.phase === 'playing' ? `A round is on: ${getMap(this.map ?? '').name}.` : '';
    const voting = this.phase === 'voting';
    $('mp-vote').classList.toggle('hidden', !voting);
    if (voting) this.renderVote();
  }

  private renderVote(): void {
    const grid = $('mp-vote-maps');
    grid.innerHTML = '';
    for (const id of this.maps) {
      const m = getMap(id);
      const n = this.votes[id] ?? 0;
      const c = document.createElement('div');
      c.className = 'card mp-map' + (this.myVote === id ? ' selected' : '');
      c.innerHTML = `<div class="thumb"><img src="/previews/${id}.jpg" alt="" loading="lazy" onerror="this.remove()"></div><h3>${esc(m.name)}</h3><div class="sub">${n} vote${n === 1 ? '' : 's'}</div>`;
      c.addEventListener('click', () => {
        this.myVote = id;
        this.net.send({ t: 'vote', map: id });
        this.renderVote();
      });
      grid.appendChild(c);
    }
    this.tickVote();
  }

  private tickVote(): void {
    const left = Math.max(0, Math.ceil((this.voteEndsAt - performance.now()) / 1000));
    $('mp-vote-left').textContent = `${left} s`;
  }

  private chat(from: string, text: string): void {
    const log = $('mp-chat-log');
    const d = document.createElement('div');
    d.innerHTML = `<b>${esc(from)}</b> ${esc(text)}`;
    log.appendChild(d);
    if (log.childElementCount > 100) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  private sendChat(): void {
    const i = $<HTMLInputElement>('mp-chat-input');
    const text = i.value.trim();
    if (!text) return;
    this.say(text);
    i.value = '';
  }

  /** Sends a chat line (if chat is on). */
  say(text: string): void {
    if (this.game.chat) this.net.send({ t: 'chat', text: text.slice(0, 200) });
  }

  private sendCmd(): void {
    const i = $<HTMLInputElement>('mp-cmd');
    const cmd = i.value.trim();
    if (!cmd) return;
    this.net.send({ t: 'admin', cmd });
    this.chat('>', cmd);
    i.value = '';
  }

  /** Sends our own drone to the server (called at the server's state rate). */
  sendState(p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }, w: number, armed: boolean, crashed: boolean): void {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    this.net.send({ t: 'state', p: [r(p.x), r(p.y), r(p.z)], q: [r(q.x), r(q.y), r(q.z), r(q.w)], w: Math.round(w), a: armed, c: crashed, d: this.game.droneId, s: this.game.skins[this.game.droneId] ?? 'stock' });
  }

  nameOf(id: number): string {
    return this.players.find((p) => p.id === id)?.name ?? '?';
  }

  /** Name tag text: the name and Pilot Level. */
  labelOf(id: number): string {
    const p = this.players.find((x) => x.id === id);
    if (!p) return '?';
    return p.level ? `${p.name}  Lv ${p.level}` : p.name;
  }

  setLevel(level: number): void {
    if (level === this.level) return;
    this.level = level;
    this.net.send({ t: 'level', level });
  }

  // ---------------------------------------------------------------- messages

  private handle(m: ServerMessage): void {
    switch (m.t) {
      case 'players':
        this.players = m.list;
        this.renderLobby();
        break;
      case 'phase': {
        const prev = this.phase;
        this.phase = m.phase;
        this.map = m.map;
        if (m.phase === 'voting') {
          this.maps = m.maps ?? this.maps;
          this.votes = m.votes ?? {};
          this.myVote = '';
          this.voteEndsAt = performance.now() + (m.left ?? 30000);
          clearInterval(this.voteTimer);
          this.voteTimer = window.setInterval(() => this.tickVote(), 250);
        } else clearInterval(this.voteTimer);
        this.renderLobby();
        if (m.phase === 'playing' && m.map) {
          this.hideLobby();
          this.hooks.play(m.map);
        } else if (prev === 'playing' || m.phase === 'voting' || m.phase === 'lobby') {
          this.showLobby();
          if (prev === 'playing') this.hooks.lobby();
        }
        break;
      }
      case 'votes':
        this.votes = m.votes;
        this.voteEndsAt = performance.now() + m.left;
        if (this.phase === 'voting') this.renderVote();
        break;
      case 'states':
        this.hooks.states(m);
        break;
      case 'tp':
        this.hooks.teleport(m.p, m.name);
        break;
      case 'msg':
        this.chat('Server:', m.text);
        this.hooks.say(m.text, m.kind);
        break;
      case 'chat':
        if (!this.game.chat) break;
        this.chat(`${m.from}:`, m.text);
        this.hooks.chat(m.from, m.text, false);
        break;
      case 'joined':
        this.chat('→', `${m.name} joined`);
        this.hooks.chat('', `${m.name} joined`, true);
        this.hooks.event?.('playerJoin', { id: m.id, name: m.name });
        break;
      case 'left':
        this.chat('←', `${m.name} left`);
        this.hooks.chat('', `${m.name} left`, true);
        this.hooks.event?.('playerLeave', { id: m.id, name: m.name });
        break;
      case 'settings':
        this.settings = m.settings;
        this.owner = m.owner;
        this.renderLobby();
        this.hooks.settingsChanged();
        break;
      case 'owner':
        this.owner = m.owner;
        this.renderLobby();
        break;
    }
  }
}
