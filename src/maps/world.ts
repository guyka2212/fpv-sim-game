import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CollisionWorld } from '../physics/collision';
import { fixSkyForReversedDepth, freezeStatic } from '../render/pipeline';
import type { MapDef } from './maps';
import { detail, surfaceTag, waterNormal } from './textures';
import { Traffic } from './traffic';
import { WaterBodies } from './water';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
/** Large surfaces where a repeating tile would show: they get a second, far larger copy of it. */
const MACRO = new Set(['grass', 'dirt', 'asphalt', 'concrete', 'rock', 'snow', 'tile', 'plaster']);

/**
 * Multiply the colour by the same detail texture sampled 27x larger, so a 3 m tile repeated over
 * a field reads as patchy ground instead of a grid.
 */
function breakUpTiling(mat: MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      #ifdef USE_MAP
        float macroA = texture2D(map, vMapUv * 0.037).g;
        float macroB = texture2D(map, vMapUv * 0.011 + 0.31).g;
        diffuseColor.rgb *= mix(0.78, 1.12, macroA * 0.6 + macroB * 0.4);
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => 'macro';
}
const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/** Meshes with more triangles than this are split into tiles (smaller ones cost more in draw calls than culling saves). */
const SPLIT_TRIANGLES = 40000;
const TILE = 220;

/**
 * Maps are exported as one mesh per material spanning the whole map, so the renderer can't skip
 * what is behind the camera or outside the shadow area. Big meshes are cut into 100 m tiles (by
 * triangle centre) so frustum culling works for both the view and the sun's shadow pass.
 */
function splitIntoTiles(root: Object3D): void {
  const big: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.geometry.index && m.geometry.index.count / 3 > SPLIT_TRIANGLES && !Array.isArray(m.material)) big.push(m);
  });
  for (const mesh of big) {
    const g = mesh.geometry;
    const index = g.index!;
    const pos = g.attributes.position;
    const tiles = new Map<string, number[]>();
    for (let t = 0; t < index.count; t += 3) {
      _a.fromBufferAttribute(pos, index.getX(t));
      _b.fromBufferAttribute(pos, index.getX(t + 1));
      _c.fromBufferAttribute(pos, index.getX(t + 2));
      _a.add(_b).add(_c).divideScalar(3).applyMatrix4(mesh.matrixWorld);
      const key = `${Math.floor(_a.x / TILE)},${Math.floor(_a.z / TILE)}`;
      let list = tiles.get(key);
      if (!list) tiles.set(key, (list = []));
      list.push(t);
    }
    if (tiles.size < 2) continue;
    const names = Object.keys(g.attributes);
    for (const tris of tiles.values()) {
      // Only the vertices this tile uses, renumbered.
      const remap = new Map<number, number>();
      const idx: number[] = [];
      for (const t of tris) {
        for (let k = 0; k < 3; k++) {
          const v = index.getX(t + k);
          let n = remap.get(v);
          if (n === undefined) remap.set(v, (n = remap.size));
          idx.push(n);
        }
      }
      const sub = new BufferGeometry();
      for (const name of names) {
        const src = g.attributes[name] as BufferAttribute;
        const size = src.itemSize;
        const out = new Float32Array(remap.size * size);
        if ((src as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute || src.normalized) {
          for (const [from, to] of remap) for (let k = 0; k < size; k++) out[to * size + k] = src.getComponent(from, k);
        } else {
          // Plain float arrays (what the map files hold): copy straight from the array.
          const a = src.array;
          for (const [from, to] of remap) for (let k = 0; k < size; k++) out[to * size + k] = a[from * size + k];
        }
        sub.setAttribute(name, new BufferAttribute(out, size, false));
      }
      sub.setIndex(remap.size > 65535 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1));
      const tile = new Mesh(sub, mesh.material);
      tile.name = mesh.name;
      tile.position.copy(mesh.position);
      tile.quaternion.copy(mesh.quaternion);
      tile.scale.copy(mesh.scale);
      tile.castShadow = mesh.castShadow;
      tile.receiveShadow = mesh.receiveShadow;
      tile.userData = { ...mesh.userData };
      mesh.parent!.add(tile);
    }
    mesh.removeFromParent();
    g.dispose();
  }
  root.updateMatrixWorld(true);
}

/**
 * Once a static mesh is on the GPU its vertex arrays are only dead weight in JS memory (the
 * collision and water BVHs keep their own copies), so they are dropped after upload. Bounds are
 * computed first: culling needs them.
 */
function releaseAfterUpload(root: Object3D): void {
  const free = function (this: BufferAttribute) {
    (this as unknown as { array: ArrayLike<number> | null }).array = null;
  };
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    for (const a of Object.values(g.attributes)) (a as BufferAttribute).onUpload(free);
    g.index?.onUpload(free);
  });
}

/** A loaded map: geometry, lights, sky, collision BVH, spawn point and race gates. */
export class World {
  readonly group = new Group();
  readonly spawn = new Vector3();
  spawnYaw = 0;
  readonly gates: Object3D[] = [];
  readonly sun: DirectionalLight;
  readonly sunDir = new Vector3();
  collision!: CollisionWorld;
  /** Lakes, rivers and pools: not solid, the drone can go in. */
  water!: WaterBodies;
  /** Race cars lapping the track, on maps that have them. */
  traffic: Traffic | null = null;
  private envTexture: Texture | null = null;

  private constructor(
    readonly def: MapDef,
    private readonly scene: Scene,
  ) {
    const el = (def.sun.elevation * Math.PI) / 180;
    const az = (def.sun.azimuth * Math.PI) / 180;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.sun = new DirectionalLight(0xfff3e0, def.sun.intensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const r = def.indoor ? 14 : 45;
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = def.indoor ? 0.01 : 0.04;
  }

  static async load(def: MapDef, scene: Scene, renderer: WebGLRenderer): Promise<World> {
    const w = new World(def, scene);
    await w.build(renderer);
    return w;
  }

  private async build(renderer: WebGLRenderer): Promise<void> {
    const def = this.def;
    const gltf = await loader.loadAsync(def.file);
    const root = gltf.scene;

    const markers: Object3D[] = [];
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => this.dressMaterial(m));
      } else if (o.name.startsWith('gate_') || o.name.startsWith('light_') || o.name === 'spawn') {
        markers.push(o);
      }
    });
    this.group.add(root);
    root.updateMatrixWorld(true);
    splitIntoTiles(root);

    for (const m of markers) {
      if (m.name === 'spawn') {
        m.getWorldPosition(this.spawn);
        _v.set(0, 0, -1).applyQuaternion(m.getWorldQuaternion(new Quaternion()));
        this.spawnYaw = Math.atan2(-_v.x, -_v.z);
      } else if (m.name.startsWith('gate_')) {
        this.gates.push(m);
      } else if (m.name.startsWith('light_')) {
        const l = new PointLight(0xffe8c8, 2.2, 9, 1.6);
        m.getWorldPosition(l.position);
        this.group.add(l);
      }
    }
    this.gates.sort((a, b) => a.name.localeCompare(b.name));

    this.water = new WaterBodies(root);
    this.collision = new CollisionWorld(root);
    this.water.floor = this.collision;
    releaseAfterUpload(root);
    freezeStatic(root);
    // Cars move, so they stay out of the static collision BVH (see Traffic.collide).
    if (def.traffic) this.traffic = await Traffic.load(def.traffic, this.group);

    // Sky + image-based lighting from the same sky.
    const sky = new Sky();
    sky.scale.setScalar(def.cameraFar * 0.9);
    const u = sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    fixSkyForReversedDepth(sky);
    this.group.add(sky);

    const pmrem = new PMREMGenerator(renderer);
    const envScene = new Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(100);
    envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    envSky.material.uniforms.turbidity.value = 6;
    envSky.material.uniforms.rayleigh.value = 1.4;
    envScene.add(envSky);
    this.envTexture = pmrem.fromScene(envScene).texture;
    pmrem.dispose();

    const hemi = new HemisphereLight(0xdbe8f5, 0x5a4a35, this.def.indoor ? 1.0 : 0.6);
    this.group.add(hemi, this.sun, this.sun.target);
  }

  private dressMaterial(m: Material): void {
    const mat = m as MeshStandardMaterial;
    if (!mat.isMeshStandardMaterial) return;
    const name = mat.name.toLowerCase();
    const d = mat.map ? null : detail(name);
    if (d) {
      mat.map = d.map;
      mat.normalMap = d.normal;
      mat.normalScale.setScalar(d.bump);
      if (MACRO.has(surfaceTag(name))) breakUpTiling(mat);
    }
    if (name.startsWith('water')) {
      mat.roughness = 0.04;
      mat.metalness = 0.1;
      mat.envMapIntensity = 1.6;
      mat.normalMap = waterNormal();
      mat.normalScale.setScalar(0.35);
    }
    // Lamps and signs: bright enough to pass the bloom threshold (the sky stays under it).
    if (mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0) mat.emissiveIntensity *= 8;
    // Building windows: opaque, mirror-like, reflecting the sky.
    if (name.startsWith('window')) {
      mat.roughness = 0.06;
      mat.metalness = 0.7;
      mat.envMapIntensity = 2.2;
    }
    if (name.startsWith('glass')) {
      mat.transparent = true;
      mat.depthWrite = false;
      mat.envMapIntensity = 1.5;
    }
    mat.needsUpdate = true;
  }

  attach(): void {
    const def = this.def;
    this.scene.add(this.group);
    this.scene.fog = new Fog(def.fog.color, def.fog.near, def.fog.far);
    this.scene.background = new Color(def.fog.color);
    this.scene.environment = this.envTexture;
    // The physical sky is very bright; keep its reflections in proportion to the sun.
    this.scene.environmentIntensity = def.indoor ? 0.35 : 0.22;
  }

  /** Tone-mapping exposure that suits this map's light. */
  get exposure(): number {
    return this.def.indoor ? 0.75 : 0.5;
  }

  detach(): void {
    this.scene.remove(this.group);
    this.scene.fog = null;
    this.scene.environment = null;
  }

  /** Graphics quality: sun shadow map size, 0 = no shadows. */
  setShadowSize(size: number): void {
    const on = size > 0;
    if (this.sun.castShadow !== on) this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Per-frame animation (water ripples). */
  animate(dt: number): void {
    const w = waterNormal();
    w.offset.x += dt * 0.012;
    w.offset.y += dt * 0.007;
  }

  /** Keep the shadow camera centred on the drone. */
  followShadow(target: Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 150);
  }

  dispose(): void {
    this.detach();
    this.traffic?.dispose();
    this.group.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.envTexture?.dispose();
  }
}
