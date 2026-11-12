import {
  CanvasTexture,
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
  DepthTexture,
  FloatType,
} from 'three';

/**
 * Meta Quest / WebXR headset view, like real FPV goggles: the drone camera is rendered to a
 * 16:9 video texture shown on a screen locked to your head in a dark room, with the OSD drawn
 * on top. Looking around does not move the picture, exactly like DJI/Walksnail/analog goggles.
 */
export class VrView {
  /** Horizontal size of the goggle screen in degrees of your view (DJI Goggles ~ 46-51). */
  screenFov = 48;
  session: XRSession | null = null;
  onEnd: (() => void) | null = null;

  private readonly target: WebGLRenderTarget;
  private readonly gogglesScene = new Scene();
  private readonly headCam = new PerspectiveCamera(70, 1, 0.05, 50);
  private readonly screen: Mesh;
  private readonly osdCanvas = document.createElement('canvas');
  private readonly osdTexture: CanvasTexture;
  private readonly osdMesh: Mesh;
  private osdTimer = 0;
  /** Share of the goggle screen the OSD uses, toward the sharp centre of the lenses. */
  osdArea = 0.78;

  constructor(private readonly renderer: WebGLRenderer) {
    // Linear HDR video; tone mapping happens when the goggle screen is drawn.
    // Float depth: with the reversed depth buffer it keeps far terrain free of z-fighting.
    this.target = new WebGLRenderTarget(1920, 1080, {
      samples: 4,
      type: HalfFloatType,
      depthTexture: new DepthTexture(1920, 1080, FloatType),
      resolveDepthBuffer: false,
    });

    this.gogglesScene.background = new Color(0x050505);
    this.gogglesScene.add(this.headCam);

    this.screen = new Mesh(new PlaneGeometry(16 / 9, 1), new MeshBasicMaterial({ map: this.target.texture }));
    this.osdCanvas.width = 1280;
    this.osdCanvas.height = 720;
    this.osdTexture = new CanvasTexture(this.osdCanvas);
    this.osdTexture.colorSpace = SRGBColorSpace;
    this.osdTexture.minFilter = LinearFilter;
    this.osdMesh = new Mesh(
      new PlaneGeometry(16 / 9, 1),
      new MeshBasicMaterial({ map: this.osdTexture, transparent: true, toneMapped: false, depthTest: false }),
    );
    this.osdMesh.renderOrder = 1;
    this.headCam.add(this.screen, this.osdMesh);
    this.layoutScreen();
  }

  get active(): boolean {
    return this.session !== null;
  }

  static async supported(): Promise<boolean> {
    try {
      return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
    } catch {
      return false;
    }
  }

  /** Why VR is not available here, in words a pilot can act on. */
  static notFoundReason(): string {
    const embedded = /Electron|Claude\//.test(navigator.userAgent);
    if (embedded || !navigator.xr) {
      return 'This browser window has no VR support. Open http://localhost:5173 in Google Chrome or Microsoft Edge on this PC, then press VR (Quest).';
    }
    return 'No headset found. Put the Quest on and start Link (Quick Settings → Link, or Air Link), wait until you see the Link home screen, then press VR (Quest) again. In the Meta Horizon Link app on the PC, OpenXR runtime must be set to Meta Horizon Link.';
  }

  /** Must be called from a click handler (browsers only open XR from a user gesture). */
  async enter(): Promise<void> {
    if (!navigator.xr) throw new Error('WebXR is not available in this browser');
    if (this.entering) return;
    this.entering = true;
    // A session left over from a failed start blocks every new one, so close it first.
    if (this.orphan) {
      await this.orphan.end().catch(() => undefined);
      this.orphan = null;
    }
    try {
      let session: XRSession;
      try {
        session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      } catch (e) {
        if (/already an active/i.test((e as Error).message)) {
          throw new Error(
            'Chrome already has VR open from an earlier attempt or another tab. Close other tabs of the sim (or reload this page with F5), then press VR (Quest) once.',
          );
        }
        throw e;
      }
      this.orphan = session;
      session.addEventListener('end', () => {
        if (this.orphan === session) this.orphan = null;
        if (this.session !== session) return;
        this.session = null;
        this.renderer.xr.enabled = false;
        this.onEnd?.();
      });
      this.renderer.xr.enabled = true;
      this.renderer.xr.setReferenceSpaceType('local');
      try {
        await this.renderer.xr.setSession(session);
      } catch (e) {
        // Don't leave a half-started session holding the headset.
        this.renderer.xr.enabled = false;
        await session.end().catch(() => undefined);
        throw new Error(`The headset opened but the sim could not start rendering to it: ${(e as Error).message}`);
      }
      this.orphan = null;
      this.session = session;
    } finally {
      this.entering = false;
    }
  }

  private entering = false;
  /** A session that was granted but not (yet) set up; ended before trying again. */
  private orphan: XRSession | null = null;

  exit(): void {
    void this.session?.end();
  }

  setScreenFov(deg: number): void {
    this.screenFov = deg;
    this.layoutScreen();
  }

  private layoutScreen(): void {
    // Screen 1 m wide-ish at a distance that gives the requested angular size.
    const dist = 1.6;
    const width = 2 * dist * Math.tan(((this.screenFov / 2) * Math.PI) / 180);
    const height = width / (16 / 9);
    this.screen.scale.set(height, height, 1);
    this.screen.position.set(0, 0, -dist);
    this.osdMesh.scale.set(height, height, 1);
    this.osdMesh.position.set(0, 0, -dist + 0.002);
  }

  /** Quest Touch controllers as XR gamepads (left, right), or nulls. */
  touchControllers(): { left: Gamepad | null; right: Gamepad | null } {
    const out = { left: null as Gamepad | null, right: null as Gamepad | null };
    if (!this.session) return out;
    for (const src of this.session.inputSources) {
      if (!src.gamepad) continue;
      if (src.handedness === 'left') out.left = src.gamepad;
      if (src.handedness === 'right') out.right = src.gamepad;
    }
    return out;
  }

  /** Render one headset frame. fpvCamera is the drone camera, already posed this frame. */
  render(scene: Scene, fpvCamera: PerspectiveCamera, dt: number): void {
    const r = this.renderer;

    // 1) Drone camera -> video texture, with XR switched off for this pass.
    const xrTarget = r.getRenderTarget();
    r.xr.enabled = false;
    const aspect = fpvCamera.aspect;
    fpvCamera.aspect = 16 / 9;
    fpvCamera.updateProjectionMatrix();
    r.setRenderTarget(this.target);
    r.render(scene, fpvCamera);
    fpvCamera.aspect = aspect;
    fpvCamera.updateProjectionMatrix();
    r.setRenderTarget(xrTarget);
    r.xr.enabled = true;

    // 2) Goggles: head-locked screen in a dark room.
    this.osdTimer -= dt;
    if (this.osdTimer <= 0) {
      this.osdTimer = 1 / 15;
      this.drawOsd();
    }
    r.render(this.gogglesScene, this.headCam);
  }

  /** Copy the HTML OSD into the goggle picture, Betaflight-style white text with outline. */
  private drawOsd(): void {
    const c = this.osdCanvas.getContext('2d')!;
    const W = this.osdCanvas.width;
    const H = this.osdCanvas.height;
    c.clearRect(0, 0, W, H);
    c.font = '700 30px "JetBrains Mono", ui-monospace, monospace';
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    const text = (id: string) => (document.getElementById(id)?.innerText ?? '').trim();
    const draw = (s: string, x: number, y: number, align: CanvasTextAlign, color = '#fff') => {
      c.textAlign = align;
      s.split('\n').forEach((line, i) => {
        c.strokeText(line, x, y + i * 36);
        c.fillStyle = color;
        c.fillText(line, x, y + i * 36);
      });
    };
    // Same layout as the Real FPV OSD, inside the sharp middle of the goggle screen.
    const a = this.osdArea;
    const l = (W * (1 - a)) / 2 + W * a * 0.05;
    const r = W - l;
    const t = (H * (1 - a)) / 2 + H * a * 0.06 + 24;
    const b = H - (H * (1 - a)) / 2 - H * a * 0.07;
    draw(text('osd-batt'), l, t, 'left');
    draw(text('osd-time') + '\n' + text('osd-race'), W / 2, t, 'center');
    draw(text('osd-mah'), r, t, 'right');
    draw(text('osd-signal') + '\n' + text('osd-thr'), l, b - 36, 'left');
    draw(text('osd-arm') + '\n' + text('osd-mode'), W / 2, b - 36, 'center');
    draw(text('osd-alt') + '\n' + text('osd-speed') + '\n' + text('osd-home'), r, b - 72, 'right');
    draw('+', W / 2, H / 2 + 10, 'center');
    const msgEl = document.getElementById('osd-msg');
    if (msgEl?.innerText.trim()) {
      const color = msgEl.className === 'warn' ? '#ffd33d' : msgEl.className === 'bad' ? '#ff4d4d' : '#fff';
      draw(msgEl.innerText.trim(), W / 2, H * 0.32, 'center', color);
    }
    // Analog breakup shows in the goggles too.
    const analog = Number(document.getElementById('analog')?.style.opacity || 0);
    if (analog > 0.01) {
      const img = c.getImageData(0, 0, W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 16) {
        if (Math.random() < analog * 0.6) {
          const v = Math.random() * 255;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255 * analog;
        }
      }
      c.putImageData(img, 0, 0);
    }
    this.osdTexture.needsUpdate = true;
  }
}
