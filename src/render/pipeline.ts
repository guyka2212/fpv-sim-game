import { Camera, DepthTexture, FloatType, HalfFloatType, Material, Object3D, PerspectiveCamera, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, WebGLRenderer } from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  /** Render resolution relative to the window's CSS pixels (ultra also follows the screen's DPI). */
  scale: number;
  msaa: number;
  /** Sun shadow map size; 0 = no shadows. */
  shadowSize: number;
  /** How often the shadow map is redrawn (Hz); 0 = every frame. */
  shadowHz: number;
  /** Ambient occlusion (contact shadows in corners and under objects) at this share of the resolution; 0 = off. */
  ao: number;
  aoSamples: number;
  /** Glow around lights, signs and sun glints, computed at this share of the resolution; 0 = off. */
  bloom: number;
}

export const QUALITY: Record<GraphicsQuality, QualityPreset> = {
  ultra: { scale: Math.min(window.devicePixelRatio, 2), msaa: 4, shadowSize: 4096, shadowHz: 0, ao: 0.75, aoSamples: 16, bloom: 0.5 },
  high: { scale: 1, msaa: 4, shadowSize: 2048, shadowHz: 144, ao: 0.5, aoSamples: 8, bloom: 0.33 },
  medium: { scale: 1, msaa: 0, shadowSize: 1024, shadowHz: 90, ao: 0, aoSamples: 0, bloom: 0.25 },
  low: { scale: 0.75, msaa: 0, shadowSize: 0, shadowHz: 0, ao: 0, aoSamples: 0, bloom: 0 },
};

/**
 * Renders the scene into an HDR target with a 32-bit float, reversed depth buffer, adds ambient
 * occlusion (from that depth buffer, no extra scene pass) and bloom, then tone-maps and grades it
 * onto the canvas. Reversed float depth keeps the 4 mm-to-3 km camera range free of
 * z-fighting at full speed; the logarithmic depth buffer it replaces writes gl_FragDepth, which
 * turns off the GPU's early depth test and cost about half the frame rate. Without
 * EXT_clip_control the renderer falls back to the logarithmic buffer.
 */
export class Pipeline {
  readonly renderer: WebGLRenderer;
  readonly reversedDepth: boolean;
  private target: WebGLRenderTarget;
  /** Scene + AO, when AO is on. */
  private aoTarget: WebGLRenderTarget | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private aoRadius = 1.5;
  private readonly output = new OutputPass();
  private width = 1;
  private height = 1;
  private preset: QualityPreset = QUALITY.high;
  private lastShadow = 0;
  private inFlight: WebGLSync[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false, // MSAA lives in the scene target
      reversedDepthBuffer: true,
      logarithmicDepthBuffer: true, // used only where reversed depth is unsupported
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.reversedDepth = this.renderer.capabilities.reversedDepthBuffer;
    this.renderer.shadowMap.autoUpdate = false; // redrawn by render() at the preset's rate
    this.target = this.makeTarget();
    this.output.renderToScreen = true;
    gradeOutput(this.output);
  }

  /** World-space reach of the ambient occlusion (metres): small indoors, larger outside. */
  setAoRadius(r: number): void {
    this.aoRadius = r;
    this.gtao?.updateGtaoMaterial({ radius: r });
  }

  get quality(): QualityPreset {
    return this.preset;
  }

  setQuality(q: GraphicsQuality): void {
    const p = QUALITY[q] ?? QUALITY.high;
    const msaaChanged = p.msaa !== this.preset.msaa || (p.ao > 0) !== (this.preset.ao > 0);
    this.preset = p;
    if (msaaChanged) {
      this.target.dispose();
      this.target = this.makeTarget();
    }
    this.setSize(this.width, this.height);
  }

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    const s = this.preset.scale;
    const tw = Math.max(1, Math.round(w * s));
    const th = Math.max(1, Math.round(h * s));
    this.target.setSize(tw, th);
    this.setupEffects(tw, th);
  }

  private setupEffects(tw: number, th: number): void {
    const p = this.preset;
    // AO reads the reversed float depth buffer; the logarithmic fallback would need its own pass.
    const wantAo = p.ao > 0 && this.reversedDepth;
    if (wantAo) {
      if (!this.aoTarget) this.aoTarget = new WebGLRenderTarget(tw, th, { type: HalfFloatType, depthBuffer: false });
      this.aoTarget.setSize(tw, th);
      const aw = Math.max(1, Math.round(tw * p.ao));
      const ah = Math.max(1, Math.round(th * p.ao));
      if (!this.gtao) {
        this.gtao = new GTAOPass(new Scene(), new PerspectiveCamera(), aw, ah, { depthTexture: this.target.depthTexture! });
        this.gtao.blendIntensity = 0.85;
      } else this.gtao.setGBuffer(this.target.depthTexture!, undefined);
      this.gtao.updateGtaoMaterial({ radius: this.aoRadius, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: p.aoSamples });
      this.gtao.updatePdMaterial({ samples: p.aoSamples >= 16 ? 12 : 6, rings: 2, radius: 6 });
      this.gtao.setSize(aw, ah);
    } else {
      this.gtao?.dispose();
      this.gtao = null;
      this.aoTarget?.dispose();
      this.aoTarget = null;
    }
    if (p.bloom > 0) {
      const bw = Math.max(1, Math.round(tw * p.bloom));
      const bh = Math.max(1, Math.round(th * p.bloom));
      if (!this.bloom) {
        this.bloom = new UnrealBloomPass(new Vector2(bw, bh), 0.3, 0.4, 10);
        softKneeBloom(this.bloom);
      }
      this.bloom.setSize(bw, bh);
    } else {
      this.bloom?.dispose();
      this.bloom = null;
    }
  }

  /** Scene → HDR target → tone mapping onto the canvas. */
  render(scene: Scene, camera: Camera): void {
    const r = this.renderer;
    // The drone is the only thing that moves, so a shadow map redrawn at a fixed rate looks the same.
    const hz = this.preset.shadowHz;
    const now = performance.now();
    r.shadowMap.needsUpdate = !hz || now - this.lastShadow >= 1000 / hz - 0.5;
    if (r.shadowMap.needsUpdate) this.lastShadow = now;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    let src = this.target;
    if (this.gtao && this.aoTarget && (camera as PerspectiveCamera).isPerspectiveCamera) {
      this.gtao.camera = camera;
      this.gtao.render(r, this.aoTarget, this.target, 0, false);
      src = this.aoTarget;
    }
    // Only lights, signs and the sun pass the threshold: the sky stays below it.
    if (this.bloom) this.bloom.render(r, null!, src, 0, false);
    r.setRenderTarget(null);
    this.output.render(r, null!, src, 0, false);
    const gl = r.getContext() as WebGL2RenderingContext;
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (fence) this.inFlight.push(fence);
    gl.flush();
  }

  /**
   * False while the GPU still has more than one finished-on-the-CPU frame to draw. Chromium never
   * makes WebGL wait for the GPU, so without this a GPU-bound game keeps queueing frames: the
   * browser's own present waits behind that queue and the screen shows a few frames a second
   * while the loop "runs" at hundreds.
   */
  gpuReady(): boolean {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    while (this.inFlight.length) {
      const f = this.inFlight[0];
      if (gl.getSyncParameter(f, gl.SYNC_STATUS) !== gl.SIGNALED) break;
      gl.deleteSync(f);
      this.inFlight.shift();
    }
    return this.inFlight.length < 2;
  }

  private makeTarget(): WebGLRenderTarget {
    const depthTexture = new DepthTexture(1, 1, FloatType);
    return new WebGLRenderTarget(Math.max(1, this.width), Math.max(1, this.height), {
      type: HalfFloatType,
      samples: this.preset.msaa,
      depthTexture,
      stencilBuffer: false,
      resolveDepthBuffer: this.preset.ao > 0, // only the AO pass reads depth afterwards
    });
  }
}

/**
 * Bloom only from the part of each pixel above the threshold, capped, so the sun disk (thousands of
 * times brighter than the sky) gives a glow instead of washing the whole picture white.
 */
function softKneeBloom(bloom: UnrealBloomPass): void {
  const m = (bloom as unknown as { materialHighPassFilter: ShaderMaterial }).materialHighPassFilter;
  m.fragmentShader = m.fragmentShader.replace(
    'gl_FragColor = mix( outputColor, texel, alpha );',
    'vec3 over = max( texel.rgb - vec3( luminosityThreshold ), 0.0 ); gl_FragColor = vec4( min( over, vec3( 1.2 ) ), 1.0 );',
  );
  m.needsUpdate = true;
}

/** Light colour grade after tone mapping: a touch more saturation, contrast and warmth, and a soft vignette. */
function gradeOutput(pass: OutputPass): void {
  const m = pass.material;
  m.fragmentShader = m.fragmentShader.replace(
    /}\s*$/,
    `
      vec3 graded = gl_FragColor.rgb;
      float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      graded = mix(vec3(luma), graded, 1.15);
      graded = mix(graded, graded * graded * (3.0 - 2.0 * graded), 0.3);
      graded *= vec3(1.035, 1.0, 0.95);
      vec2 vq = vUv - 0.5;
      graded *= 1.0 - 0.22 * smoothstep(0.18, 0.75, dot(vq, vq) * 2.0);
      gl_FragColor.rgb = clamp(graded, 0.0, 1.0);
    }`,
  );
  m.needsUpdate = true;
}

/**
 * Three's Sky pins itself to the far plane with z = w, which is the near plane once the depth
 * buffer is reversed. Put it at the reversed far plane (z = 0) instead.
 */
export function fixSkyForReversedDepth(sky: Object3D & { material: Material & { vertexShader: string } }): void {
  const m = sky.material;
  m.vertexShader = m.vertexShader.replace(
    'gl_Position.z = gl_Position.w;',
    '#ifdef USE_REVERSED_DEPTH_BUFFER\n\t\t\tgl_Position.z = 0.0;\n\t\t\t#else\n\t\t\tgl_Position.z = gl_Position.w;\n\t\t\t#endif',
  );
  m.needsUpdate = true;
}

/** Static map geometry: compute its matrices once instead of every frame. */
export function freezeStatic(root: Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => (o.matrixAutoUpdate = false));
}
