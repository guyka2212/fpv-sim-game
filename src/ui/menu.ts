import { DRONES, DroneSpec, getDrone } from '../drones/specs';
import { FLIGHT_MODES } from '../fc/flightController';
import { getMap, MAPS } from '../maps/maps';
import type { Settings } from '../settings';
import type { Account } from '../progress/account';
import { unlockLevel } from '../progress/flightPath';
import { SKINS } from '../progress/skins';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
/** Running as the FPV Sim desktop app (desktop/electron/preload.cjs). */
const isDesktopApp = !!(window as unknown as { flysimApp?: unknown }).flysimApp;

// Shown behind the preview image while it loads (or if it is missing).
const MAP_GRADIENTS: Record<string, string> = {
  bando: 'linear-gradient(135deg,#6b6157,#a49a8c 50%,#c06a2a)',
  racetrack: 'linear-gradient(135deg,#2f6b25,#7fbf4a 50%,#ff6a1a)',
  house: 'linear-gradient(135deg,#8a6640,#d9cdb6 55%,#e05aa8)',
  town: 'linear-gradient(135deg,#7b4a38,#d8c49c 50%,#5d84a0)',
  mountains: 'linear-gradient(135deg,#2c4a2a,#9fb4c8 55%,#f2f4f8)',
  mall: 'linear-gradient(135deg,#c9c3b8,#f0ece4 50%,#3a8fd6)',
  f1: 'linear-gradient(135deg,#2a2a2e,#d40000 55%,#f5f5f5)',
  oval: 'linear-gradient(135deg,#1d4fa0,#ffd200 50%,#e2231a)',
  lake: 'linear-gradient(135deg,#1f4f2a,#2c7fa8 55%,#e8f0f4)',
  hollywood: 'linear-gradient(135deg,#8a7350,#e8c98a 50%,#2a9d8f)',
  paris: 'linear-gradient(135deg,#4a3a2c,#d8cdb6 50%,#5b7fa6)',
  stadium: 'linear-gradient(135deg,#1b5e20,#e8eaed 50%,#1d3fa0)',
};

function stat(label: string, value: string, frac?: number): string {
  const bar = frac === undefined ? '' : `<div class="bar"><i style="width:${Math.round(Math.min(1, frac) * 100)}%"></i></div>`;
  return `<div><span>${label}</span>${value}${bar}</div>`;
}

export function droneStats(d: DroneSpec): string {
  const auw = d.mass >= 0.1 ? `${Math.round(d.mass * 1000)} g` : `${(d.mass * 1000).toFixed(0)} g`;
  return `<div class="spec">
    ${stat('Class', d.className)}
    ${stat('All-up weight', auw)}
    ${stat('Motors', d.motor.label)}
    ${stat('Props', `${d.prop.diameterIn}" x ${d.prop.pitchIn} x ${d.prop.blades}`)}
    ${stat('Battery', d.battery.label)}
    ${stat('Camera uptilt', `${d.camera.uptiltDeg}°`)}
    ${stat('Thrust / weight', `${d.twRatio}:1`, d.twRatio / 14)}
    ${stat('Max rate', `${d.rates.rollPitch.max}°/s`, d.rates.rollPitch.max / 900)}
    ${stat('Durability', d.crashSpeed > 50 ? 'bounces off everything' : `${d.crashSpeed} m/s impact`, Math.min(1, d.crashSpeed / 12))}
    ${stat('Frame', d.ducted ? 'ducted' : d.propsOut ? 'props out' : 'props in')}
  </div>`;
}

/** Drone/map/settings tabs. Calls onChange whenever the selection or settings change. */
export class Menu {
  constructor(
    private settings: Settings,
    private onChange: (what: 'drone' | 'map' | 'settings' | 'skin' | 'preview') => void,
  ) {
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) =>
      b.addEventListener('click', () => this.showTab(b.dataset.tab!)),
    );
    this.renderDrones();
    this.renderMaps();
    this.renderSettings();
  }

  activeTab = 'drones';
  /** Called after Settings redraws, so plugins can add their sections at the end. */
  onSettingsRendered: (container: HTMLElement) => void = () => {};
  /** Set by the game: what the player owns (drones and skins unlocked on the Flight Path). */
  account: Account | null = null;
  /** A locked drone being looked at (it can't be selected). */
  previewId = '';

  private owns(kind: 'drone' | 'skin', id: string): boolean {
    return this.account ? this.account.owns(kind, id) : unlockLevel(kind, id) === 0;
  }

  showTab(tab: string): void {
    this.activeTab = tab;
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`));
  }

  renderDrones(): void {
    const list = $('#drone-list');
    list.innerHTML = '';
    for (const d of DRONES) {
      const c = document.createElement('div');
      const owned = this.owns('drone', d.id);
      c.className = 'card' + (d.id === this.settings.droneId ? ' selected' : '') + (owned ? '' : ' locked') + (d.id === this.previewId ? ' preview' : '');
      c.innerHTML = `<h3>${d.name}${owned ? '' : `<span class="tag lock">🔒 Lv ${unlockLevel('drone', d.id)}</span>`}</h3><div class="sub">${d.className} · ${d.battery.cells}S · ${d.motor.label}</div>`;
      c.addEventListener('click', () => {
        if (!owned) {
          // Locked: show what it is and where it unlocks, but keep flying the current drone.
          this.previewId = d.id;
          this.renderDrones();
          this.onChange('preview');
          return;
        }
        this.previewId = '';
        this.settings.droneId = d.id;
        // Each drone has its own home map.
        this.settings.mapId = d.defaultMap;
        this.renderDrones();
        this.renderMaps();
        this.renderSettings();
        this.onChange('drone');
      });
      list.appendChild(c);
    }
    const d = getDrone(this.previewId || this.settings.droneId);
    const locked = !!this.previewId;
    const skinNow = this.settings.skins[d.id] ?? 'stock';
    const skins = SKINS.map((sk) => {
      const own = this.owns('skin', sk.id);
      const sw = (sk.colors.prop ?? sk.colors.bell ?? [0.3, 0.3, 0.32]).map((v) => Math.round(Math.min(1, v) * 255)).join(',');
      return `<button class="skin${sk.id === skinNow ? ' on' : ''}${own ? '' : ' locked'}" data-skin="${sk.id}" ${own ? '' : 'disabled'} title="${own ? sk.name : `${sk.name}: Pilot Level ${sk.level}`}"><i style="background:rgb(${sw})${sk.metal ? ';box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)' : ''}"></i>${sk.name}${own ? '' : ` 🔒${sk.level}`}</button>`;
    }).join('');
    $('#drone-detail').innerHTML = `<h2>${d.name}</h2>${
      locked
        ? `<p class="lockmsg">🔒 Unlocks at <b>Pilot Level ${unlockLevel('drone', d.id)}</b> on the Flight Path. Earn XP with tricks, then claim it there.</p><button class="fly" id="open-pass">Open Flight Path</button>`
        : ''
    }<p>${d.description}</p>${droneStats(d)}
      <p style="margin-top:14px">Home map: <b>${getMap(d.defaultMap).name}</b></p>
      ${locked ? '' : `<div class="block"><h3>Skin</h3><div class="skins">${skins}</div></div>`}`;
    $('#drone-detail').querySelector('#open-pass')?.addEventListener('click', () => this.showTab('pass'));
    $('#drone-detail').querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) =>
      b.addEventListener('click', () => {
        this.settings.skins[d.id] = b.dataset.skin!;
        this.renderDrones();
        this.onChange('skin');
      }),
    );
  }

  renderMaps(): void {
    const list = $('#map-list');
    list.innerHTML = '';
    const drone = getDrone(this.settings.droneId);
    for (const m of MAPS) {
      const c = document.createElement('div');
      c.className = 'card' + (m.id === this.settings.mapId ? ' selected' : '');
      const home = m.forDrone === drone.id ? '<span class="tag">home map</span>' : '';
      const built = getDrone(m.forDrone).name;
      c.innerHTML = `<div class="thumb" style="background:${MAP_GRADIENTS[m.id]}"><img src="/previews/${m.id}.jpg" alt="${m.name} preview" loading="lazy" onerror="this.remove()"></div>
        <h3>${m.name}${home}</h3><div class="sub">${m.gate ? 'Race track · ' : 'Freestyle · '}built for ${built}</div>
        <p class="sub" style="margin:6px 0 0">${m.description}</p>`;
      c.addEventListener('click', () => {
        this.settings.mapId = m.id;
        this.renderMaps();
        this.onChange('map');
      });
      list.appendChild(c);
    }
  }

  renderSettings(): void {
    const s = this.settings;
    const d = getDrone(s.droneId);
    const rates = s.rates[d.id] ?? d.rates;
    const uptilt = s.uptilt[d.id] ?? d.camera.uptiltDeg;
    const fov = s.fov[d.id] ?? d.camera.fovDeg;
    const el = $('#settings');
    el.innerHTML = `
      <div class="block"><h3>Flight</h3>
        <div class="field"><label>Flight mode</label><select id="set-mode">${FLIGHT_MODES.map(
          (m) => `<option value="${m}" ${m === s.flightMode ? 'selected' : ''}>${m === 'acro' ? 'Acro (rate, no self-level)' : m === 'angle' ? 'Angle (self-level, beginners / DJI-style)' : 'Horizon (levels at center, flips at full stick)'}</option>`,
        ).join('')}</select><span></span></div>
        <div class="field"><label>Wind & gusts</label><select id="set-wind"><option value="1" ${s.wind ? 'selected' : ''}>On</option><option value="0" ${!s.wind ? 'selected' : ''}>Off</option></select><span></span></div>
        ${this.slider('car-speed', 'Race car speed (% of real pace)', s.carSpeed, 30, 100, 5)}
        <div class="field"><label>Auto reset after crash</label><select id="set-auto"><option value="1" ${s.autoReset ? 'selected' : ''}>On</option><option value="0" ${!s.autoReset ? 'selected' : ''}>Off</option></select><span></span></div>
      </div>
      <div class="block"><h3>Rates — ${d.name} <small style="color:var(--muted);font-weight:500">(Betaflight Actual rates)</small></h3>
        ${this.slider('r-rp-c', 'Roll/Pitch center', rates.rollPitch.center, 10, 400, 1)}
        ${this.slider('r-rp-m', 'Roll/Pitch max', rates.rollPitch.max, 100, 1800, 10)}
        ${this.slider('r-rp-e', 'Roll/Pitch expo', rates.rollPitch.expo, 0, 1, 0.01)}
        ${this.slider('r-y-c', 'Yaw center', rates.yaw.center, 10, 400, 1)}
        ${this.slider('r-y-m', 'Yaw max', rates.yaw.max, 100, 1800, 10)}
        ${this.slider('r-y-e', 'Yaw expo', rates.yaw.expo, 0, 1, 0.01)}
        <div class="row" style="display:flex;justify-content:flex-end"><button id="rates-reset">Reset to ${d.name} defaults</button></div>
      </div>
      <div class="block"><h3>Camera — ${d.name}</h3>
        ${this.slider('cam-tilt', 'Uptilt (°)', uptilt, 0, 60, 1)}
        ${this.slider('cam-fov', 'Field of view (°)', fov, 80, 160, 1)}
        <div class="field"><label>On-screen display</label><select id="set-hud">
          <option value="betaflight" ${s.hudStyle === 'betaflight' ? 'selected' : ''}>Real FPV: Betaflight OSD like in DJI / Walksnail goggles</option>
          <option value="helmet" ${s.hudStyle === 'helmet' ? 'selected' : ''}>Iron Man style: horizon, tapes and data panels</option>
        </select><span></span></div>
        <div class="field"><label>Stick overlay</label><select id="set-sticks"><option value="1" ${s.showSticks ? 'selected' : ''}>Show where both sticks are</option><option value="0" ${!s.showSticks ? 'selected' : ''}>Hide</option></select><span></span></div>
        <div class="field"><label>Mini map</label><select id="set-minimap"><option value="1" ${s.miniMap ? 'selected' : ''}>Show</option><option value="0" ${!s.miniMap ? 'selected' : ''}>Hide</option></select><span></span></div>
        <div class="field"><label>Mini map position</label><select id="set-minimap-corner">${(
          [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']] as const
        ).map(([v, t]) => `<option value="${v}" ${s.miniMapCorner === v ? 'selected' : ''}>${t}</option>`).join('')}</select><span></span></div>
        <div class="field"><label>Mini map size</label><select id="set-minimap-size">${(
          [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] as const
        ).map(([v, t]) => `<option value="${v}" ${s.miniMapSize === v ? 'selected' : ''}>${t}</option>`).join('')}</select><span></span></div>
        <div class="field"><label>Analog video look</label><select id="set-analog"><option value="0" ${!s.analog ? 'selected' : ''}>Digital HD</option><option value="1" ${s.analog ? 'selected' : ''}>Analog (noise + scanlines)</option></select><span></span></div>
      </div>
      <div class="block"><h3>Graphics &amp; frame rate</h3>
        <div class="field"><label>Graphics quality</label><select id="set-gfx">
          <option value="ultra" ${s.graphics === 'ultra' ? 'selected' : ''}>Ultra: sharpest on high-DPI screens, 4K shadows</option>
          <option value="high" ${s.graphics === 'high' ? 'selected' : ''}>High: anti-aliased, full shadows</option>
          <option value="medium" ${s.graphics === 'medium' ? 'selected' : ''}>Medium: lighter shadows, no anti-aliasing</option>
          <option value="low" ${s.graphics === 'low' ? 'selected' : ''}>Low: max FPS, no shadows, 75% resolution</option>
        </select><span></span></div>
        <div class="field"><label>FPS limit</label><select id="set-fpscap">${[0, 360, 240, 165, 144, 120, 60]
          .map((v) => `<option value="${v}" ${v === s.fpsCap ? 'selected' : ''}>${v ? `${v} FPS` : 'Unlimited'}</option>`)
          .join('')}</select><span></span></div>
        ${
          isDesktopApp
            ? `<div class="field"><label>VSync</label><select id="set-vsync">
          <option value="0" ${!s.vsync ? 'selected' : ''}>Off: highest FPS, lowest stick-to-screen delay (may tear)</option>
          <option value="1" ${s.vsync ? 'selected' : ''}>On: no tearing, capped at the monitor's refresh rate</option>
        </select><span></span></div>`
            : ''
        }
        <div class="field"><label>FPS counter</label><select id="set-showfps"><option value="1" ${s.showFps ? 'selected' : ''}>Show</option><option value="0" ${!s.showFps ? 'selected' : ''}>Hide</option></select><span></span></div>
        <p>${isDesktopApp ? 'Changing VSync restarts the app.' : 'In a browser the frame rate is capped at the monitor refresh rate; the desktop app can go past it.'}</p>
      </div>
      <div class="block"><h3>VR headset (Meta Quest)</h3>
        ${
          isDesktopApp
            ? `<div class="field"><label>OpenXR headset view</label><select id="set-nativexr">
          <option value="1" ${s.nativeXr ? 'selected' : ''}>On: goggle screen straight in the Quest (OpenXR)</option>
          <option value="0" ${!s.nativeXr ? 'selected' : ''}>Off: full-screen goggles view through Link's Desktop panel</option>
        </select><span></span></div>`
            : ''
        }
        ${this.slider('vr-fov', 'Goggle screen size (°)', s.vrScreenFov, 30, 90, 1)}
        ${this.slider('vr-area', 'OSD area in the headset (%)', s.vrOsdArea, 55, 100, 1)}
        <p>${
          isDesktopApp
            ? 'Start Quest Link (cable or Air Link), press <b>VR (Quest)</b>, then put the headset on. Like real FPV goggles, the FPV view and OSD sit on a screen in front of your eyes and do not move with your head. Touch controllers work in the Chrome/Edge version only.'
            : 'Connect the Quest to this PC with Quest Link or Air Link, open this page in Chrome or Edge on the PC, then press <b>VR (Quest)</b>. Like real FPV goggles, the picture sits in front of your eyes and does not move with your head. Fly with your controller, radio, or the Touch controllers.'
        }</p>
      </div>
      <div class="block"><h3>Sound</h3>${this.slider('vol', 'Motor volume', s.volume, 0, 1, 0.01)}</div>
      <div class="block"><h3>Multiplayer</h3>
        <div class="field"><label>User name</label><input id="set-username" type="text" maxlength="20" placeholder="2-20 letters" value="${(s.username || '').replace(/"/g, '&quot;')}" /><span></span></div>
        <div class="field"><label>Chat</label><select id="set-chat"><option value="1" ${s.chat ? 'selected' : ''}>On: messages on screen, T to type</option><option value="0" ${!s.chat ? 'selected' : ''}>Off: no chat</option></select><span></span></div>
        <p>The name other pilots see. Letters, numbers, space and . _ - | (2 to 20).</p>
      </div>`;

    el.querySelector<HTMLSelectElement>('#set-chat')!.addEventListener('change', (e) => {
      s.chat = (e.target as HTMLSelectElement).value === '1';
      this.onChange('settings');
    });
    const uname = el.querySelector<HTMLInputElement>('#set-username')!;
    uname.addEventListener('keydown', (e) => e.stopPropagation());
    uname.addEventListener('change', () => {
      const v = uname.value.trim();
      if (/^[\w .|\-]{2,20}$/u.test(v)) {
        s.username = v;
        this.onChange('settings');
      } else uname.value = s.username;
    });
    const bind = (id: string, fn: (v: number) => void) => {
      const input = el.querySelector<HTMLInputElement>('#' + id)!;
      const out = input.parentElement!.querySelector('output')!;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = input.step === '0.01' ? v.toFixed(2) : String(v);
        fn(v);
        this.onChange('settings');
      });
    };
    const editRates = (fn: (r: typeof rates) => void) => {
      const r = structuredClone(s.rates[d.id] ?? d.rates);
      fn(r);
      s.rates[d.id] = r;
    };
    bind('r-rp-c', (v) => editRates((r) => (r.rollPitch.center = v)));
    bind('r-rp-m', (v) => editRates((r) => (r.rollPitch.max = v)));
    bind('r-rp-e', (v) => editRates((r) => (r.rollPitch.expo = v)));
    bind('r-y-c', (v) => editRates((r) => (r.yaw.center = v)));
    bind('r-y-m', (v) => editRates((r) => (r.yaw.max = v)));
    bind('r-y-e', (v) => editRates((r) => (r.yaw.expo = v)));
    bind('cam-tilt', (v) => (s.uptilt[d.id] = v));
    bind('cam-fov', (v) => (s.fov[d.id] = v));
    bind('vol', (v) => (s.volume = v));
    bind('vr-fov', (v) => (s.vrScreenFov = v));
    bind('vr-area', (v) => (s.vrOsdArea = v));
    bind('car-speed', (v) => (s.carSpeed = v));
    el.querySelector('#rates-reset')!.addEventListener('click', () => {
      delete s.rates[d.id];
      delete s.uptilt[d.id];
      delete s.fov[d.id];
      this.renderSettings();
      this.onChange('settings');
    });
    const sel = (id: string, fn: (v: string) => void) =>
      el.querySelector<HTMLSelectElement>('#' + id)!.addEventListener('change', (e) => {
        fn((e.target as HTMLSelectElement).value);
        this.onChange('settings');
      });
    sel('set-mode', (v) => (s.flightMode = v as Settings['flightMode']));
    sel('set-wind', (v) => (s.wind = v === '1'));
    sel('set-auto', (v) => (s.autoReset = v === '1'));
    sel('set-analog', (v) => (s.analog = v === '1'));
    sel('set-hud', (v) => (s.hudStyle = v as Settings['hudStyle']));
    if (isDesktopApp) sel('set-nativexr', (v) => (s.nativeXr = v === '1'));
    sel('set-gfx', (v) => (s.graphics = v as Settings['graphics']));
    sel('set-fpscap', (v) => (s.fpsCap = Number(v)));
    if (isDesktopApp) sel('set-vsync', (v) => (s.vsync = v === '1'));
    sel('set-showfps', (v) => (s.showFps = v === '1'));
    sel('set-sticks', (v) => (s.showSticks = v === '1'));
    sel('set-minimap', (v) => (s.miniMap = v === '1'));
    sel('set-minimap-corner', (v) => (s.miniMapCorner = v as Settings['miniMapCorner']));
    sel('set-minimap-size', (v) => (s.miniMapSize = v as Settings['miniMapSize']));
    this.onSettingsRendered(el);
  }

  private slider(id: string, label: string, value: number, min: number, max: number, step: number): string {
    const shown = step === 0.01 ? value.toFixed(2) : String(value);
    return `<div class="field"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output>${shown}</output></div>`;
  }
}
