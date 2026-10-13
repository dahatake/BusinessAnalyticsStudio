// デジタルツインの可視判定と画面座標（テスト用フック scene.objects、可視判定）。FR-020 / FR-025
// 描画（キャンバス）に頼らず、カメラのストア（cameraRig）と配置から、各項目が画面のどこにあり、見えているかを求める。
// 見える＝画面に入り、ほかの項目に隠れない点が 1 つ以上ある。その点にクリックすると、描画側（React Three Fiber のレイキャスト）でも同じ項目に当たる。
import * as THREE from 'three';
import { getEntityGraph } from '../selection/hooks';
import { relatedSet } from '../selection/model';
import { useSelectionStore } from '../store/selection';
import { syncLod, useLod } from '../store/lod';
import { CAMERA_FOV, rehomeIfPristine, useCameraRig } from './cameraRig';
import { pickPoints, type TwinLayout } from './entityLayout';
import { ensureCanvasInView, flushSceneSize, viewportAspect, viewportRect, type ViewportRect } from './sceneViewport';
import { getTwinLayout } from './twin';
import { twinGeometry, twinScale } from './twinGeometry';

export { registerSceneCanvas, viewportRect } from './sceneViewport';

export interface SceneObjectInfo {
  entityId: string;
  /** ページ上の座標（クリックできる点） */
  x: number;
  y: number;
  visible: boolean;
  /** 選択中またはホバー中 */
  highlighted: boolean;
  selected: boolean;
  related: boolean;
}

interface Probe { layout: TwinLayout; key: string; meshes: THREE.Mesh[] }
let probe: Probe | null = null;
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.1, 1000);
const raycaster = new THREE.Raycaster();

/** 投影の対象は、今生成している（表示中のレベルの）項目だけ。下位のレベルは、カメラが近づくまで生成しない（FR-036） */
function ensureProbe(layout: TwinLayout, key: string): Probe {
  if (probe && probe.layout === layout && probe.key === key) return probe;
  const mat = new THREE.MeshBasicMaterial();
  const meshes = layout.objects.filter((o) => key[o.depth] === '1').map((o) => {
    const m = new THREE.Mesh(twinGeometry(o.shape), mat);
    m.position.set(...o.position);
    m.scale.set(...twinScale(o.shape, o.size));
    m.userData.entityId = o.entityId;
    m.updateMatrixWorld(true);
    return m;
  });
  probe = { layout, key, meshes };
  return probe;
}

/** 今のカメラ（cameraRig）を投影用のカメラに写す */
function syncCamera(rect: ViewportRect): void {
  const s = useCameraRig.getState();
  camera.aspect = rect.width / rect.height;
  camera.position.set(...s.position);
  camera.lookAt(...s.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

const MARGIN = 6;
const v = new THREE.Vector3();
const dir = new THREE.Vector3();

/** デジタルツインの各項目の、画面上の位置・可視・強調。デジタルツインがない（パック未読込）ときは空。 */
export function sceneObjects(): SceneObjectInfo[] {
  const layout = getTwinLayout();
  if (!layout) return [];
  // 座標を返す前に、描画面の大きさ・見える位置・ホームを今の表示領域に合わせる（開いた直後・大きさを変えた直後でも、クリックが外れない。FR-146）
  flushSceneSize();
  ensureCanvasInView();
  rehomeIfPristine(viewportAspect());
  syncLod();
  const key = useLod.getState().key;
  const { meshes } = ensureProbe(layout, key);
  const rect = viewportRect();
  syncCamera(rect);
  const sel = useSelectionStore.getState();
  const selected = new Set(sel.selectedIds);
  const graph = getEntityGraph();
  const related = graph ? relatedSet(graph, sel.selectedIds, sel.mode) : null;
  const out: SceneObjectInfo[] = [];
  for (const o of layout.objects) {
    let found: { x: number; y: number } | null = null;
    let first: { x: number; y: number } | null = null;
    // 生成していないレベルの項目は、画面にない（visible=false）
    const generated = key[o.depth] === '1';
    for (const p of generated ? pickPoints(o) : []) {
      v.set(p[0], p[1], p[2]).project(camera);
      const x = rect.left + ((v.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - v.y) / 2) * rect.height;
      if (!first) first = { x, y };
      if (v.z < -1 || v.z > 1) continue;
      if (x < rect.left + MARGIN || x > rect.left + rect.width - MARGIN || y < rect.top + MARGIN || y > rect.top + rect.height - MARGIN) continue;
      dir.set(p[0], p[1], p[2]).sub(camera.position).normalize();
      raycaster.set(camera.position, dir);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (hit && hit.object.userData.entityId === o.entityId) { found = { x, y }; break; }
    }
    const at = found ?? first ?? { x: rect.left, y: rect.top };
    const isSel = selected.has(o.entityId);
    out.push({
      entityId: o.entityId,
      x: Math.round(at.x * 10) / 10,
      y: Math.round(at.y * 10) / 10,
      visible: found !== null,
      highlighted: isSel || sel.hoverId === o.entityId,
      selected: isSel,
      related: !isSel && (related?.has(o.entityId) ?? false),
    });
  }
  return out;
}
