// デジタルツインの描画の計画と、three のオブジェクトの組み立て。FR-031 / FR-036
//   - 表示中のレベルの項目だけを生成する（遅延生成。下位のレベルは、カメラが近づくまで作らない）
//   - 同じ形・同じ色・同じ階層の項目は、1 つの InstancedMesh（1 回のインスタンス描画）にまとめる
//   - 不透明度は、レベルごと（クロスフェード）と、台は下位が現れるほど薄く（上位の外装は透過）する
// 計画（planDraw）は three に依存しない純粋な関数。組み立て（buildDrawables）だけが three を使う。
import * as THREE from 'three';
import type { TwinLayout, TwinObject, TwinShape } from './entityLayout';
import { plateOpacity } from './lod';
import { twinGeometry, twinScale } from './twinGeometry';

export interface DrawGroup {
  key: string;
  shape: TwinShape;
  color: string;
  depth: number;
  platform: boolean;
  /** このグループの項目の ID（パックの順序） */
  ids: string[];
}

/** 描画の計画。生成するレベルの項目だけを、形・色・階層でまとめる。 */
export function planDraw(layout: TwinLayout, colorOf: (o: TwinObject) => string, isRenderedDepth: (depth: number) => boolean): DrawGroup[] {
  const groups = new Map<string, DrawGroup>();
  for (const o of layout.objects) {
    if (!isRenderedDepth(o.depth)) continue;
    const color = colorOf(o);
    const key = `${o.shape}|${color}|${o.depth}|${o.platform ? 'p' : 'l'}`;
    let g = groups.get(key);
    if (!g) { g = { key, shape: o.shape, color, depth: o.depth, platform: o.platform, ids: [] }; groups.set(key, g); }
    g.ids.push(o.entityId);
  }
  return [...groups.values()];
}

export interface DrawStats {
  /** 生成した項目の数 */
  objects: number;
  /** 描画の呼び出し（メッシュ）の数。インスタンス描画は 1 つと数える */
  drawCalls: number;
  /** インスタンス描画（InstancedMesh）の数 */
  instancedMeshes: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const identityQ = new THREE.Quaternion();

/** 計画から three のオブジェクトを組み立てる。2 つ以上の項目があるグループは InstancedMesh、1 つなら Mesh。 */
export function buildDrawables(layout: TwinLayout, groups: readonly DrawGroup[]): THREE.Group {
  const root = new THREE.Group();
  root.name = 'entity-twin-instances';
  for (const g of groups) {
    const material = new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.45, metalness: 0.15, transparent: true, opacity: 1 });
    material.userData = { depth: g.depth, platform: g.platform };
    const geometry = twinGeometry(g.shape);
    const objs = g.ids.map((id) => layout.byId.get(id)!).filter(Boolean);
    let mesh: THREE.Mesh | THREE.InstancedMesh;
    if (objs.length >= 2) {
      const inst = new THREE.InstancedMesh(geometry, material, objs.length);
      objs.forEach((o, i) => {
        tmpPos.set(...o.position);
        tmpScale.set(...twinScale(o.shape, o.size));
        tmpMatrix.compose(tmpPos, identityQ, tmpScale);
        inst.setMatrixAt(i, tmpMatrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      mesh = inst;
    } else {
      const o = objs[0]!;
      mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...o.position);
      mesh.scale.set(...twinScale(o.shape, o.size));
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { ids: objs.map((o) => o.entityId), depth: g.depth, platform: g.platform };
    mesh.name = `lod-${g.key}`;
    root.add(mesh);
  }
  return root;
}

/**
 * レベルごとの不透明度を材質に反映する。台は、下位のレベルが現れるほど薄くなる。
 * dim は、選択があるとき関連しない項目を薄くする係数（1 は薄くしない）。
 */
export function setDrawOpacity(root: THREE.Object3D, levelOpacity: (depth: number) => number, dim = 1): void {
  for (const child of root.children) {
    const m = child as THREE.Mesh;
    const { depth, platform } = m.userData as { depth: number; platform: boolean };
    const base = levelOpacity(depth) * (platform ? plateOpacity(levelOpacity(depth + 1)) : 1) * dim;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.opacity = base;
    m.visible = base > 0.001;
  }
}

export function drawStats(root: THREE.Object3D): DrawStats {
  let objects = 0;
  let instancedMeshes = 0;
  for (const child of root.children) {
    objects += ((child.userData as { ids?: string[] }).ids ?? []).length;
    if ((child as THREE.InstancedMesh).isInstancedMesh) instancedMeshes++;
  }
  return { objects, drawCalls: root.children.length, instancedMeshes };
}

/** 当たったメッシュ（とインスタンス番号）から、項目の ID を求める */
export function entityIdOfHit(object: THREE.Object3D, instanceId?: number): string | undefined {
  const ids = (object.userData as { ids?: string[] }).ids;
  return ids?.[instanceId ?? 0];
}

/** 作ったオブジェクトの材質を破棄する（ジオメトリは共有なので破棄しない） */
export function disposeDrawables(root: THREE.Object3D): void {
  for (const child of root.children) {
    const mat = (child as THREE.Mesh).material;
    if (mat instanceof THREE.Material) mat.dispose();
    if ((child as THREE.InstancedMesh).isInstancedMesh) (child as THREE.InstancedMesh).dispose();
  }
}
