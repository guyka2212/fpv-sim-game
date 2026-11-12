import { CircleGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from 'three';
import type { Skin, SkinPart } from '../progress/skins';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { QuadPhysics } from '../physics/quad';
import { DroneSpec, motorLayout } from './specs';

const loader = new GLTFLoader();
const INCH = 0.0254;

/** The visible drone: GLB body, spinning props, and motion-blur discs at high RPM. */
export class DroneModel {
  readonly root = new Group();
  private props: Object3D[] = [];
  private discs: Mesh[] = [];
  private bladeMats: MeshStandardMaterial[] = [];
  private discMat: MeshBasicMaterial;
  /** Parts that sit in front of the FPV camera and are hidden in FPV view. */
  private fpvHidden: Object3D[] = [];
  /** Recolourable materials by part, with their original look (for the Stock skin). */
  private parts = new Map<SkinPart, { mat: MeshStandardMaterial; color: Color; metalness: number; roughness: number; emissive: Color }[]>();
  skinId = 'stock';

  private constructor(readonly spec: DroneSpec) {
    this.discMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
  }

  static async load(spec: DroneSpec): Promise<DroneModel> {
    const m = new DroneModel(spec);
    const gltf = await loader.loadAsync(spec.model);
    const scene = gltf.scene;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    m.root.add(scene);

    const propR = (spec.prop.diameterIn * INCH) / 2;
    for (const lm of motorLayout(spec)) {
      const p = scene.getObjectByName(`prop_${lm.name}`);
      if (!p) throw new Error(`model ${spec.model} is missing prop_${lm.name}`);
      m.props.push(p);
      p.traverse((o) => {
        const mesh = o as Mesh;
        const mat = mesh.isMesh ? (mesh.material as MeshStandardMaterial) : null;
        if (mat && mat.name === 'prop' && !m.bladeMats.includes(mat)) {
          mat.transparent = true;
          m.bladeMats.push(mat);
          m.discMat.color.copy(mat.color);
        }
      });
      const disc = new Mesh(new CircleGeometry(propR, 32), m.discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.copy(p.position);
      disc.renderOrder = 2;
      p.parent!.add(disc);
      m.discs.push(disc);
    }
    for (const name of ['fpv_cam', 'cam_mount']) {
      const o = scene.getObjectByName(name);
      if (o) m.fpvHidden.push(o);
    }
    return m;
  }

  /** Recolours the drone; 'stock' (or a skin without a part) puts the original colour back. */
  applySkin(skin: Skin): void {
    if (!this.parts.size) {
      const PARTS: SkinPart[] = ['bell', 'prop', 'tpu', 'battery', 'duct', 'carbon'];
      this.root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[]) {
          const part = PARTS.find((p) => mat.name === p || mat.name.startsWith(`${p}.`));
          if (!part || !mat.color) continue;
          const list = this.parts.get(part) ?? [];
          if (!list.some((x) => x.mat === mat)) list.push({ mat, color: mat.color.clone(), metalness: mat.metalness, roughness: mat.roughness, emissive: mat.emissive.clone() });
          this.parts.set(part, list);
        }
      });
    }
    this.skinId = skin.id;
    for (const [part, list] of this.parts) {
      const c = skin.colors[part];
      for (const x of list) {
        if (c) x.mat.color.setRGB(c[0], c[1], c[2]);
        else x.mat.color.copy(x.color);
        const shiny = skin.metal && part !== 'battery';
        x.mat.metalness = shiny ? 1 : x.metalness;
        x.mat.roughness = shiny ? 0.18 : x.roughness;
        const glow = skin.glow && (part === 'prop' || part === 'duct' || part === 'tpu') && c;
        if (glow) x.mat.emissive.setRGB(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
        else x.mat.emissive.copy(x.emissive);
      }
    }
    const prop = this.parts.get('prop')?.[0];
    if (prop) this.discMat.color.copy(prop.mat.color);
  }

  /** In FPV view the camera is hidden, and so are open props (ducted ones stay in shot). */
  update(quad: QuadPhysics, fpv: boolean): void {
    const hideProps = fpv && !this.spec.ducted;
    this.root.position.copy(quad.pos);
    this.root.quaternion.copy(quad.quat);
    let avg = 0;
    quad.motors.forEach((mo, i) => {
      this.props[i].rotation.y = mo.angle;
      avg += mo.omega;
    });
    avg /= 4;
    // Blades fade into a blurred disc as they spin up.
    const blur = Math.min(1, Math.max(0, (avg - 150) / 900));
    for (const mat of this.bladeMats) mat.opacity = 1 - blur * 0.8;
    this.discMat.opacity = blur * 0.28;
    for (const o of this.fpvHidden) o.visible = !fpv;
    for (const p of this.props) p.visible = !hideProps;
    for (const d of this.discs) d.visible = !hideProps;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mt) => mt.dispose());
      }
    });
  }
}
