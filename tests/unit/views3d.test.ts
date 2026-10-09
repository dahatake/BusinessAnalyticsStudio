// モノ・コトの 3D 表現と、フライスルー・シネマティック表現の単体・結合テスト。
// FR-020 AC-024 / FR-021 AC-025 / FR-023 AC-027 / FR-067 AC-082 / FR-025 AC-030（3D 側）/ FR-113 AC-139（地図側）
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasLocation } from '../../src/analysis/fallback';
import type { LoadedPack } from '../../src/data/loader';
import { HOURS, flowRate, intensity, particleCount, particleU, toFlowDefs } from '../../src/map/flows';
import { angularDistance, arcPoints, centroid, facesCamera, pointOnArc, spread, toFlat, toGlobe } from '../../src/map/geo';
import { mapDataOf } from '../../src/map/data';
import { initialView, particlesPerFlow } from '../../src/map/MapScene';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import { useAnimation } from '../../src/store/animation';
import { usePackStore } from '../../src/store/pack';
import { resetSelectionForTest, setUrlAdapter, useSelectionStore } from '../../src/store/selection';
import { formatHour, useTimeline } from '../../src/store/timeline';
import {
  CAMERA_FOV, cameraPathPoses, cancelFly, ease, flyPath, flyTo, framePose, goHome, homePose, liftFor, poseAt, rehomeIfPristine, setHome, setPose, startCameraFollow, syncFromCanvas, useCameraRig,
} from '../../src/three/cameraRig';
import { LAYOUT, buildTwinLayout, hashId, pickPoints, type TwinEntity } from '../../src/three/entityLayout';
import { INDUSTRY_PRESETS } from '../../src/three/presets';
import { QUALITIES, QUALITY_PROFILES } from '../../src/three/quality';
import { twinEntitiesOf, twinLayoutOf } from '../../src/three/twin';
import { registerSceneCanvas, sceneObjects } from '../../src/three/twinProbe';

function loadPack(kind: 'mono' | 'koto', edit?: (files: Record<string, any>) => void): PackData {
  const dir = path.resolve(__dirname, '../../examples', kind, 'public', 'data');
  const raw: Record<string, any> = {};
  for (const name of Object.keys(DATA_SCHEMAS)) raw[name] = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
  edit?.(raw);
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(raw[name]);
  return out as PackData;
}

function setPack(data: PackData): void {
  usePackStore.setState({ state: { status: 'ready', pack: { data, issues: [], disabledIds: [], isExample: true } as unknown as LoadedPack, warnings: [] } });
}

const ent = (id: string, type: string, parentId: string | null = null): TwinEntity => ({ id, type, name: id, parentId });

describe('FR-020 AC-024 デジタルツインの配置（階層から 3D と 2D 共通の配置）', () => {
  const mono = loadPack('mono');
  const layout = twinLayoutOf(mono);

  it('お手本パック（モノ）のすべてのエンティティが 1 つずつ配置され、部品が複数ある', () => {
    const ids = mono.entities.entities.map((e) => e.id);
    expect(layout.objects.map((o) => o.entityId)).toEqual(ids);
    expect(layout.objects.filter((o) => o.type === 'part').length).toBeGreaterThan(1);
  });

  it('子を持つ項目は台（platform）になり、子は台の上面に、台の範囲の内側に載る', () => {
    for (const o of layout.objects) {
      expect(o.platform, o.entityId).toBe(o.childIds.length > 0);
      for (const cid of o.childIds) {
        const c = layout.byId.get(cid)!;
        expect(c.parentId).toBe(o.entityId);
        expect(c.depth).toBe(o.depth + 1);
        expect(c.position[1] - c.size[1] / 2).toBeCloseTo(o.top, 6);
        for (const k of [0, 2] as const) {
          expect(c.position[k] - c.size[k] / 2, `${cid} の左/奥`).toBeGreaterThanOrEqual(o.position[k] - o.size[k] / 2 - 1e-9);
          expect(c.position[k] + c.size[k] / 2, `${cid} の右/手前`).toBeLessThanOrEqual(o.position[k] + o.size[k] / 2 + 1e-9);
        }
        // 台の前側の帯（クリックできる点）には、子を置かない
        expect(c.position[2] + c.size[2] / 2).toBeLessThanOrEqual(o.position[2] + o.size[2] / 2 - LAYOUT.front + 1e-9);
      }
    }
  });

  it('台でない項目どうし（親子でない）は、水平に重ならない', () => {
    const leaves = layout.objects.filter((o) => !o.platform);
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i]!, b = leaves[j]!;
      const overlapX = Math.abs(a.position[0] - b.position[0]) < (a.size[0] + b.size[0]) / 2 - 1e-9;
      const overlapZ = Math.abs(a.position[2] - b.position[2]) < (a.size[2] + b.size[2]) / 2 - 1e-9;
      expect(overlapX && overlapZ, `${a.entityId} と ${b.entityId}`).toBe(false);
    }
  });

  it('同じ入力から同じ配置になり（再現できる）、全体の境界・中心・半径が求まる', () => {
    expect(buildTwinLayout(twinEntitiesOf(mono))).toEqual(buildTwinLayout(twinEntitiesOf(mono)));
    expect(twinLayoutOf(mono)).toBe(layout); // 同じパックなら同じ参照
    expect(layout.radius).toBeGreaterThan(1);
    for (const o of layout.objects) {
      expect(o.position[0] - o.size[0] / 2).toBeGreaterThanOrEqual(layout.min[0] - 1e-9);
      expect(o.position[0] + o.size[0] / 2).toBeLessThanOrEqual(layout.max[0] + 1e-9);
    }
  });

  it('親が見つからない項目・親子の循環・空の入力でも、すべて最上位として配置できる', () => {
    const l = buildTwinLayout([ent('a', 'part', 'no-such'), ent('b', 'part', 'c'), ent('c', 'part', 'b'), ent('d', 'role', 'd')]);
    expect(l.objects.map((o) => o.entityId)).toEqual(['a', 'b', 'c', 'd']);
    expect(l.objects.every((o) => o.depth === 0 && o.parentId === null)).toBe(true);
    const empty = buildTwinLayout([]);
    expect(empty.objects).toEqual([]);
    expect(Number.isFinite(empty.radius)).toBe(true);
  });

  it('種別で形が決まり、同じ ID は同じ形・高さになる（乱数を使わない）', () => {
    expect(hashId('ent-mono-robot')).toBe(hashId('ent-mono-robot'));
    const l = buildTwinLayout([ent('r', 'role'), ent('s', 'site'), ent('x', 'other'), ent('p1', 'part'), ent('p2', 'part')]);
    expect(l.byId.get('r')!.shape).toBe('capsule');
    expect(l.byId.get('s')!.shape).toBe('box');
    expect(l.byId.get('x')!.shape).toBe('sphere');
    expect(['box', 'cylinder']).toContain(l.byId.get('p1')!.shape);
  });

  it('台の狙う点は前側の帯の上面から始まる（クリックできる点の候補）', () => {
    const plant = layout.byId.get('ent-mono-plant')!;
    const [x, y, z] = pickPoints(plant)[0]!;
    expect(y).toBe(plant.top);
    expect(z).toBeGreaterThan(plant.position[2] + plant.size[2] / 2 - LAYOUT.front);
    expect(x).toBeCloseTo(plant.position[0], 6);
  });
});

describe('FR-020 AC-024 / FR-025 AC-030 3D の項目の画面座標・可視・強調（scene.objects の元）', () => {
  beforeEach(() => {
    resetSelectionForTest();
    setUrlAdapter({ hash: () => '', push: () => undefined, replace: () => undefined });
    useAnimation.setState({ playing: false });
    setPack(loadPack('mono'));
    registerSceneCanvas(null);
    setPose(homePose(twinLayoutOf(loadPack('mono'))));
  });
  afterEach(() => setUrlAdapter());

  // FR-031 / FR-036: ホームでは、いちばん下の階層（部品の下の部品）はカメラが近づくまで生成しない。生成している階層の項目は、すべて見える
  it('ホームの視点では、生成している階層のすべての項目に「隠れずに画面に入る点」があり、その位置は画面の中にある', () => {
    const objs = sceneObjects();
    const l = twinLayoutOf(loadPack('mono'));
    const deepest = Math.max(...l.objects.map((o) => o.depth));
    expect(objs.length).toBe(loadPack('mono').entities.entities.length);
    for (const o of objs) {
      const depth = l.byId.get(o.entityId)!.depth;
      if (depth === deepest) { expect(o.visible, `${o.entityId} はホームでは生成されない`).toBe(false); continue; }
      expect(o.visible, `${o.entityId} が見えない`).toBe(true);
      expect(o.x).toBeGreaterThan(0);
      expect(o.x).toBeLessThan(960);
      expect(o.y).toBeGreaterThan(0);
      expect(o.y).toBeLessThan(540);
    }
  });

  it('選択した項目が highlighted になり、関連する項目は related（highlighted ではない）になる', () => {
    useSelectionStore.getState().select('ent-mono-robot', { origin: 'drawing2d', history: 'none' });
    const objs = sceneObjects();
    const by = (id: string) => objs.find((o) => o.entityId === id)!;
    expect(by('ent-mono-robot').highlighted).toBe(true);
    expect(by('ent-mono-robot').selected).toBe(true);
    expect(by('ent-mono-press').highlighted).toBe(false);
    expect(by('ent-mono-motor').related).toBe(true); // 親子は関連
  });

  it('カメラを向こう側へ向けると、画面に入らない項目は visible が false になる', () => {
    const l = twinLayoutOf(loadPack('mono'));
    setPose({ position: [l.center[0], 5, l.center[2] + 30], target: [l.center[0], 5, l.center[2] + 60] });
    expect(sceneObjects().every((o) => !o.visible)).toBe(true);
  });

  it('縦長の狭い画面（縦横比 0.6）でも、ホームの視点で全項目が画面に入る（ホームは縦横比に合わせる）', () => {
    const l = twinLayoutOf(loadPack('mono'));
    const rect = { left: 0, top: 0, width: 420, height: 700 };
    registerSceneCanvas({ getBoundingClientRect: () => rect as DOMRect });
    try {
      setHome(l, 420 / 700);
      const objs = sceneObjects();
      const deepest = Math.max(...l.objects.map((o) => o.depth));
      // 生成している階層（ホームでは最下位を除く）の全項目が画面に入る
      expect(objs.filter((o) => l.byId.get(o.entityId)!.depth < deepest).every((o) => o.visible), '縦長でも全体が入る').toBe(true);
      // 横長用のホームのままでは、縦長の画面で収まらない項目がある（ホームが縦横比に依ることの確認）
      setPose(homePose(l, 1.6));
      expect(sceneObjects().filter((o) => l.byId.get(o.entityId)!.depth < deepest).some((o) => !o.visible)).toBe(true);
    } finally {
      registerSceneCanvas({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) as DOMRect });
      sceneObjects();
      registerSceneCanvas(null);
    }
  });

  it('ホームのまま動かされていなければ縦横比に合わせて置き直し、利用者が動かした後は置き直さない', () => {
    const l = twinLayoutOf(loadPack('mono'));
    setHome(l, 1.6);
    const before = [...useCameraRig.getState().position];
    rehomeIfPristine(1.62); // 差が小さい（0.08 以下）ときは置き直さない
    expect(useCameraRig.getState().position).toEqual(before);
    rehomeIfPristine(0.6);
    expect(useCameraRig.getState().position).not.toEqual(before);
    expect(useCameraRig.getState().pristine).toBe(true);
    // 利用者が回転・拡大縮小した（キャンバスから書き戻された）後は、置き直さない
    const moved = useCameraRig.getState();
    syncFromCanvas({ position: [moved.position[0] + 1, moved.position[1], moved.position[2]], target: [...moved.target] });
    expect(useCameraRig.getState().pristine).toBe(false);
    const kept = [...useCameraRig.getState().position];
    rehomeIfPristine(2.4);
    expect(useCameraRig.getState().position).toEqual(kept);
  });

  it('可視の項目は、画面の中にクリックできる点を持ち、その点は投影の幅・高さの内側にある（低い視点でも）', () => {
    const l = twinLayoutOf(loadPack('mono'));
    setPose({ position: [l.center[0], 1.4, l.center[2] + 14], target: [...l.center] });
    const objs = sceneObjects();
    expect(objs.some((o) => o.visible)).toBe(true);
    for (const o of objs.filter((x) => x.visible)) { expect(o.x).toBeGreaterThan(0); expect(o.x).toBeLessThan(960); expect(o.y).toBeGreaterThan(0); expect(o.y).toBeLessThan(540); }
  });
});

describe('FR-023 AC-027 フライスルー遷移（カメラのストア）', () => {
  const l = twinLayoutOf(loadPack('mono'));
  const home = homePose(l);

  beforeEach(() => {
    vi.useFakeTimers();
    cancelFly();
    setPose(home);
    useAnimation.setState({ playing: true });
  });
  afterEach(() => { cancelFly(); vi.useRealTimers(); });

  it('poseAt は始点・終点を通り、途中で引く（lift）ので、全体を見渡してから近づく', () => {
    const to = framePose(l.byId.get('ent-mono-motor')!, home);
    const a = poseAt(home, to, 0);
    const b = poseAt(home, to, 1);
    for (let i = 0; i < 3; i++) { expect(a.position[i]).toBeCloseTo(home.position[i]!, 6); expect(b.position[i]).toBeCloseTo(to.position[i]!, 6); }
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
    const lift = liftFor(home, to);
    expect(lift).toBeGreaterThanOrEqual(0.12);
    expect(lift).toBeLessThanOrEqual(0.5);
    const dist = (p: { position: number[]; target: number[] }) => Math.hypot(p.position[0]! - p.target[0]!, p.position[1]! - p.target[1]!, p.position[2]! - p.target[2]!);
    const mid = poseAt(home, to, 0.5, lift);
    expect(dist(mid)).toBeGreaterThan((dist(home) + dist(to)) / 2);
  });

  it('再生中は連続的に移動し（途中の位置が複数ある）、moving が true から false に変わる', async () => {
    const to = framePose(l.byId.get('ent-mono-motor')!, home);
    const seen = new Set<string>();
    flyTo(to);
    expect(useCameraRig.getState().moving).toBe(true);
    for (let i = 0; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(50);
      seen.add(useCameraRig.getState().position.map((v) => v.toFixed(2)).join(','));
    }
    expect(seen.size, '途中の位置').toBeGreaterThanOrEqual(3);
    expect(useCameraRig.getState().moving).toBe(false);
    for (let i = 0; i < 3; i++) expect(useCameraRig.getState().position[i]).toBeCloseTo(to.position[i]!, 6);
  });

  it('アニメーション停止中は遷移を省き、移動後の視点に即座に切り替わる', () => {
    useAnimation.setState({ playing: false });
    const to = framePose(l.byId.get('ent-mono-motor')!, home);
    flyTo(to);
    const s = useCameraRig.getState();
    expect(s.moving).toBe(false);
    for (let i = 0; i < 3; i++) expect(s.position[i]).toBeCloseTo(to.position[i]!, 6);
  });

  it('移動の途中でアニメーションを停止すると、終点へ即座に切り替わる', async () => {
    const stop = startCameraFollow();
    try {
      const to = framePose(l.byId.get('ent-mono-motor')!, home);
      flyTo(to);
      await vi.advanceTimersByTimeAsync(200);
      expect(useCameraRig.getState().moving).toBe(true);
      useAnimation.setState({ playing: false });
      expect(useCameraRig.getState().moving).toBe(false);
      for (let i = 0; i < 3; i++) expect(useCameraRig.getState().position[i]).toBeCloseTo(to.position[i]!, 6);
    } finally { stop(); }
  });

  it('framePose は、末端の項目ほど近づき、選んだ項目を注視点にする（向きは保つ）', () => {
    const leaf = l.byId.get('ent-mono-motor')!;
    const plant = l.byId.get('ent-mono-plant')!;
    const f = framePose(leaf, home);
    expect(f.target).toEqual([leaf.position[0], leaf.position[1], leaf.position[2]]);
    const d = (p: typeof f) => Math.hypot(p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]);
    expect(d(f)).toBeLessThan(d(framePose(plant, home)));
    expect(d(f)).toBeLessThan(d(home));
  });

  it('カメラパスは、業種プリセットのキーフレームと同じ数のポーズになり、先頭の注視点と距離がホームに一致する', () => {
    const dist = (p: { position: number[]; target: number[] }) => Math.hypot(p.position[0]! - p.target[0]!, p.position[1]! - p.target[1]!, p.position[2]! - p.target[2]!);
    for (const p of INDUSTRY_PRESETS) {
      const poses = cameraPathPoses(p.cameraPath, l);
      expect(poses.length).toBe(p.cameraPath.length);
      for (let i = 0; i < 3; i++) expect(poses[0]!.target[i]).toBeCloseTo(home.target[i]!, 6);
      expect(dist(poses[0]!)).toBeCloseTo(dist(home), 6);
    }
    expect(new Set(INDUSTRY_PRESETS.map((p) => JSON.stringify(cameraPathPoses(p.cameraPath, l)))).size).toBe(INDUSTRY_PRESETS.length);
  });

  it('カメラパスの再生は、停止中なら最後のポーズへ即座に切り替わる（FR-071）', () => {
    useAnimation.setState({ playing: false });
    const poses = cameraPathPoses(INDUSTRY_PRESETS[1]!.cameraPath, l);
    const done = vi.fn();
    flyPath(poses, done);
    expect(done).toHaveBeenCalledTimes(1);
    const last = poses[poses.length - 1]!;
    for (let i = 0; i < 3; i++) expect(useCameraRig.getState().position[i]).toBeCloseTo(last.position[i]!, 6);
  });

  it('カメラパスの再生は、再生中なら各ポーズを順にたどって終わる', async () => {
    const poses = cameraPathPoses(INDUSTRY_PRESETS[1]!.cameraPath, l);
    const done = vi.fn();
    flyPath(poses, done);
    expect(useCameraRig.getState().moving).toBe(true);
    await vi.advanceTimersByTimeAsync(1400 * poses.length + 500);
    expect(done).toHaveBeenCalledTimes(1);
    expect(useCameraRig.getState().moving).toBe(false);
  });
});

describe('FR-025 AC-030 / FR-023 AC-027 選択に応じたカメラ移動（useSelection の origin と seq）', () => {
  let stop: () => void;
  const mono = loadPack('mono');
  beforeEach(() => {
    vi.useFakeTimers();
    resetSelectionForTest();
    setUrlAdapter({ hash: () => '', push: () => undefined, replace: () => undefined });
    useAnimation.setState({ playing: true });
    setPack(mono);
    stop = startCameraFollow();
    goHome();
  });
  afterEach(() => { stop(); cancelFly(); setUrlAdapter(); vi.useRealTimers(); });

  it('ほかのビュー（表）で選ぶとカメラがその項目へ移動し、3D 自身で選んだときは動かない', async () => {
    const before = [...useCameraRig.getState().position];
    useSelectionStore.getState().select('ent-mono-gripper', { origin: 'view3d', history: 'none' });
    expect(useCameraRig.getState().moving).toBe(false);
    expect(useCameraRig.getState().position).toEqual(before);
    useSelectionStore.getState().select('ent-mono-motor', { origin: 'table', history: 'none' });
    expect(useCameraRig.getState().moving).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    const o = twinLayoutOf(mono).byId.get('ent-mono-motor')!;
    expect(useCameraRig.getState().moving).toBe(false);
    expect(useCameraRig.getState().target).toEqual([o.position[0], o.position[1], o.position[2]]);
  });

  it('停止中に選ぶと、遷移なしで即座に切り替わる', () => {
    useAnimation.setState({ playing: false });
    useSelectionStore.getState().select('ent-mono-motor', { origin: 'table', history: 'none' });
    expect(useCameraRig.getState().moving).toBe(false);
    const o = twinLayoutOf(mono).byId.get('ent-mono-motor')!;
    expect(useCameraRig.getState().target).toEqual([o.position[0], o.position[1], o.position[2]]);
  });

  it('3D に項目のない ID（課題など）を選んでも、カメラは動かない', () => {
    const before = [...useCameraRig.getState().position];
    useSelectionStore.getState().select('issue-mono-001', { origin: 'table', history: 'none' });
    expect(useCameraRig.getState().moving).toBe(false);
    expect(useCameraRig.getState().position).toEqual(before);
  });

  it('パックが読み込まれると、全体を見渡すホームの視点になる', () => {
    const l = twinLayoutOf(mono);
    const h = homePose(l);
    expect(useCameraRig.getState().target).toEqual(h.target);
    expect(CAMERA_FOV).toBe(45);
  });
});

describe('FR-021 AC-025 流れ・時間軸・粒子', () => {
  it('時刻 hour の流れの量は peakHour で最大になり、24 時と 0 時がつながる（周回）', () => {
    expect(intensity(11, 11)).toBeCloseTo(1, 6);
    expect(intensity(11, 11)).toBeGreaterThan(intensity(15, 11));
    expect(intensity(23, 1)).toBeCloseTo(intensity(3, 1), 6); // 周回
    for (let h = 0; h < HOURS; h++) { expect(intensity(h, 7)).toBeGreaterThanOrEqual(0.08); expect(intensity(h, 7)).toBeLessThanOrEqual(1); }
  });

  it('時刻を動かすと、流れの量と粒子の数が変わる', () => {
    const f = toFlowDefs([{ id: 'f', from: 'a', to: 'b', label: 'x', kind: 'data', volume: 100, unit: '件/時', peakHour: 12 }])[0]!;
    expect(flowRate(f, 12)).toBe(100);
    expect(flowRate(f, 0)).toBeLessThan(flowRate(f, 12));
    expect(particleCount(f, 12, 500, 100)).toBeGreaterThan(particleCount(f, 3, 500, 100));
    expect(particleCount(f, 3, 500, 100)).toBeGreaterThanOrEqual(1);
  });

  it('粒子の位置は、時刻と経過時間だけで決まる（停止中＝経過時間が同じなら静止、再生中は動く）', () => {
    expect(particleU(5, 10, 3)).toBe(particleU(5, 10, 3));
    expect(particleU(5, 10, 3)).not.toBe(particleU(5, 11, 3)); // 時間軸で動く
    expect(particleU(5, 10, 4)).not.toBe(particleU(5, 10, 3)); // 再生中は動く
    for (let i = 0; i < 50; i++) { const u = particleU(i, 7, 1.5); expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThan(1); }
  });

  it('必要な項目がない流れは捨て、ないものには既定値を入れる', () => {
    const d = toFlowDefs([{ id: 'a' }, { id: 'b', from: 'x', to: 'y' }, { id: 'c', from: 'x', to: 'y', peakHour: 27, volume: -5 }]);
    expect(d.map((x) => x.id)).toEqual(['b', 'c']);
    expect(d[1]!.peakHour).toBe(3);
    expect(d[1]!.volume).toBe(100);
  });

  it('品質の粒子数を流れの数で割った粒子数になる（下限 40・上限 900）', () => {
    expect(particlesPerFlow('Low', 5)).toBe(60);
    expect(particlesPerFlow('Ultra', 1)).toBe(900);
    expect(particlesPerFlow('Low', 100)).toBe(40);
  });

  it('時間軸のストアは 0〜23 に収まり、1 時間ずつ周回する', () => {
    const t = useTimeline.getState();
    t.setHour(99);
    expect(useTimeline.getState().hour).toBe(HOURS - 1);
    t.setHour(-3);
    expect(useTimeline.getState().hour).toBe(0);
    t.step(-1);
    expect(useTimeline.getState().hour).toBe(23);
    t.step(1);
    expect(useTimeline.getState().hour).toBe(0);
    expect(formatHour(7)).toBe('07:00');
    t.setHour(12);
  });
});

describe('FR-021 AC-025 地球儀・マップの座標', () => {
  it('緯度経度から地球儀の点を求め（半径 1）、重心・広がりが求まる', () => {
    for (const p of [{ lat: 0, lng: 0 }, { lat: 35, lng: 139 }, { lat: -45, lng: -170 }]) expect(Math.hypot(...toGlobe(p))).toBeCloseTo(1, 9);
    expect(toGlobe({ lat: 0, lng: 0 })).toEqual([0, 0, 1]);
    expect(toGlobe({ lat: 90, lng: 0 })[1]).toBeCloseTo(1, 9);
    expect(toFlat({ lat: 45, lng: 90 })).toEqual([1, 0, -0.5]);
    const pts = [{ lat: 35.68, lng: 139.76 }, { lat: 34.69, lng: 135.5 }];
    const c = centroid(pts)!;
    expect(c.lat).toBeGreaterThan(34.69);
    expect(c.lat).toBeLessThan(35.68);
    expect(spread(pts)).toBeGreaterThan(0);
    expect(spread(pts)).toBeCloseTo(angularDistance(pts[0]!, pts[1]!) / 2, 2);
    expect(centroid([])).toBeNull();
  });

  it('弧は両端の拠点を通り、地球儀では球面の外側に持ち上がる', () => {
    const a = { lat: 35, lng: 139 }, b = { lat: 34, lng: 135 };
    const g = arcPoints(a, b, 'globe');
    const ga = toGlobe(a), gb = toGlobe(b);
    for (let i = 0; i < 3; i++) { expect(g[0]![i]).toBeCloseTo(ga[i]! * 1.004, 6); expect(g[g.length - 1]![i]).toBeCloseTo(gb[i]! * 1.004, 6); }
    expect(Math.hypot(...g[Math.floor(g.length / 2)]!)).toBeGreaterThan(1.01);
    const f = arcPoints(a, b, 'flat');
    expect(f[0]![0]).toBeCloseTo(toFlat(a)[0], 9);
    expect(f[Math.floor(f.length / 2)]![1]).toBeGreaterThan(0.05);
    expect(pointOnArc(f, 0)[0]).toBeCloseTo(f[0]![0], 9);
    expect(pointOnArc(f, 1)[2]).toBeCloseTo(f[f.length - 1]![2], 9);
    // 同じ点どうしでも壊れない
    expect(arcPoints(a, a, 'globe').every((p) => p.every(Number.isFinite))).toBe(true);
  });

  it('地球儀の裏側の点は、カメラに向いていない', () => {
    expect(facesCamera(toGlobe({ lat: 0, lng: 0 }), [0, 0, 3])).toBe(true);
    expect(facesCamera(toGlobe({ lat: 0, lng: 180 }), [0, 0, 3])).toBe(false);
  });

  it('初期のカメラは、拠点の重心側から見る（地球儀）', () => {
    const pts = [{ lat: 35.68, lng: 139.76 }, { lat: 34.69, lng: 135.5 }];
    const v = initialView('globe', pts);
    expect(v.target).toEqual([0, 0, 0]);
    const c = centroid(pts)!;
    const dir = toGlobe(c);
    const len = Math.hypot(...v.position);
    for (let i = 0; i < 3; i++) expect(v.position[i]! / len).toBeCloseTo(dir[i]!, 6);
    expect(len).toBeGreaterThan(1.12);
    // 拠点が広く散らばるほど、遠くから見る
    const wide = Math.hypot(...initialView('globe', [{ lat: 43.06, lng: 141.35 }, { lat: 26.2, lng: 127.7 }]).position);
    expect(wide).toBeGreaterThan(len);
    expect(initialView('flat', pts).target[1]).toBe(0);
  });
});

describe('FR-021 AC-025 / FR-113 AC-139 お手本パックの地図のデータ', () => {
  it('お手本パック（コト）は、位置を持つ拠点が 2 件以上と、両端が拠点の流れを持つ', () => {
    const koto = loadPack('koto');
    const m = mapDataOf(koto);
    expect(m.sites.length).toBeGreaterThan(1);
    expect(m.flows.length).toBeGreaterThan(0);
    expect(m.skippedFlows).toEqual([]);
    expect(m.unlocated).toEqual([]);
    for (const s of koto.entities.entities.filter((e) => e.type === 'site')) {
      const loc = (s as { location?: { lat: number; lng: number } }).location!;
      expect(hasLocation(loc)).toBe(true);
      const site = m.sites.find((x) => x.id === s.id)!;
      expect(site.lat).toBe(loc.lat);
      expect(site.lng).toBe(loc.lng);
    }
    // 流れの量は時刻で変わる
    const f = m.flows[0]!;
    expect(new Set(Array.from({ length: HOURS }, (_, h) => flowRate(f, h))).size).toBeGreaterThan(3);
  });

  it('お手本パック（モノ）の拠点にも位置がある（地図にも出る）', () => {
    const m = mapDataOf(loadPack('mono'));
    expect(m.sites.map((s) => s.id)).toEqual(expect.arrayContaining(['ent-mono-plant', 'ent-mono-line-a', 'ent-mono-line-b']));
    expect(m.flows).toEqual([]);
  });

  it('位置のない拠点は地図に出ず、位置情報なしとして数えられる', () => {
    const removed: string[] = [];
    const pack = loadPack('koto', (files) => {
      for (const e of files.entities.entities.filter((x: any) => x.type === 'site' && x.location).slice(0, 2)) { delete e.location; removed.push(e.id); }
    });
    const m = mapDataOf(pack);
    expect(m.unlocated.map((u) => u.id)).toEqual(removed);
    for (const id of removed) expect(m.sites.some((s) => s.id === id)).toBe(false);
    // 端の拠点が地図にない流れは、描かずに数える
    expect(m.skippedFlows.length).toBeGreaterThan(0);
    expect(m.flows.length + m.skippedFlows.length).toBe(toFlowDefs((pack.entities as any).flows).length);
  });

  it('範囲外の緯度・経度はスキーマで拒否される', () => {
    expect(() => loadPack('koto', (files) => { files.entities.entities[0].location = { lat: 95, lng: 0 }; })).toThrow();
  });
});

describe('FR-067 AC-082 シネマティック表現の品質ごとの有効・無効', () => {
  it('品質 Low ではブルームと被写界深度が無効、High 以上では両方が有効、Medium はブルームだけ', () => {
    expect(QUALITY_PROFILES.Low).toMatchObject({ bloom: false, dof: false });
    expect(QUALITY_PROFILES.Medium).toMatchObject({ bloom: true, dof: false });
    expect(QUALITY_PROFILES.High).toMatchObject({ bloom: true, dof: true });
    expect(QUALITY_PROFILES.Ultra).toMatchObject({ bloom: true, dof: true });
    expect(QUALITIES.length).toBe(4);
  });

  it('業種ごとのカメラパスは 2 点以上あり、ホームを基準に広がる', () => {
    const l = twinLayoutOf(loadPack('mono'));
    for (const p of INDUSTRY_PRESETS) expect(cameraPathPoses(p.cameraPath, l).length).toBeGreaterThanOrEqual(2);
  });
});

describe('シネマティック表現のソース（HDRI・グリッド・ホログラムを手続きで作る。FR-068）', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/three/Cinematic.tsx'), 'utf8');
  it('HDRI は手続き生成の RoomEnvironment を使い、外部の画像・CDN の Environment を使わない', () => {
    expect(src).toMatch(/RoomEnvironment/);
    expect(src).not.toMatch(/<Environment\b|\.hdr|\.exr|https?:\/\//);
  });
  it('ブルーム・被写界深度・グリッド・ホログラムの部品がある', () => {
    for (const w of ['UnrealBloomPass', 'BokehPass', 'GridHelper', 'Hologram']) expect(src).toContain(w);
  });
});
