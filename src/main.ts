import './style.css';
// First: in the Android app it installs the controller and USB serial bridges the rest relies on.
import { androidBack, androidQuit, isAndroidApp } from './platform/android';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MotorSound } from './audio/motorSound';
import { CAMERA_MODES, CameraRig, type CameraMode } from './camera/fpvCamera';
import { DroneModel } from './drones/droneModel';
import { DroneSpec, getDrone } from './drones/specs';
import { FLIGHT_MODES, FlightController } from './fc/flightController';
import { InputManager } from './input/input';
import { getMap, SPOTS } from './maps/maps';
import { formatTime, Race } from './maps/race';
import type { Traffic } from './maps/traffic';
import { World } from './maps/world';
import { WaterFx, type WaterColumn } from './maps/water';
import { QuadContacts } from './physics/collision';
import { GRAVITY, QuadPhysics } from './physics/quad';
import { loadSettings, saveSettings } from './settings';
import { ControlsPanel } from './ui/controls';
import { Menu } from './ui/menu';
import { Hud } from './ui/hud';
import { Osd } from './ui/osd';
import { FpsCounter } from './ui/fps';
import { notice } from './ui/notice';
import { PadNav } from './ui/padNav';
import { VrView } from './vr/vrView';
import { Pipeline } from './render/pipeline';
import { MapView, spotToWorld, type MapMark } from './ui/mapView';
import { MiniMap } from './ui/miniMap';
import { PluginHost } from './plugins/host';
import { PluginsTab } from './plugins/pluginsTab';
import { ReplayEditor } from './replay/editor';
import { Multiplayer } from './net/multiplayer';
import { RemoteDrones } from './net/remote';
import { ChatBox } from './net/chatBox';
import { Account } from './progress/account';
import { PassUi } from './progress/passUi';
import { getSkin } from './progress/skins';
import { TRICK_POINTS, TrickDetector } from './progress/tricks';
import { drawOverlay, saveFile, startVideo, type VideoWriter } from './replay/export';
import {
  defaultEdits,
  F,
  firstKept,
  FLIGHT_MODE_IDS,
  OSTRIDE,
  otherAt,
  type OtherTrack,
  FlightRecorder,
  formatClock,
  records,
  sampleAt,
  STRIDE,
  type RecordMeta,
} from './replay/recording';

/** Present when running as the FPV Sim desktop app (see desktop/electron/preload.cjs). */
interface DesktopApp {
  isApp: boolean;
  fullscreen(on?: boolean): Promise<boolean>;
  xrAvailable(): Promise<boolean>;
  xr(opts: { on: boolean; fov?: number; distance?: number }): Promise<boolean>;
  onXrStatus(fn: (line: string) => void): void;
  /** Restarts the app when the value differs from the one it was launched with. */
  setVsync?(on: boolean): Promise<void>;
  quit?(): void;
}
const _camPos = new Vector3();
const _ov = new Vector3();
const _oq = new Quaternion();
const desktopApp = (window as unknown as { flysimApp?: DesktopApp }).flysimApp;
const GOGGLES_HELP =
  'Goggles view: the sim goes full screen. In the Quest, start Link, open the Desktop panel from the Link menu bar and pick this monitor. Like real FPV goggles, the picture does not move with your head.';

const DT = 0.001; // 1 kHz physics + flight controller, like a real FC loop
const _rel = new Vector3();
const $ = (id: string) => document.getElementById(id)!;

type State = 'menu' | 'loading' | 'flying' | 'paused' | 'map' | 'naming' | 'replay' | 'lobby';

class Game {
  private renderer: WebGLRenderer;
  private pipeline: Pipeline;
  private scene = new Scene();
  private menuScene = new Scene();
  private menuCam = new PerspectiveCamera(30, 1, 0.01, 50);
  private menuDrone: DroneModel | null = null;
  private menuDroneId = '';

  private settings = loadSettings();
  private input = new InputManager();
  private sound = new MotorSound();
  private rig = new CameraRig();
  private osd = new Osd();
  private fps = new FpsCounter();
  private hud = new Hud(document.body);
  private vr!: VrView;
  private menu: Menu;
  private controls: ControlsPanel;
  private padNav: PadNav;

  private state: State = 'menu';
  private worlds = new Map<string, World>();
  private world: World | null = null;
  private spec!: DroneSpec;
  private quad!: QuadPhysics;
  private fc!: FlightController;
  private contacts!: QuadContacts;
  private model: DroneModel | null = null;
  private race: Race | null = null;

  private clock = new Clock();
  private acc = 0;
  private simTime = 0;
  private flightTime = 0;
  private crashed = false;
  private crashTimer = 0;
  private waterFx: WaterFx | null = null;
  private mapView = new MapView();
  private miniMap = new MiniMap();
  private plugins!: PluginHost;
  private pluginsTab!: PluginsTab;
  private pluginState = '';
  private recorder = new FlightRecorder();
  /** A finished recording waiting for its name. */
  private pendingRec: { frames: Float32Array; duration: number; others: OtherTrack[]; mapId: string; droneId: string; camera: CameraMode } | null = null;
  private afterNaming: 'fly' | 'menu' = 'fly';
  private recText = '';
  private editor!: ReplayEditor;
  private replaySample = new Float32Array(STRIDE);
  private replayPrev = new Vector3();
  private replaySticks = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
  private exporting: { writer: VideoWriter; release: (() => void) | null; cancel: boolean; name: string } | null = null;
  private mp!: Multiplayer;
  private chatBox = new ChatBox();
  private account = new Account();
  private passUi!: PassUi;
  private tricks = new TrickDetector();
  private guestHintShown = false;
  private remote!: RemoteDrones;
  /** Flying a multiplayer round (not single player). */
  private mpRound = false;
  private stateAcc = 0;
  private replayOthers: OtherTrack[] = [];
  private otherBuf = new Float32Array(OSTRIDE);
  private waterCol: WaterColumn = { top: 0, bottom: 0 };
  /** Props (or more) in the water this frame. */
  private inWater = false;
  private drowned = false;
  private drownTime = 0;
  private prevPos = new Vector3();
  private prevArmSwitch: boolean | null = null;
  private gust = new Vector3();
  private gustTarget = new Vector3();
  private gustTimer = 0;
  private signal = 1;
  private signalTimer = 0;
  private noiseCtx = (document.getElementById('noise') as HTMLCanvasElement).getContext('2d')!;
  private noiseImg = this.noiseCtx.createImageData(160, 90);

  constructor() {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    this.pipeline = new Pipeline(canvas);
    this.pipeline.setQuality(this.settings.graphics);
    this.renderer = this.pipeline.renderer;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.fps.show(this.settings.showFps);
    this.setupMenuScene();
    this.menu = new Menu(this.settings, (what) => this.onSettingsChange(what));
    this.menu.account = this.account;
    this.passUi = new PassUi(this.account, () => {
      // Signed in / out, or something claimed: what's locked changed.
      if (this.account.profile && this.settings.username !== this.account.profile.username) {
        this.settings.username = this.account.profile.username;
        saveSettings(this.settings);
      }
      this.menu.renderDrones();
      this.menu.renderSettings();
      // Our level goes out with the next hello, or right away when we're on a server.
      this.mp?.setLevel(this.account.signedIn ? this.account.level : 0);
    });
    document.querySelector('#tabs button[data-tab="pass"]')!.addEventListener('click', () => this.passUi.render());
    $('acct-chip').addEventListener('click', () => {
      this.menu.showTab('pass');
      this.passUi.render();
    });
    this.account.on((e) => {
      if (e.type === 'levelup') this.showLevelUp(e.level, e.rewards.map((r) => r.name));
      if (e.type === 'daycap' && this.state === 'flying') this.trickPopup('Daily XP limit reached: come back tomorrow', 'bail');
    });
    this.tricks.onTrick = (t) => {
      this.trickPopup(`${t.name} <b>+${t.points}</b>${t.combo > 1 ? ` <small>x${t.combo.toFixed(2).replace(/\.?0+$/, '')}</small>` : ''}`);
      this.plugins?.emit('trick', { ...t });
    };
    this.tricks.onBail = (lost) => this.trickPopup(`BAILED <b>-${lost}</b>`, 'bail');
    this.tricks.onBank = (pts) => {
      if (this.account.signedIn) {
        this.account.addXp(pts);
        this.trickPopup(`+${pts} XP`, 'bank');
      } else if (!this.guestHintShown) {
        this.guestHintShown = true;
        this.trickPopup('Sign in (Flight Path tab) to keep your XP', 'bank');
      }
    };
    this.controls = new ControlsPanel(this.input);
    // Menus, pause and dialogs all work with a gamepad alone.
    this.padNav = new PadNav({
      ignorePad: () => this.controls.calibratingPad,
      tabs: () => [...document.querySelectorAll<HTMLButtonElement>('#tabs button')].map((b) => b.dataset.tab!),
      activeTab: () => this.menu.activeTab,
      showTab: (t) => {
        this.menu.showTab(t);
        if (t === 'records') void this.editor.renderList();
        if (t === 'multiplayer') this.mp.renderTab();
        if (t === 'pass') this.passUi.render();
        if (t === 'plugins') this.pluginsTab.render();
        // Plugin tabs draw themselves when their button is clicked.
        if (t.startsWith('plugin-')) document.querySelector<HTMLButtonElement>(`#tabs button[data-tab="${t}"]`)?.click();
      },
    });
    const quitApp = desktopApp?.quit ?? androidQuit;
    if (quitApp) {
      const quit = $('quit');
      quit.classList.remove('hidden');
      quit.addEventListener('click', () => quitApp());
    }
    // Android back button: pause / resume while flying; in the main menu Android leaves the app.
    androidBack.handler = () => {
      if (this.state === 'flying') this.pause();
      else if (this.state === 'paused') this.resume();
      else return this.state === 'loading';
      return true;
    };

    $('fly').addEventListener('click', () => void this.startFlight());
    this.vr = new VrView(this.renderer);
    this.vr.onEnd = () => {
      if (this.state === 'flying') this.pause();
      this.resize();
    };
    this.input.xrControllers = () => this.vr.touchControllers();
    // A DJI remote granted on an earlier visit reconnects without asking again.
    void this.input.dji.reconnect().catch(() => undefined);
    $('vr').addEventListener('click', () => void this.enterVr());
    $('vr-resume').addEventListener('click', () => void this.enterVr());
    desktopApp?.onXrStatus((line) => this.onNativeXrStatus(line));
    void desktopApp?.xrAvailable().then((ok) => (this.nativeXrAvailable = ok));
    // Keep checking: Link is often started after the page is already open.
    const checkVr = () =>
      void VrView.supported().then((ok) => {
        const b = $('vr');
        // No Quest Link on a phone.
        if (isAndroidApp) return;
        b.classList.remove('hidden');
        b.classList.remove('dim');
        // "Back into VR" is for WebXR; native goggles keep running while paused.
        $('vr-resume').classList.toggle('hidden', !ok || this.useNativeXr);
        if (this.useNativeXr) {
          // Desktop app with OpenXR on: native head-locked goggles through FlySimXR.exe.
          b.textContent = this.nativeXrOn ? 'Stop VR' : 'VR (Quest)';
          b.title = 'Show the FPV view in your Meta Quest as a goggle screen (OpenXR through Quest Link). Turn off in Settings → VR headset.';
          return;
        }
        // The desktop app without OpenXR still has goggles view (full screen in Link's Desktop).
        const goggles = !ok && !!desktopApp;
        b.textContent = goggles ? 'Goggles (Quest)' : 'VR (Quest)';
        b.classList.toggle('dim', !ok && !goggles);
        b.title = ok ? 'Fly in your Meta Quest (Link / Air Link)' : goggles ? GOGGLES_HELP : VrView.notFoundReason();
      });
    checkVr();
    window.setInterval(checkVr, 3000);
    $('resume').addEventListener('click', () => this.resume());
    $('restart').addEventListener('click', () => {
      this.resume();
      this.respawn();
    });
    $('to-menu').addEventListener('click', () => this.toMenu());
    $('pause-map').addEventListener('click', () => this.openMap());
    $('pause-rec').addEventListener('click', () => {
      this.resume();
      this.toggleRecording();
    });
    $('mapview-close').addEventListener('click', () => this.closeMap());
    $('rec-save').addEventListener('click', () => void this.finishNaming(true));
    $('rec-discard').addEventListener('click', () => void this.finishNaming(false));
    for (const id of ['rec-name-input', 'rp-name']) {
      // Typing a name must not fly the drone or toggle anything.
      $(id).addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (id === 'rec-name-input' && e.key === 'Enter') void this.finishNaming(true);
      });
      $(id).addEventListener('keyup', (e) => e.stopPropagation());
    }
    $('rp-progress-cancel').addEventListener('click', () => {
      if (this.exporting) this.exporting.cancel = true;
    });
    this.editor = new ReplayEditor(this.sound, {
      open: (m, f, o) => this.openReplay(m, f, o),
      close: () => this.closeReplay(),
      exportVideo: () => this.exportVideo(),
    });
    document.querySelector('#tabs button[data-tab="records"]')!.addEventListener('click', () => void this.editor.renderList());
    this.remote = new RemoteDrones(this.scene);
    this.remote.visible = false;
    this.mp = new Multiplayer(this.settings, () => saveSettings(this.settings), {
      play: (map) => void this.startFlight(map),
      lobby: () => this.endRound(),
      closed: (reason) => {
        void this.plugins.setPolicy(null);
        this.plugins.emit('leave', { reason });
        this.mpRound = false;
        this.chatBox.show(false);
        this.chatBox.clear();
        this.remote.clear();
        this.remote.visible = false;
        if (this.state !== 'menu') this.toMenu();
        this.menu.showTab('multiplayer');
        this.mp.renderTab();
        if (reason) notice(reason);
      },
      teleport: (p, name) => {
        if (this.mpRound && this.world) this.teleport({ name: `To ${name}`, x: p[0], z: p[2] });
      },
      say: (text, kind) => {
        if (this.mpRound && this.state === 'flying') this.osd.message(text, kind, 3);
      },
      states: (m) => {
        if (!this.mpRound) return;
        for (const st of m.s) if (st.id !== this.mp.net.id) this.remote.push(st.id, this.mp.labelOf(st.id), st.d, st.p, st.q, st.w, st.s);
      },
      settingsChanged: () => this.applyMpSettings(),
      event: (name, data) => this.plugins?.emit(name, data),
      chat: (from, text, system) => {
        if (this.settings.chat) this.chatBox.add(from, text, system);
        this.plugins?.emit('chat', { from, text, system });
      },
    });
    this.chatBox.onSend = (text) => this.mp.say(text);
    document.querySelector('#tabs button[data-tab="multiplayer"]')!.addEventListener('click', () => this.mp.renderTab());
    this.mp.owns = (id) => this.account.owns('drone', id);
    this.mp.setLevel(this.account.signedIn ? this.account.level : 0);
    $('pause-leave').addEventListener('click', () => this.mp.leave(''));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setupPlugins();
    this.loadMenuDrone();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- menu

  private setupMenuScene(): void {
    const pmrem = new PMREMGenerator(this.renderer);
    this.menuScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.menuScene.background = new Color(0x0b0f14);
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 2);
    const rim = new DirectionalLight(0xff8a3d, 1.6);
    rim.position.set(-3, 1, -2);
    this.menuScene.add(key, rim, new AmbientLight(0x404a58, 0.6));
  }

  private async loadMenuDrone(): Promise<void> {
    // A locked drone being looked at shows in the showcase too.
    const id = this.menu.previewId || this.settings.droneId;
    if (this.menuDroneId === id) return;
    this.menuDroneId = id;
    const model = await DroneModel.load(getDrone(id));
    if (this.menuDroneId !== id) return;
    if (this.menuDrone) {
      this.menuScene.remove(this.menuDrone.root);
      this.menuDrone.dispose();
    }
    this.menuDrone = model;
    model.applySkin(getSkin(this.settings.skins[id]));
    this.menuScene.add(model.root);
    // Frame the drone whatever its size.
    const spec = getDrone(id);
    const size = (spec.armX * 2 + (spec.prop.diameterIn * 0.0254)) * 1.25;
    this.menuCam.position.set(0, size * 0.9, size * 2.6);
    this.menuCam.lookAt(-size * 0.55, 0, 0);
  }

  /** "Iron Man style" helmet HUD or the "Real FPV" Betaflight OSD (messages stay in both). */
  private applyHudStyle(): void {
    const helmet = this.settings.hudStyle === 'helmet';
    this.hud.show(helmet && this.state !== 'menu');
    $('osd').classList.toggle('helmet', helmet);
    $('osd').classList.toggle('no-sticks', !this.settings.showSticks);
    this.miniMap.configure(this.settings.miniMap, this.settings.miniMapCorner, this.settings.miniMapSize);
    this.miniMap.show(this.state === 'loading' || this.state === 'flying' || this.state === 'paused');
  }

  private onSettingsChange(what: 'drone' | 'map' | 'settings' | 'skin' | 'preview'): void {
    saveSettings(this.settings);
    this.applyHudStyle();
    this.applyGraphics();
    // OpenXR switched off, or the goggle screen resized, while the headset view is running.
    if (this.nativeXrOn) void this.toggleNativeXr(this.settings.nativeXr);
    this.sound.setVolume(this.settings.volume);
    if (what === 'drone' || what === 'preview') void this.loadMenuDrone();
    if (what === 'skin' && this.menuDrone) this.menuDrone.applySkin(getSkin(this.settings.skins[this.menuDrone.spec.id]));
  }

  private vrLayout = '';

  /**
   * In the headset the OSD / HUD move in toward the middle of the goggle screen, where the
   * lenses are sharp, with bigger text; on the monitor they use the whole screen.
   */
  private applyVrLayout(): void {
    const on = this.nativeXrOn || this.vr.active;
    const area = on ? Math.min(1, Math.max(0.5, this.settings.vrOsdArea / 100)) : 1;
    const key = `${on}:${area}`;
    if (key === this.vrLayout) return;
    this.vrLayout = key;
    document.body.classList.toggle('vr', on);
    document.body.style.setProperty('--vr-area', String(area));
    this.osd.area = area;
    this.hud.area = area;
    // The browser (WebXR) goggles draw their own copy of the OSD.
    this.vr.osdArea = Math.min(1, Math.max(0.5, this.settings.vrOsdArea / 100));
  }

  private applyGraphics(): void {
    this.pipeline.setQuality(this.settings.graphics);
    this.world?.setShadowSize(this.pipeline.quality.shadowSize);
    this.fps.show(this.settings.showFps);
    // The desktop app turns VSync on or off at launch; it restarts itself when that changes.
    if (desktopApp?.setVsync) void desktopApp.setVsync(this.settings.vsync);
  }

  private nativeXrAvailable = false;
  private nativeXrOn = false;

  /** Desktop app with the OpenXR setting on and the helper bundled. */
  private get useNativeXr(): boolean {
    return !!desktopApp && this.settings.nativeXr && this.nativeXrAvailable;
  }

  /** Desktop app: start or stop the native OpenXR goggle screen (like real FPV goggles). */
  private async toggleNativeXr(on: boolean): Promise<void> {
    if (!desktopApp) return;
    if (!on) {
      this.nativeXrOn = false;
      await desktopApp.xr({ on: false });
      $('vr').textContent = 'VR (Quest)';
      return;
    }
    const wasOn = this.nativeXrOn;
    const started = await desktopApp.xr({ on: true, fov: this.settings.vrScreenFov, distance: 1.6 });
    if (!started || wasOn) return; // already running: that call only resized the screen
    this.nativeXrOn = true;
    $('vr').textContent = 'Stop VR';
    this.settings.cameraMode = 'fpv';
    if (this.state === 'paused') this.resume();
    else if (this.state === 'menu') await this.startFlight();
    this.rig.setMode('fpv');
  }

  private onNativeXrStatus(line: string): void {
    const say = (text: string, kind: '' | 'warn' | 'bad' = '', secs = 4) => {
      if (this.state === 'flying' || this.state === 'paused') this.osd.message(text, kind, secs);
      $('vr').title = text;
    };
    if (line.startsWith('ERROR ')) {
      this.nativeXrOn = false;
      $('vr').textContent = 'VR (Quest)';
      const msg = `VR: ${line.slice(6)}`;
      if (this.state === 'flying' || this.state === 'paused') this.osd.message(msg, 'bad', 8);
      else notice(msg);
      return;
    }
    const state = line.slice(6);
    if (state === 'waiting for headset') say('VR: waiting for the headset. Start Quest Link.', 'warn', 6);
    else if (state === 'session') say('VR: connected to Quest Link. Put the headset on.', '', 6);
    else if (state === 'ready' || state === 'streaming') say('VR: goggles on', '', 2);
    else if (state === 'paused') say('VR: paused (headset off your head)', 'warn', 3);
    else if (state === 'stopped' || state.startsWith('exited')) {
      this.nativeXrOn = false;
      $('vr').textContent = 'VR (Quest)';
    }
  }

  /** Opens the headset (needs the click's user gesture), then starts or resumes the flight. */
  private async enterVr(): Promise<void> {
    if (this.useNativeXr) {
      await this.toggleNativeXr(!this.nativeXrOn);
      return;
    }
    if (this.vr.active) return;
    if (!(await VrView.supported())) {
      if (desktopApp) {
        await this.enterGoggles();
        return;
      }
      notice(VrView.notFoundReason());
      return;
    }
    this.vr.setScreenFov(this.settings.vrScreenFov);
    try {
      await this.vr.enter();
    } catch (err) {
      notice(`Could not start VR: ${(err as Error).message}`);
      return;
    }
    if (this.state === 'paused') this.resume();
    else if (this.state === 'menu') await this.startFlight();
  }

  /**
   * Desktop app: full-screen FPV view. Shown in the Quest through Link's Desktop panel it
   * looks like real goggles: a flat video feed with the OSD.
   */
  private async enterGoggles(): Promise<void> {
    this.settings.cameraMode = 'fpv';
    await desktopApp?.fullscreen(true);
    if (this.state === 'paused') this.resume();
    else if (this.state === 'menu') await this.startFlight();
    this.rig.setMode('fpv');
    this.osd.message('GOGGLES VIEW  ·  F11 to leave full screen\nIn the Quest: Link menu bar → Desktop → this monitor', '', 7);
  }

  private toMenu(): void {
    void this.account.flush();
    if (this.mp.inGame) {
      // Leaving the server brings us back here through the "closed" hook.
      this.mp.leave('');
      return;
    }
    if (this.recorder.active && this.stopRecording('menu')) return;
    if (this.vr.active) this.vr.exit();
    this.mapView.close();
    this.waterFx?.reset();
    this.state = 'menu';
    this.renderer.toneMappingExposure = 0.9;
    $('pause').classList.add('hidden');
    $('menu').classList.remove('hidden');
    this.osd.show(false);
    this.hud.show(false);
    this.miniMap.show(false);
    this.sound.silence();
    $('analog').style.opacity = '0';
    this.world?.detach();
    if (this.model) this.scene.remove(this.model.root);
    if (this.race) this.scene.remove(this.race.marker);
    this.plugins.emit('flightEnd');
  }

  // ---------------------------------------------------------------- flight setup

  /** Single player, or a multiplayer round on the server's map. */
  private async startFlight(mpMap?: string): Promise<void> {
    if (this.state === 'loading') return;
    this.mpRound = !!mpMap;
    this.state = 'loading';
    this.sound.start();
    this.sound.setVolume(this.settings.volume);
    $('menu').classList.add('hidden');
    $('loading').classList.remove('hidden');
    const def = getMap(mpMap ?? this.settings.mapId);
    // Signed out (or a drone not claimed yet): fly a starter drone.
    if (!this.account.owns('drone', this.settings.droneId)) this.settings.droneId = 'freestyle5';
    this.spec = getDrone(this.settings.droneId);
    try {
      await this.loadScene(def, this.spec);
      this.respawn();
      if (this.mpRound) this.spreadSpawn();
      this.applyMpSettings();
      $('loading').classList.add('hidden');
      this.osd.show(true);
      this.applyHudStyle();
      this.osd.message(`${this.spec.name} @ ${def.name}`, '', 2);
      this.state = 'flying';
      this.clock.getDelta();
      this.plugins.emit('flightStart', { map: def.id, drone: this.spec.id, multiplayer: this.mpRound });
    } catch (err) {
      console.error(err);
      $('loading-text').textContent = `Failed to load: ${(err as Error).message}`;
      setTimeout(() => {
        $('loading').classList.add('hidden');
        this.toMenu();
      }, 3000);
    }
  }

  /** Loads (or reuses) the map and the drone and sets up physics, camera and effects. */
  private async loadScene(def: ReturnType<typeof getMap>, spec: DroneSpec): Promise<void> {
    {
      $('loading-text').textContent = `Loading ${def.name}…`;
      let world = this.worlds.get(def.id);
      if (!world) {
        world = await World.load(def, this.scene, this.renderer);
      }
      // Most recently used last; maps beyond the limit are freed (a big map holds 100-200 MB).
      this.worlds.delete(def.id);
      this.worlds.set(def.id, world);
      const keep = isAndroidApp ? 1 : 2;
      for (const [id, w] of this.worlds) {
        if (this.worlds.size <= keep) break;
        if (w === world || w === this.world) continue;
        w.dispose();
        this.worlds.delete(id);
      }
      $('loading-text').textContent = `Preparing ${spec.name}…`;
      const model = await DroneModel.load(spec);
      model.applySkin(getSkin(this.settings.skins[spec.id]));

      if (this.world && this.world !== world) this.world.detach();
      if (this.model) {
        this.scene.remove(this.model.root);
        this.model.dispose();
      }
      if (this.race) this.scene.remove(this.race.marker);
      this.world = world;
      world.attach();
      world.setShadowSize(this.pipeline.quality.shadowSize);
      this.pipeline.setAoRadius(def.indoor ? 0.35 : 1.6);
      this.renderer.toneMappingExposure = world.exposure;
      this.model = model;
      this.scene.add(model.root);
      if (this.waterFx) {
        this.waterFx.dispose();
        this.scene.remove(this.waterFx.group);
      }
      this.waterFx = world.water.any ? new WaterFx(world.water, this.scene) : null;
      if (this.waterFx) this.scene.add(this.waterFx.group);

      this.quad = new QuadPhysics(this.spec);
      this.fc = new FlightController(this.quad);
      this.contacts = new QuadContacts(this.quad);
      this.applyFlightSettings();
      this.input.hoverThrottle = Math.sqrt(1 / this.spec.twRatio);

      this.race = world.gates.length && def.gate ? new Race(world.gates, def.gate, `flysim.best.${def.id}.${this.spec.id}`) : null;
      if (this.race) this.scene.add(this.race.marker);

      this.rig.setRange(def.indoor || spec.mass < 0.1 ? 0.004 : 0.02, def.cameraFar);
      this.rig.setMode(this.settings.cameraMode);
    }
  }

  private applyFlightSettings(): void {
    const s = this.settings;
    const id = this.spec.id;
    this.fc.mode = s.flightMode;
    this.fc.rates = structuredClone(s.rates[id] ?? this.spec.rates);
    this.rig.uptiltDeg = s.uptilt[id] ?? this.spec.camera.uptiltDeg;
    this.rig.fovDeg = s.fov[id] ?? this.spec.camera.fovDeg;
    this.rig.setAspect(window.innerWidth / window.innerHeight);
  }

  /** Back to the start, or to `at` (a point on the ground) facing `yaw`. */
  private respawn(at?: Vector3, yaw?: number): void {
    const w = this.world!;
    const base = at ?? w.spawn;
    const heading = yaw ?? w.spawnYaw;
    const p = base.clone();
    p.y += this.contacts.restHeight + 0.005;
    this.quad.reset(p, heading);
    this.fc.disarm();
    this.fc.reset();
    this.crashed = false;
    this.crashTimer = 0;
    this.inWater = false;
    this.drowned = false;
    this.drownTime = 0;
    this.waterFx?.reset();
    this.tricks.reset();
    this.flightTime = 0;
    this.prevPos.copy(p);
    this.race?.reset();
    // Pilot stands 3 m behind the spawn, eye height 1.7 m (LOS camera).
    const back = new Vector3(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(3);
    this.rig.pilotPos.copy(base).add(back);
    this.rig.pilotPos.y += 1.7;
    this.prevArmSwitch = this.input.armSwitch;
    this.input.resetThrottle();
    this.climbI = 0;
    this.plugins?.emit('reset');
  }

  private pause(): void {
    this.state = 'paused';
    this.plugins.emit('pause');
    $('pause-rec').textContent = this.recorder.active ? 'Stop recording' : 'Start recording';
    $('pause-leave').classList.toggle('hidden', !this.mpRound);
    $('pause-leave').textContent = 'Leave server';
    $('pause').classList.remove('hidden');
    this.sound.silence();
  }

  private resume(): void {
    this.state = 'flying';
    $('pause').classList.add('hidden');
    this.clock.getDelta();
    this.plugins.emit('resume');
  }

  // ---------------------------------------------------------------- loop

  private lastFrame = 0;

  /** Frames per second to aim for right now; 0 = as fast as the PC can go. */
  private frameCap(): number {
    // Menus and pause don't need more; it keeps the GPU cool for when it counts.
    if (this.state !== 'flying' && this.state !== 'replay') return 60;
    // Native VR copies every painted frame to the headset; the headset shows at most 90-120.
    if (this.nativeXrOn) return 120;
    return this.settings.fpsCap;
  }

  private frame(): void {
    // WebXR runs at the headset's own rate.
    const cap = this.vr.active ? 0 : this.frameCap();
    const now = performance.now();
    // Wait for the GPU instead of queueing frames it can't draw yet (the counter then shows
    // frames that really reach the screen).
    if (!this.vr.active && !this.pipeline.gpuReady()) return;
    if (cap) {
      const interval = 1000 / cap;
      if (now - this.lastFrame < interval - 0.3) return;
      // Step by whole intervals so the average rate is the cap, not a bit under it.
      this.lastFrame = now - this.lastFrame > interval * 2 ? now : this.lastFrame + interval;
    } else {
      this.lastFrame = now;
    }
    this.fps.tick(now);
    this.applyVrLayout();
    this.step();
    // After the game has used this frame's buttons, so the A that resumes from pause can't also arm.
    this.padNav.update(now);
  }

  private step(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.poll(dt);
    if (this.state !== this.pluginState) {
      this.pluginState = this.state;
      this.plugins.updateVisibility(this.state);
    }
    this.plugins.tick(this.state);
    this.plugins.emit('frame', { dt, state: this.state });

    if (this.state === 'menu') {
      if (this.menu.activeTab === 'controls' || this.controls.wizardOpen) this.controls.update();
      if (this.menuDrone) {
        // The drone showcase belongs to the Drones tab; elsewhere it would cover the cards.
        this.menuDrone.root.visible = this.menu.activeTab === 'drones';
        this.menuDrone.root.rotation.y += dt * 0.4;
        this.menuDrone.root.position.y = Math.sin(performance.now() / 900) * 0.004;
      }
      this.pipeline.render(this.menuScene, this.menuCam);
      return;
    }
    if (this.state === 'loading') return;
    if (this.state === 'lobby') {
      if (this.menuDrone) this.menuDrone.root.visible = false;
      this.pipeline.render(this.menuScene, this.menuCam);
      return;
    }
    if (this.mpRound && this.state !== 'flying') this.remote.update(dt);
    if (this.state === 'replay') {
      this.replayFrame(dt);
      return;
    }
    if (this.state === 'map' || this.state === 'naming') {
      if (this.state === 'map' && (this.input.events.mapView || this.input.events.menu)) this.closeMap();
      this.pipeline.render(this.scene, this.rig.camera);
      return;
    }
    if (this.state === 'paused') {
      if (this.input.events.menu) this.resume();
      if (this.vr.active) this.vr.render(this.scene, this.rig.camera, dt);
      else this.pipeline.render(this.scene, this.rig.camera);
      return;
    }
    this.flyFrame(dt);
  }

  private flyFrame(dt: number): void {
    const ev = this.input.events;
    const sticks = this.input.sticks;
    if (ev.menu) {
      // The pause menu is on the monitor, so leave the headset to use it.
      if (this.vr.active) this.vr.exit();
      this.pause();
      return;
    }
    if (ev.mapView) {
      if (this.mpRound && this.mp.settings && !this.mp.settings.teleport) this.osd.message('TELEPORT IS OFF ON THIS SERVER', 'warn', 2);
      else {
        this.openMap();
        return;
      }
    }
    if (ev.chat && this.mpRound && this.settings.chat) this.chatBox.open();
    if (ev.record) {
      if (this.mpRound && this.mp.settings && !this.mp.settings.recording && !this.recorder.active) this.osd.message('RECORDING IS OFF ON THIS SERVER', 'warn', 2);
      else this.toggleRecording();
    }
    if (ev.reset) this.respawn();
    if (ev.camera) this.settings.cameraMode = this.rig.cycle();
    if (ev.modeCycle) {
      this.fc.mode = FLIGHT_MODES[(FLIGHT_MODES.indexOf(this.fc.mode) + 1) % FLIGHT_MODES.length];
      this.osd.message(this.fc.mode.toUpperCase(), '', 1.2);
    }
    if (this.input.modeSwitch !== null) {
      const m = (['acro', 'horizon', 'angle'] as const)[this.input.modeSwitch];
      if (m !== this.fc.mode) {
        this.fc.mode = m;
        this.osd.message(m.toUpperCase(), '', 1.2);
      }
    }
    this.handleArming(ev.armToggle);

    // Wind with gusts (smoothed random walk).
    const def = this.world!.def;
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = 0.5 + Math.random() * 2;
      const g = def.wind.gust;
      this.gustTarget.set((Math.random() * 2 - 1) * g, (Math.random() * 2 - 1) * g * 0.3, (Math.random() * 2 - 1) * g);
    }
    this.gust.lerp(this.gustTarget, Math.min(1, dt * 1.5));
    if (this.settings.wind) this.quad.wind.set(def.wind.x, 0, def.wind.z).add(this.gust);
    else this.quad.wind.set(0, 0, 0);
    // Indoors the wind only exists outside.
    if (def.indoor) this.quad.wind.set(0, 0, 0);

    const world = this.world!;
    const traffic = world.traffic;
    world.animate(dt);
    if (traffic) {
      traffic.pace = this.settings.carSpeed / 100;
      traffic.update(dt);
    }
    this.quad.groundDistance = world.collision.groundDistance(this.quad.pos, 10);
    // Water is not solid, but the props still feel it as ground for ground effect.
    const solidGround = this.quad.groundDistance;
    const water = world.water.column(this.quad.pos, 60, this.waterCol);
    if (water && this.quad.pos.y > water.top) this.quad.groundDistance = Math.min(this.quad.groundDistance, this.quad.pos.y - water.top);
    this.prevPos.copy(this.quad.pos);

    // Spring-centred throttle: turn the stick into a climb-rate request.
    if (this.input.climbStick !== null) sticks.throttle = this.climbAssist(dt, this.input.climbStick);
    this.plugins.modifySticks(sticks);

    // Fixed-step physics.
    this.acc += dt * this.plugins.timeScale;
    let maxImpact = 0;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.simTime += DT;
      const cmds = this.fc.update(DT, sticks);
      this.quad.step(DT, this.crashed ? [0, 0, 0, 0] : cmds);
      const c = this.contacts.resolve(world.collision, this.spec.restitution);
      if (c.hit) maxImpact = Math.max(maxImpact, c.impactSpeed);
      if (traffic) maxImpact = Math.max(maxImpact, this.carContact(traffic));
      if (water) this.waterStep(water);
    }

    if (maxImpact > 0.5) this.sound.crash(maxImpact / 12);
    if (!this.crashed && this.fc.armed && maxImpact > this.spec.crashSpeed) this.crash(maxImpact);
    if (this.quad.pos.y < -200 || !Number.isFinite(this.quad.pos.y)) this.respawn();
    if (this.crashed && this.settings.autoReset) {
      this.crashTimer += dt;
      // A drowned quad gets a moment to sink first.
      if (this.crashTimer > (this.drowned ? 3.5 : 2.5)) this.respawn();
    }
    if (this.fc.armed) this.flightTime += dt;
    if (this.mpRound) this.netFrame(dt);
    this.trickFrame(dt, solidGround);

    // Race gates.
    if (this.race && this.fc.armed) {
      const e = this.race.update(this.prevPos, this.quad.pos, this.simTime);
      if (e?.type === 'start') this.osd.message('GO!', '', 1);
      if (e?.type === 'lap') this.osd.message(`LAP ${formatTime(e.time)}${e.best ? '\nNEW BEST!' : ''}`, e.best ? 'warn' : '', 2.5);
    }

    // Video link: range and line of sight from the pilot.
    this.signalTimer -= dt;
    if (this.signalTimer <= 0) {
      this.signalTimer = 0.2;
      const d = this.quad.pos.distanceTo(this.rig.pilotPos);
      let s = 1 - Math.max(0, (d - def.videoRange * 0.6) / (def.videoRange * 0.5));
      if (!def.indoor && world.collision.blocked(this.rig.pilotPos, this.quad.pos)) s -= 0.45 * Math.min(1, d / (def.videoRange * 0.3));
      this.signal = Math.max(0, Math.min(1, s));
    }
    // Under water the video dies within a couple of seconds.
    if (this.drowned) {
      this.drownTime += dt;
      this.signal = Math.min(this.signal, Math.max(0, 1 - this.drownTime / 1.8));
    }
    this.updateAnalog();

    this.model!.update(this.quad, this.rig.mode === 'fpv');
    this.rig.update(dt, this.quad, this.spec.camera.pos, Math.max(0.25, this.spec.armX * 6));
    world.followShadow(this.quad.pos);
    if (this.waterFx) {
      let thrust = 0;
      for (const m of this.quad.motors) thrust += m.thrust;
      thrust /= this.spec.mass * GRAVITY;
      this.waterFx.update(dt, this.quad, this.crashed ? 0 : thrust, Math.max(1.2, this.quad.propRadius * 55), this.contacts.span, solidGround);
      this.waterFx.setCamera(this.rig.camera.getWorldPosition(_camPos));
    }
    this.sound.update(this.quad, this.quad.vel.length());
    if (traffic) this.carSounds(traffic);
    else this.sound.engines([]);

    const ground = Number.isFinite(this.quad.groundDistance) ? this.quad.groundDistance : this.quad.pos.y - world.spawn.y;
    this.recordSample(ground);
    if (this.settings.hudStyle === 'helmet') {
      this.hud.update(dt, {
        quad: this.quad,
        spec: this.spec,
        map: def,
        camera: this.rig.camera,
        cameraMode: this.rig.mode,
        sticks,
        armed: this.fc.armed,
        mode: this.fc.mode,
        flightTime: this.flightTime,
        agl: Math.max(0, ground - this.contacts.restHeight),
        altitude: this.quad.pos.y - world.spawn.y - this.contacts.restHeight,
        signal: this.signal,
        pilot: this.rig.pilotPos,
        race: this.race,
        time: this.simTime,
      });
    }
    this.miniMap.update(
      dt,
      this.renderer,
      this.scene,
      world,
      this.mapHide(),
      { x: this.quad.pos.x, z: this.quad.pos.z, yaw: this.droneYaw() },
      world.spawn,
      // Servers with "drone-show" off hide the other pilots here too.
      this.remote.group.visible ? this.remote.positions() : [],
    );
    this.osd.update(dt, {
      quad: this.quad,
      sticks,
      armed: this.fc.armed,
      mode: this.fc.mode,
      camera: this.rig.mode,
      flightTime: this.flightTime,
      altitude: ground - this.contacts.restHeight,
      signal: this.signal,
      race: this.race,
      time: this.simTime,
      pilot: this.rig.pilotPos,
      fpvCamera: this.rig.camera,
    });
    if (this.vr.active) this.vr.render(this.scene, this.rig.camera, dt);
    else this.pipeline.render(this.scene, this.rig.camera);
  }

  private climbI = 0;

  /**
   * Height hold for spring-centred sticks (DJI-style feel): stick sets vertical speed, the
   * throttle is found by a PI loop around the current hover point. Upside down it just
   * passes the stick through so flips still work.
   */
  private climbAssist(dt: number, stick: number): number {
    if (!this.fc.armed) {
      this.climbI = 0;
      return stick > 0 ? stick : 0;
    }
    const up = this.quad.up(_ov).y;
    const hover = Math.sqrt(1 / this.spec.twRatio);
    if (up < 0.3) return Math.max(0, hover + stick * 0.5);
    // On the ground nothing happens until the stick goes up; full down cuts to idle to land.
    const grounded = this.quad.groundDistance < 0.15 && Math.abs(this.quad.vel.y) < 0.3;
    if ((grounded && stick < 0.1) || (stick < -0.9 && this.quad.groundDistance < 0.15)) {
      this.climbI = 0;
      return 0;
    }
    const maxClimb = Math.min(12, 2.5 * this.spec.twRatio);
    const target = stick * (stick > 0 ? maxClimb : 6);
    const err = target - this.quad.vel.y;
    this.climbI = Math.max(-0.4, Math.min(0.4, this.climbI + err * 0.25 * dt));
    // Tilt needs more throttle to hold height.
    const thr = (hover + this.climbI + err * 0.09) / Math.sqrt(Math.max(up, 0.3));
    return Math.max(0, Math.min(1, thr));
  }

  private handleArming(toggle: boolean): void {
    const ev = this.input.events;
    const sw = this.input.armSwitch;
    let want: boolean | null = null;
    if (sw !== null && this.prevArmSwitch !== null && sw !== this.prevArmSwitch) want = sw;
    this.prevArmSwitch = sw;
    if (toggle) want = !this.fc.armed;
    if (ev.stickArm && !this.fc.armed) want = true;
    // Stick disarm only on the ground, so a full left yaw in a hover can't drop the quad.
    if (ev.stickDisarm && this.fc.armed && this.quad.groundDistance < 0.3 && this.quad.vel.length() < 1) want = false;

    if (want === false) {
      this.fc.disarm();
      this.osd.message('DISARMED', '', 0.8);
    } else if (want === true) {
      const reason = this.armBlocker();
      if (reason) {
        this.osd.message(reason, 'warn', 2);
      } else {
        this.fc.arm();
        this.osd.message('ARMED', '', 0.8);
      }
    }
    this.updateArmHint();
  }

  /** Why arming would be refused right now, or null. */
  private armBlocker(): string | null {
    if (this.crashed) return 'CRASHED — reset first (R / B)';
    if (!this.input.throttleLow) return `THROTTLE ${Math.round(this.input.sticks.throttle * 100)}% — lower it to arm`;
    if (this.quad.battery.soc <= 0.01) return 'BATTERY EMPTY — reset';
    return null;
  }

  /** While disarmed, keep telling the pilot how to arm and what is in the way. */
  private updateArmHint(): void {
    if (this.fc.armed || this.crashed || this.osd.busy) return;
    const blocker = this.armBlocker();
    const sw = this.input.armSwitch;
    const how =
      sw !== null
        ? sw
          ? 'Arm switch is ON: flip it OFF, lower throttle, flip it ON'
          : 'Flip your ARM switch'
        : 'Press A / Cross / Space';
    const cal = this.input.uncalibrated ? '\nController not calibrated: Esc > Main menu > Controls > Calibrate' : '';
    this.osd.hint(`DISARMED\n${blocker ?? how}\nor: throttle down + yaw right for 1 s${cal}`, blocker ? 'warn' : '');
  }

  /** Bump off (or ride on) a race car: push out of its body and take on its speed. Returns impact speed. */
  private carContact(traffic: Traffic): number {
    const hit = traffic.collide(this.quad.pos, this.contacts.span);
    if (!hit) return 0;
    const q = this.quad;
    q.pos.addScaledVector(hit.normal, hit.depth);
    _rel.subVectors(q.vel, hit.carVel);
    const vn = _rel.dot(hit.normal);
    if (vn >= 0) return 0;
    const e = -vn > 0.6 ? this.spec.restitution : 0;
    q.vel.addScaledVector(hit.normal, -(1 + e) * vn);
    // Friction: on the roof it carries the drone along with the car.
    _rel.addScaledVector(hit.normal, -vn);
    q.vel.addScaledVector(_rel, -0.5);
    return -vn;
  }

  /** Engine notes of the nearest race cars, with Doppler shift from the closing speed. */
  private carSounds(traffic: Traffic): void {
    const voices = traffic.nearest(this.quad.pos, 3).map(({ car, dist }) => {
      _rel.subVectors(this.quad.pos, car.pos).divideScalar(Math.max(dist, 0.1));
      const closing = _rel.dot(car.vel) - _rel.dot(this.quad.vel);
      const doppler = 343 / Math.max(120, 343 - closing);
      const gain = 0.5 / (1 + (dist / 14) ** 1.6);
      return { hz: traffic.engineHz(car) * doppler, gain };
    });
    this.sound.engines(voices);
  }

  // ---------------------------------------------------------------- tricks and the Flight Path

  private trickFrame(dt: number, ground: number): void {
    const q = this.quad;
    this.tricks.bonus = this.mpRound ? TRICK_POINTS.multiplayer_bonus : 1;
    // Something solid just above while moving fast: a gap, a bridge, an arch.
    let ceiling = false;
    if (q.vel.lengthSq() > 36) {
      _ov.copy(q.pos);
      _ov.y += Math.max(1.2, this.spec.armX * 25);
      ceiling = this.world!.collision.blocked(q.pos, _ov);
    }
    this.tricks.update(dt, q, this.fc.armed, this.crashed, Number.isFinite(ground) ? ground : 99, ceiling, this.spec.armX);
  }

  private trickPopup(html: string, kind = ''): void {
    const box = $('tricks');
    const d = document.createElement('div');
    d.className = kind;
    d.innerHTML = html;
    box.appendChild(d);
    while (box.childElementCount > 4) box.firstElementChild?.remove();
    setTimeout(() => d.remove(), 2300);
  }

  private showLevelUp(level: number, rewards: string[]): void {
    const el = $('levelup');
    el.querySelector('.lu-lv')!.textContent = `LEVEL ${level}`;
    el.querySelector('.lu-text')!.textContent = rewards.length ? `Unlocked: ${rewards.join(', ')}. Claim on the Flight Path.` : 'Pilot Level up!';
    el.classList.remove('hidden');
    // Restart the animation.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.levelUpTimer);
    this.levelUpTimer = window.setTimeout(() => el.classList.add('hidden'), 4000);
  }

  private levelUpTimer = 0;

  // ---------------------------------------------------------------- multiplayer

  /** Server settings that change what we see: other drones, their names. */
  private applyMpSettings(): void {
    const s = this.mp.settings;
    if (this.mp.net.connected && s) void this.plugins.setPolicy({ allow: s.plugins ?? true, ids: s.allowedPlugins ?? [] });
    this.chatBox.show(this.mpRound && this.settings.chat);
    this.remote.visible = this.mpRound && (s?.show ?? true);
    this.remote.showNames = s?.names ?? true;
    if (!this.mpRound) this.remote.clear();
  }

  /** Each pilot starts at their own spot in a ring around the map's start, not on top of each other. */
  private spreadSpawn(): void {
    const w = this.world!;
    const i = Math.max(0, this.mp.players.findIndex((p) => p.id === this.mp.net.id));
    if (i === 0 && this.mp.players.length < 2) return;
    const ring = Math.floor(i / 8);
    const a = (i % 8) * (Math.PI / 4) + ring * 0.4;
    const r = 2.5 + ring * 2.5;
    const top = new Vector3(w.spawn.x + Math.cos(a) * r, w.spawn.y + 15, w.spawn.z + Math.sin(a) * r);
    const d = w.collision.groundDistance(top, 40);
    if (Number.isFinite(d)) this.respawn(new Vector3(top.x, top.y - d, top.z), w.spawnYaw);
  }

  /** The round ended on the server: back to the lobby (saving a running recording). */
  private endRound(): void {
    if (!this.mpRound) return;
    if (this.recorder.active) {
      const data = this.recorder.stop();
      if (data) {
        const name = `${getMap(this.recorder.mapId).name} multiplayer ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
        void records.add(
          { id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`, name, mapId: this.recorder.mapId, droneId: this.recorder.droneId, created: Date.now(), duration: data.duration, edits: defaultEdits(this.recorder.camera), others: data.others.length || undefined },
          data.frames,
          data.others,
        );
      }
      this.recText = '';
      $('osd-rec').textContent = '';
    }
    if (this.vr.active) this.vr.exit();
    this.mpRound = false;
    this.chatBox.show(false);
    this.mapView.close();
    $('pause').classList.add('hidden');
    $('rec-name').classList.add('hidden');
    this.pendingRec = null;
    this.osd.show(false);
    this.hud.show(false);
    this.miniMap.show(false);
    this.sound.silence();
    $('analog').style.opacity = '0';
    this.waterFx?.reset();
    this.world?.detach();
    if (this.model) this.scene.remove(this.model.root);
    if (this.race) this.scene.remove(this.race.marker);
    this.remote.clear();
    this.remote.visible = false;
    this.renderer.toneMappingExposure = 0.9;
    this.state = 'lobby';
  }

  /** Multiplayer, every flying frame: other drones, bumping into them, sending our state. */
  private netFrame(dt: number): void {
    const s = this.mp.settings;
    this.remote.update(dt);
    this.remote.prune(4000);
    if (s?.collision && s.show) this.droneCollisions();
    if (this.recorder.active) this.recorder.sampleOthers(this.simTime, this.remote.samples());
    this.stateAcc += dt;
    if (this.stateAcc >= 1 / (s?.rate ?? 20)) {
      this.stateAcc = 0;
      const q = this.quad;
      let w = 0;
      for (const m of q.motors) w += m.omega;
      this.mp.sendState(q.pos, q.quat, w / 4, this.fc.armed, this.crashed);
    }
  }

  /** Drones as spheres: push apart, bounce, and crash when hit hard enough. */
  private droneCollisions(): void {
    const q = this.quad;
    for (const [, p, droneId] of this.remote.positions()) {
      const spec = getDrone(droneId);
      const r = this.contacts.span + Math.max(0.05, spec.armX * 1.2 + spec.prop.diameterIn * 0.0127);
      _ov.subVectors(q.pos, p);
      const d = _ov.length();
      if (d >= r || d < 1e-4) continue;
      _ov.divideScalar(d);
      q.pos.addScaledVector(_ov, r - d);
      const vn = q.vel.dot(_ov);
      if (vn >= 0) continue;
      q.vel.addScaledVector(_ov, -1.5 * vn);
      this.sound.crash(Math.min(1, -vn / 10));
      if (!this.crashed && this.fc.armed && -vn > this.spec.crashSpeed) this.crash(-vn);
    }
  }

  // ---------------------------------------------------------------- map / teleport

  private droneYaw(): number {
    const f = _ov.set(0, 0, -1).applyQuaternion(this.quad.quat);
    return Math.atan2(-f.x, -f.z);
  }

  /** What the top-down map picture leaves out (the drone and effects). */
  private mapHide(): Object3D[] {
    return [...(this.model ? [this.model.root] : []), ...(this.waterFx ? [this.waterFx.group] : []), ...(this.race ? [this.race.marker] : [])];
  }

  private openMap(): void {
    const w = this.world;
    if (!w || !this.model) return;
    if (this.vr.active) this.vr.exit();
    $('pause').classList.add('hidden');
    const marks: MapMark[] = [{ name: 'Start', x: w.spawn.x, z: w.spawn.z, yaw: w.spawnYaw }, ...(SPOTS[w.def.id] ?? []).map(spotToWorld)];
    const hide = this.mapHide();
    this.state = 'map';
    this.sound.silence();
    this.mapView.open(
      this.renderer,
      this.scene,
      w,
      `${w.def.name} — map`,
      marks,
      { x: this.quad.pos.x, z: this.quad.pos.z, yaw: this.droneYaw() },
      hide,
      (m) => this.teleport(m),
    );
  }

  private closeMap(): void {
    this.mapView.close();
    if (this.state === 'map') {
      this.state = 'flying';
      this.clock.getDelta();
    }
  }

  /** Drops the drone, disarmed, on whatever is at that point (roof, ground, bridge). */
  private teleport(m: MapMark): void {
    const w = this.world!;
    const top = new Vector3(m.x, 3000, m.z);
    const d = w.collision.groundDistance(top, 6000);
    this.closeMap();
    if (!Number.isFinite(d)) {
      this.osd.message('NOTHING TO LAND ON THERE', 'warn', 2);
      return;
    }
    const ground = new Vector3(m.x, top.y - d, m.z);
    const water = w.water.column(ground, top.y - ground.y);
    if (water && water.top > ground.y + 0.01) {
      this.osd.message('THAT SPOT IS WATER', 'warn', 2);
      return;
    }
    this.respawn(ground, m.yaw ?? this.droneYaw());
    this.osd.message(m.name === 'Map' ? 'TELEPORTED' : m.name.toUpperCase(), '', 1.5);
  }

  // ---------------------------------------------------------------- recording

  private toggleRecording(): void {
    if (this.recorder.active) {
      this.stopRecording('fly');
      return;
    }
    this.recorder.start(this.simTime, this.settings.mapId, this.spec.id, this.rig.mode);
    this.osd.message('● REC', 'bad', 1.2);
  }

  /** One sample of the flight (at most 60 per second) and the REC timer on the OSD. */
  private recordSample(ground: number): void {
    const text = this.recorder.active ? `● REC ${formatClock(this.recorder.elapsed(this.simTime)).replace(/\.\d$/, '')}` : '';
    if (text !== this.recText) {
      this.recText = text;
      $('osd-rec').textContent = text;
    }
    if (!this.recorder.active) return;
    const q = this.quad;
    const st = this.input.sticks;
    this.recorder.sample(this.simTime, (r, o) => {
      r[o + F.px] = q.pos.x;
      r[o + F.py] = q.pos.y;
      r[o + F.pz] = q.pos.z;
      r[o + F.qx] = q.quat.x;
      r[o + F.qy] = q.quat.y;
      r[o + F.qz] = q.quat.z;
      r[o + F.qw] = q.quat.w;
      for (let i = 0; i < 4; i++) r[o + F.w0 + i] = q.motors[i].omega;
      r[o + F.thr] = st.throttle;
      r[o + F.yaw] = st.yaw;
      r[o + F.pitch] = st.pitch;
      r[o + F.roll] = st.roll;
      r[o + F.armed] = this.fc.armed ? 1 : 0;
      r[o + F.mode] = FLIGHT_MODE_IDS.indexOf(this.fc.mode);
      r[o + F.volt] = q.battery.voltage;
      r[o + F.mah] = q.battery.usedMah;
      r[o + F.flightTime] = this.flightTime;
      r[o + F.alt] = ground - this.contacts.restHeight;
      r[o + F.crashed] = this.crashed ? 1 : 0;
      r[o + F.cam] = CAMERA_MODES.indexOf(this.rig.mode);
    });
    if (this.recorder.full) this.stopRecording('fly');
  }

  /** Ends the recording and asks for its name. False if there was nothing worth keeping. */
  private stopRecording(after: 'fly' | 'menu'): boolean {
    const data = this.recorder.stop();
    this.recText = '';
    $('osd-rec').textContent = '';
    if (!data) {
      this.osd.message('RECORDING TOO SHORT', 'warn', 1.5);
      return false;
    }
    if (this.vr.active) this.vr.exit();
    this.pendingRec = { ...data, mapId: this.recorder.mapId, droneId: this.recorder.droneId, camera: this.recorder.camera };
    this.afterNaming = after;
    this.state = 'naming';
    this.sound.silence();
    $('pause').classList.add('hidden');
    const def = getMap(this.recorder.mapId);
    const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const input = $('rec-name-input') as HTMLInputElement;
    input.value = `${def.name} ${time}`;
    $('rec-name-info').textContent = `${formatClock(data.duration)} on ${def.name}. Name it to find it in Records.`;
    $('rec-name').classList.remove('hidden');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
    return true;
  }

  private async finishNaming(save: boolean): Promise<void> {
    const rec = this.pendingRec;
    if (!rec) return;
    this.pendingRec = null;
    $('rec-name').classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    if (save) {
      const name = ($('rec-name-input') as HTMLInputElement).value.trim() || 'Flight';
      const meta: RecordMeta = {
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        mapId: rec.mapId,
        droneId: rec.droneId,
        created: Date.now(),
        duration: rec.duration,
        edits: defaultEdits(rec.camera),
        others: rec.others.length || undefined,
      };
      try {
        await records.add(meta, rec.frames, rec.others);
        this.osd.message(`SAVED: ${name}`, '', 2);
      } catch (err) {
        notice(`Could not save the recording: ${(err as Error).message}`);
      }
    }
    if (this.afterNaming === 'menu') this.toMenu();
    else {
      this.state = 'flying';
      this.clock.getDelta();
    }
  }

  // ---------------------------------------------------------------- replay editor

  private async openReplay(meta: RecordMeta, frames: Float32Array, others: OtherTrack[] = []): Promise<void> {
    this.replayOthers = others;
    this.remote.clear();
    this.remote.visible = others.length > 0;
    this.state = 'loading';
    $('menu').classList.add('hidden');
    $('loading').classList.remove('hidden');
    this.sound.start();
    this.sound.setVolume(this.settings.volume);
    try {
      this.spec = getDrone(meta.droneId);
      await this.loadScene(getMap(meta.mapId), this.spec);
      this.respawn();
      this.rig.setMode(meta.edits.camera);
      $('analog').style.opacity = '0';
      // The key help belongs to flying, not to a video.
      $('osd-help').style.display = 'none';
      this.signal = 1;
      this.osd.clearMessage();
      this.hud.show(false);
      this.applyReplaySample(frames, this.editor.t, 0, true);
      $('loading').classList.add('hidden');
      this.state = 'replay';
      this.clock.getDelta();
    } catch (err) {
      console.error(err);
      $('loading').classList.add('hidden');
      notice(`Could not open the recording: ${(err as Error).message}`);
      this.toMenu();
    }
  }

  private closeReplay(): void {
    if (this.exporting) this.exporting.cancel = true;
    this.editor.hide();
    this.remote.clear();
    this.remote.visible = false;
    this.replayOthers = [];
    this.sound.setDroneLevel(1);
    $('osd-help').style.display = '';
    this.toMenu();
    this.menu.showTab('records');
    void this.editor.renderList();
  }

  /** Puts the drone where the recording says it was at time t. */
  private applyReplaySample(frames: Float32Array, t: number, dt: number, jumped: boolean): Float32Array {
    const s = sampleAt(frames, t, this.replaySample);
    const q = this.quad;
    this.replayPrev.copy(q.pos);
    q.pos.set(s[F.px], s[F.py], s[F.pz]);
    q.quat.set(s[F.qx], s[F.qy], s[F.qz], s[F.qw]).normalize();
    if (dt > 0 && !jumped) q.vel.subVectors(q.pos, this.replayPrev).divideScalar(dt);
    else q.vel.set(0, 0, 0);
    q.motors.forEach((m, i) => {
      m.omega = s[F.w0 + i];
      m.thrust = m.kT * m.omega * m.omega;
    });
    q.battery.voltage = s[F.volt];
    q.battery.usedMah = s[F.mah];
    return s;
  }

  private replayFrame(dt: number): void {
    const ed = this.editor;
    const meta = ed.meta;
    const frames = ed.frames;
    if (!meta || !frames) return;
    if (!this.exporting && this.input.events.menu) {
      this.closeReplay();
      return;
    }
    const before = ed.t;
    const t = ed.advance(dt);
    const jumped = Math.abs(t - before - (ed.playing ? dt : 0)) > 0.25;
    if (this.rig.mode !== meta.edits.camera) this.rig.setMode(meta.edits.camera);
    const s = this.applyReplaySample(frames, t, ed.playing ? dt : 0, jumped);
    const q = this.quad;
    const world = this.world!;
    if (this.replayOthers.length) {
      const o = this.otherBuf;
      for (const tr of this.replayOthers) {
        if (!otherAt(tr.frames, t, o)) continue;
        _ov.set(o[1], o[2], o[3]);
        _oq.set(o[4], o[5], o[6], o[7]);
        this.remote.set(tr.id, tr.name, tr.drone, _ov, _oq, o[8]);
      }
      this.remote.prune(250);
      this.remote.showNames = meta.edits.playerNames;
      this.remote.update(ed.playing ? dt : 0);
    }
    world.animate(dt);
    world.traffic?.update(dt);
    this.model!.update(q, this.rig.mode === 'fpv');
    this.rig.update(jumped ? 1 : dt, q, this.spec.camera.pos, Math.max(0.25, this.spec.armX * 6));
    world.followShadow(q.pos);
    if (ed.playing) this.sound.update(q, q.vel.length());
    else this.sound.silence();
    this.sound.engines([]);
    if (this.waterFx) {
      let thrust = 0;
      for (const m of q.motors) thrust += m.thrust;
      thrust /= this.spec.mass * GRAVITY;
      const solid = world.collision.groundDistance(q.pos, 10);
      this.waterFx.update(dt, q, s[F.crashed] > 0.5 ? 0 : thrust, Math.max(1.2, q.propRadius * 55), this.contacts.span, solid);
      this.waterFx.setCamera(this.rig.camera.getWorldPosition(_camPos));
    }
    this.osd.show(meta.edits.showOsd);
    if (meta.edits.showOsd) {
      const st = this.replaySticks;
      st.throttle = s[F.thr];
      st.yaw = s[F.yaw];
      st.pitch = s[F.pitch];
      st.roll = s[F.roll];
      this.osd.update(dt, {
        quad: q,
        sticks: st,
        armed: s[F.armed] > 0.5,
        mode: FLIGHT_MODE_IDS[Math.round(s[F.mode])] ?? 'acro',
        camera: this.rig.mode,
        flightTime: s[F.flightTime],
        altitude: s[F.alt],
        // A replay is always the clean picture, whatever the link was like.
        signal: 1,
        race: null,
        time: t,
        pilot: this.rig.pilotPos,
        fpvCamera: this.rig.camera,
      });
    }
    this.pipeline.render(this.scene, this.rig.camera);
    if (this.exporting) this.exportFrame();
  }

  /** Plays the edited flight once in real time, recording the picture (and OSD) and the sound. */
  private exportVideo(): void {
    const ed = this.editor;
    const meta = ed.meta;
    if (!meta || this.exporting) return;
    if (typeof MediaRecorder === 'undefined') {
      notice('Video export is not supported here.');
      return;
    }
    const view = this.renderer.domElement;
    let w = view.width;
    let h = view.height;
    if (h > 1080) {
      w = Math.round((w * 1080) / h);
      h = 1080;
    }
    w -= w % 2;
    h -= h % 2;
    ed.setPlaying(false);
    ed.seek(firstKept(meta.edits.cuts));
    const cap = this.sound.capture();
    const writer = startVideo(w, h, cap?.stream ?? null, 60);
    this.exporting = { writer, release: cap?.release ?? null, cancel: false, name: meta.name };
    ($('rp-progress-bar') as HTMLElement).style.width = '0';
    $('rp-progress').classList.remove('hidden');
    ed.setPlaying(true);
  }

  private exportFrame(): void {
    const ex = this.exporting!;
    const ed = this.editor;
    const c = ex.writer.canvas;
    ex.writer.ctx.drawImage(this.renderer.domElement, 0, 0, c.width, c.height);
    const osd = $('osd');
    if (ed.meta?.edits.showOsd && osd.clientWidth) drawOverlay(ex.writer.ctx, osd, c.width / osd.clientWidth);
    const p = ed.editedLength > 0 ? ed.editedTime / ed.editedLength : 1;
    ($('rp-progress-bar') as HTMLElement).style.width = `${(p * 100).toFixed(1)}%`;
    $('rp-progress-text').textContent = `${formatClock(ed.editedTime)} / ${formatClock(ed.editedLength)} — it plays once in real time`;
    if (!ed.playing || ex.cancel) void this.finishExport();
  }

  private async finishExport(): Promise<void> {
    const ex = this.exporting;
    if (!ex) return;
    this.exporting = null;
    this.editor.setPlaying(false);
    const blob = await ex.writer.finish();
    ex.release?.();
    $('rp-progress').classList.add('hidden');
    if (ex.cancel) return;
    const ext = ex.writer.mime.includes('mp4') ? 'mp4' : 'webm';
    saveFile(blob, `${ex.name.replace(/[\\/:*?"<>|]+/g, '_')}.${ext}`);
  }

  /** One physics step against the water column under the drone: drowning, drag and buoyancy. */
  private waterStep(water: WaterColumn): void {
    const q = this.quad;
    const wet = q.pos.y - this.contacts.restHeight * 0.6 < water.top && q.pos.y > water.bottom;
    if (!wet) {
      this.inWater = false;
      return;
    }
    if (!this.inWater) {
      this.inWater = true;
      const speed = q.vel.length();
      this.waterFx?.splash(q.pos, water.top, speed, this.contacts.span);
      this.sound.crash(Math.min(0.6, 0.15 + speed / 25));
      // Water in the motors and the electronics: it is over.
      if (!this.drowned) this.drown();
    }
    const under = q.pos.y < water.top;
    // Water is ~800x denser than air: heavy drag, and a quad only slightly heavier than the water it displaces.
    q.vel.multiplyScalar(Math.exp((under ? -3.5 : -1.5) * DT));
    if (under) q.vel.y += GRAVITY * 0.8 * DT;
    q.omega.multiplyScalar(Math.exp(-6 * DT));
  }

  private drown(): void {
    this.plugins.emit('crash', { speed: this.quad.vel.length(), drowned: true });
    this.tricks.crash();
    this.drowned = true;
    this.drownTime = 0;
    this.crashed = true;
    this.crashTimer = 0;
    this.osd.hint('');
    this.fc.disarm();
    this.osd.message('DROWNED\nR / B to reset', 'bad', 3);
  }

  private crash(speed: number): void {
    this.plugins.emit('crash', { speed, drowned: false });
    this.tricks.crash();
    this.crashed = true;
    this.osd.hint('');
    this.crashTimer = 0;
    this.fc.disarm();
    this.osd.message(`CRASH ${speed.toFixed(1)} m/s\nR / B to reset`, 'bad', 2.5);
  }

  // ---------------------------------------------------------------- plugins

  private setupPlugins(): void {
    this.plugins = new PluginHost({
      raw: this,
      state: () => this.state,
      settings: this.settings,
      scene: () => this.scene,
      world: () => this.world ?? null,
      quad: () => this.quad,
      spec: () => this.spec,
      fc: () => this.fc,
      crashed: () => this.crashed,
      multiplayer: () => this.mpRound,
      respawn: () => this.world && this.respawn(),
      teleport: (x, y, z, yaw) => {
        if (!this.quad) return;
        this.quad.pos.set(x, y, z);
        this.quad.vel.set(0, 0, 0);
        this.quad.omega.set(0, 0, 0);
        if (yaw !== undefined) this.quad.quat.setFromAxisAngle(_ov.set(0, 1, 0), yaw);
        this.prevPos.copy(this.quad.pos);
      },
      osdMessage: (text, kind = '', secs = 2) => this.osd.message(text, kind as '' | 'warn' | 'bad', secs),
      popup: (html, kind = '') => this.trickPopup(html, kind),
      notice: (text) => notice(text),
      say: (text) => this.mp.say(text),
      connected: () => this.mp.net.connected,
      camera: () => this.rig,
      sticks: () => this.input.sticks,
      pads: () => this.input.pads(),
      players: () => this.mp.players,
      others: () => (this.remote.group.visible ? this.remote.positions() : []),
      myId: () => (this.mp.net.connected ? this.mp.net.id : 0),
      showTab: (id) => this.menu.showTab(id),
      rerenderSettings: () => {
        saveSettings(this.settings);
        this.menu.renderSettings();
      },
    });
    this.menu.onSettingsRendered = (el) => this.plugins.renderSettings(el);
    this.pluginsTab = new PluginsTab(this.plugins);
    document.querySelector('#tabs button[data-tab="plugins"]')!.addEventListener('click', () => this.pluginsTab.render());
    $('tabs').addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.tab;
      if (tab) this.plugins.emit('tab', { tab });
    });
    void this.plugins.startAll();
  }

  private updateAnalog(): void {
    const el = $('analog');
    const breakup = 1 - this.signal;
    const level = (this.settings.analog ? 0.12 : 0) + breakup * (this.settings.analog ? 0.9 : 0.75);
    el.style.opacity = level.toFixed(2);
    if (level < 0.01) return;
    const d = this.noiseImg.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    this.noiseCtx.putImageData(this.noiseImg, 0, 0);
  }

  private resize(): void {
    if (this.renderer.xr.isPresenting) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.pipeline.setSize(w, h);
    this.rig.setAspect(w / h);
    this.menuCam.aspect = w / h;
    this.menuCam.updateProjectionMatrix();
  }
}

const game = new Game();
// Handy for poking at the sim from the dev console.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
