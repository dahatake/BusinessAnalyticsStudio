// 階層と LOD（FR-030 / FR-031 / FR-032 / FR-033 / FR-036）の単体・結合テスト。
// 階層のメタデータの検証、距離に応じた段階的な表示（クロスフェード）、ヒステリシス、パンくずリスト・ミニマップの計算、表示中の階層だけの生成とインスタンス描画。
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LoadedPack } from '../../src/data/loader';
import { DATA_SCHEMAS, EntitiesSchema, type PackData } from '../../src/schema';
import { validatePack } from '../../src/schema/validate';
import { useAnimation } from '../../src/store/animation';
import { generatedObjectCount, resetLodForTest, syncLod, useLod } from '../../src/store/lod';
import { usePackStore } from '../../src/store/pack';
import { CAMERA_FOV, framePose, homePose, setPose } from '../../src/three/cameraRig';
import {
  FADE_SECONDS, HYSTERESIS_RATIO, defaultRatio, focusChain, homeDistance, hysteresisBand, initialLevel, minimapModel,
  nextVisible, plateOpacity, resolveLevels, stepLevel, minimapNeighbor, type LevelState,
} from '../../src/three/lod';
import { registerSceneCanvas, sceneObjects } from '../../src/three/twinProbe';
import { viewportAspect } from '../../src/three/sceneViewport';
import { buildDrawables, drawStats, entityIdOfHit, planDraw, setDrawOpacity } from '../../src/three/twinDraw';
import { twinLayoutOf } from '../../src/three/twin';

function loadPack(kind: 'mono' | 'koto'): PackData {
  const dir = path.resolve(__dirname, '../../examples', kind, 'public', 'data');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')));
  return out as PackData;
}
function setPack(data: PackData): void {
  usePackStore.setState({ state: { status: 'ready', pack: { data, issues: [], disabledIds: [], isExample: true } as unknown as LoadedPack, warnings: [] } });
}

const goodLevel = {
  depth: 1, name: 'ライン', lodThreshold: 1.2, description: '組立ラインの単位', color: '#0891b2', kpi: '月間の計画外停止', sourceIds: ['src-1'],
};
const parseLevel = (l: Record<string, unknown>) => EntitiesSchema.safeParse({ levels: [l], entities: [] });

// FR-030 AC-036
describe('FR-030 AC-036 階層のレベルのメタデータ（LOD のしきい値・説明・色・KPI・出典）', () => {
  it('すべてあるレベルは検証に合格する', () => {
    expect(parseLevel(goodLevel).success).toBe(true);
  });

  it.each(['lodThreshold', 'description', 'color', 'kpi', 'sourceIds'])('%s がないレベルは検証エラーになる', (key) => {
    const { [key]: _omit, ...rest } = goodLevel as Record<string, unknown>;
    const r = parseLevel(rest);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues.map((i) => i.path))).toContain(key);
  });

  it('値が不正なレベル（しきい値が 0 以下・色の形式・出典が空）は検証エラーになる', () => {
    expect(parseLevel({ ...goodLevel, lodThreshold: 0 }).success).toBe(false);
    expect(parseLevel({ ...goodLevel, color: 'blue' }).success).toBe(false);
    expect(parseLevel({ ...goodLevel, sourceIds: [] }).success).toBe(false);
    expect(parseLevel({ ...goodLevel, description: '' }).success).toBe(false);
  });

  it('同じ深さのレベルが 2 つあると検証エラーになり、levels がないパックは従来どおり合格する', () => {
    expect(EntitiesSchema.safeParse({ levels: [goodLevel, goodLevel], entities: [] }).success).toBe(false);
    expect(EntitiesSchema.safeParse({ entities: [] }).success).toBe(true);
  });

  it('お手本パック（モノ）の levels は 4 レベルで、すべて検証に合格し、出典が実在する（パック全体の検証）', () => {
    const mono = loadPack('mono');
    expect(mono.entities.levels?.map((l) => l.depth)).toEqual([0, 1, 2, 3]);
    const files: Record<string, unknown> = {};
    const dir = path.resolve(__dirname, '../../examples/mono/public/data');
    for (const name of Object.keys(DATA_SCHEMAS)) files[name] = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
    const bad = { ...files, entities: { ...(files.entities as object), levels: [{ ...goodLevel, sourceIds: ['src-nothing'] }] } };
    const errors = validatePack({ ...bad, brandProfile: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../examples/mono/public/brand/brand-profile.json'), 'utf8')) } as never).errors;
    expect(errors.some((e) => e.code === 'dangling-reference' && e.path.includes('levels'))).toBe(true);
  });
});

// FR-031 AC-037
describe('FR-031 AC-037 カメラ距離に応じた下位の階層の不透明度（クロスフェード）', () => {
  const T = 10;
  const dt = 1 / 60;

  it('しきい値の前後で距離を連続的に近づけると、不透明度は 0 から 1 へ単調に増え、1 回の刻みで 0 から 1 に飛ばない', () => {
    let s: LevelState = initialLevel(T * 1.3, T);
    expect(s).toEqual({ visible: false, opacity: 0 });
    const seen: number[] = [s.opacity];
    for (let d = T * 1.3; d >= T * 0.7; d -= T * 0.002) {
      s = stepLevel(s, d, T, { dt });
      seen.push(s.opacity);
    }
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
      expect(seen[i]! - seen[i - 1]!).toBeLessThanOrEqual(dt / FADE_SECONDS + 1e-9);
    }
    expect(seen.some((o) => o > 0 && o < 1), '途中の不透明度がある').toBe(true);
    expect(Math.max(...seen.slice(1).map((o, i) => o - seen[i]!))).toBeLessThan(0.2);
  });

  it('遠ざけると 1 から 0 へ単調に減る', () => {
    let s: LevelState = initialLevel(T * 0.7, T);
    expect(s.opacity).toBe(1);
    const seen: number[] = [1];
    for (let d = T * 0.7; d <= T * 1.3; d += T * 0.002) {
      s = stepLevel(s, d, T, { dt });
      seen.push(s.opacity);
    }
    expect(seen[seen.length - 1]).toBe(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeLessThanOrEqual(seen[i - 1]!);
  });

  it('上位の台は、下位が現れるほど薄くなる（上位の外装は透過）が、消えはしない', () => {
    expect(plateOpacity(0)).toBe(1);
    expect(plateOpacity(1)).toBeLessThan(1);
    expect(plateOpacity(1)).toBeGreaterThan(0.3);
    expect(plateOpacity(0.5)).toBeGreaterThan(plateOpacity(1));
  });

  it('アニメーション停止中（instant）は、不透明度を即座に目標へ合わせる', () => {
    expect(stepLevel({ visible: false, opacity: 0 }, T * 0.5, T, { dt, instant: true })).toEqual({ visible: true, opacity: 1 });
  });
});

// FR-032 AC-039
describe('FR-032 AC-039 ヒステリシス（しきい値付近のちらつき防止）', () => {
  const T = 10;
  const run = (start: boolean, lo: number, hi: number, cycles = 50): boolean[] => {
    let v = start;
    const states: boolean[] = [];
    for (let i = 0; i < cycles; i++) {
      v = nextVisible(v, T * lo, T);
      states.push(v);
      v = nextVisible(v, T * hi, T);
      states.push(v);
    }
    return states;
  };

  it('ヒステリシスの幅は PARAM-023 の 10%（表示は 5% 手前、非表示は 5% 先）', () => {
    expect(HYSTERESIS_RATIO).toBe(0.1);
    const b = hysteresisBand(T);
    expect(b.show).toBeCloseTo(9.5, 9);
    expect(b.hide).toBeCloseTo(10.5, 9);
  });

  it('しきい値を挟んで、しきい値の 10% 未満の幅で往復しても、表示状態が切り替わらない（表示中でも非表示中でも）', () => {
    for (const start of [true, false]) {
      for (const [lo, hi] of [[0.96, 1.04], [0.951, 1.049], [0.98, 1.02], [0.99, 1.01]] as const) {
        expect(new Set(run(start, lo, hi)).size, `start=${start} ${lo}-${hi}`).toBe(1);
      }
    }
  });

  it('幅を越えて離れると切り替わる（表示は 0.95 倍より近く、非表示は 1.05 倍より遠く）', () => {
    expect(nextVisible(false, T * 0.94, T)).toBe(true);
    expect(nextVisible(true, T * 1.06, T)).toBe(false);
    expect(nextVisible(true, T * 1.0, T)).toBe(true);
    expect(nextVisible(false, T * 1.0, T)).toBe(false);
  });

  it('ヒステリシスの中で往復しても、不透明度も動かない（ちらつかない）', () => {
    let s: LevelState = { visible: true, opacity: 1 };
    for (let i = 0; i < 100; i++) {
      s = stepLevel(s, T * (i % 2 ? 1.04 : 0.96), T, { dt: 1 / 60 });
      expect(s).toEqual({ visible: true, opacity: 1 });
    }
  });
});

describe('FR-030 / FR-031 レベルのしきい値（パックの levels か、深さからの既定値）', () => {
  const mono = loadPack('mono');
  const layout = twinLayoutOf(mono);

  it('既定の倍率: 最上位は常に表示し、下の階層ほど近づいたときだけ現れる（単調に小さくなる）', () => {
    expect(defaultRatio(0, 3)).toBe(Number.POSITIVE_INFINITY);
    const r = [1, 2, 3].map((d) => defaultRatio(d, 3));
    expect(r[0]!).toBeGreaterThan(r[1]!);
    expect(r[1]!).toBeGreaterThan(r[2]!);
    expect(r[1]!).toBeGreaterThan(1); // ホームでは、最下位の 1 つ上までは表示する
    expect(r[2]!).toBeLessThan(1);
    expect(defaultRatio(1, 1)).toBeGreaterThan(1); // 2 階層だけなら、ホームですべて表示する
  });

  it('パックの levels があればそれを使い、なければ既定値を使う。しきい値はホームの距離に比例する', () => {
    const specs = resolveLevels(layout, 1.6, mono.entities.levels);
    expect(specs.map((s) => s.ratio)).toEqual([100, 1.65, 1.15, 0.8]);
    expect(specs[1]!.meta?.name).toBe('ライン');
    const home = homeDistance(layout, 1.6);
    expect(specs[3]!.threshold).toBeCloseTo(0.8 * home, 9);
    const plain = resolveLevels(layout, 1.6, null);
    expect(plain.map((s) => s.depth)).toEqual([0, 1, 2, 3]);
    expect(plain[1]!.meta).toBeUndefined();
    expect(plain[3]!.ratio).toBeCloseTo(defaultRatio(3, 3), 9);
    // 縦横比が変わるとホームの距離が変わり、しきい値もそれに合わせて動く
    expect(resolveLevels(layout, 0.6, null)[3]!.threshold).toBeGreaterThan(plain[3]!.threshold);
  });
});

describe('FR-033 AC-040 パンくずリストの階層（注視点と表示中のレベルから）とミニマップ', () => {
  const mono = loadPack('mono');
  const layout = twinLayoutOf(mono);
  const names = (chain: ReturnType<typeof focusChain>) => chain.map((o) => o.entityId);

  it('末端の項目の上にいるとき、最上位からその項目までの全階層が並ぶ', () => {
    const motor = layout.byId.get('ent-mono-motor')!;
    expect(names(focusChain(layout, [motor.position[0], 1, motor.position[2]], 3))).toEqual([
      'ent-mono-plant', 'ent-mono-line-a', 'ent-mono-robot', 'ent-mono-motor',
    ]);
  });

  it('下位のレベルが表示されていないときは、そのレベルまでで止まる（上位の階層名を選んだ後は、末端の名前が消える）', () => {
    const motor = layout.byId.get('ent-mono-motor')!;
    const at = [motor.position[0], 1, motor.position[2]] as [number, number, number];
    expect(names(focusChain(layout, at, 2))).toEqual(['ent-mono-plant', 'ent-mono-line-a']);
    expect(names(focusChain(layout, at, 1))).toEqual(['ent-mono-plant']);
    expect(names(focusChain(layout, at, 0))).toEqual(['ent-mono-plant']);
  });

  it('どの項目の上でもない注視点では、いちばん近い最上位の項目になり、空の配置では空', () => {
    expect(names(focusChain(layout, [100, 0, 100], 3)).length).toBeGreaterThan(0);
    expect(focusChain(twinLayoutOf({ ...mono, entities: { ...mono.entities, entities: [] } } as PackData), [0, 0, 0], 3)).toEqual([]);
  });

  it('ミニマップ: 配置の範囲を真上から描き、現在の表示範囲（四角形）はカメラを動かすと変わる', () => {
    const home = homePose(layout, 1.6);
    const a = minimapModel(layout, home, { aspect: 1.6, fovDeg: CAMERA_FOV });
    expect(a.rects.length).toBe(layout.objects.length);
    expect(a.viewport.length).toBe(4);
    expect(a.viewport.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const motor = layout.byId.get('ent-mono-motor')!;
    const near = framePose(motor, home);
    const b = minimapModel(layout, near, { aspect: 1.6, fovDeg: CAMERA_FOV });
    expect(b.viewport).not.toEqual(a.viewport);
    // 近づくほど、表示範囲は小さい
    const area = (p: Array<[number, number]>) => Math.abs(p.reduce((s, [x, y], i) => s + (x * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * y), 0)) / 2;
    expect(area(b.viewport)).toBeLessThan(area(a.viewport));
    // クリックの座標から世界の座標へ戻せる
    const r = a.rects.find((x) => x.entityId === 'ent-mono-press')!;
    const [wx, wz] = a.toWorld(r.x + r.w / 2, r.y + r.h / 2);
    const press = layout.byId.get('ent-mono-press')!;
    expect(wx).toBeCloseTo(press.position[0], 6);
    expect(wz).toBeCloseTo(press.position[2], 6);
    // 表示中のレベルまでだけを描く
    expect(minimapModel(layout, home, { aspect: 1.6, fovDeg: CAMERA_FOV, maxDepth: 1 }).rects.every((x) => x.depth <= 1)).toBe(true);
  });
});

// FR-036 AC-043 / FR-031（結合: ストア・投影・three のオブジェクト）
describe('FR-036 AC-043 表示中の階層だけを生成し、同じ形状をインスタンス描画にまとめる', () => {
  beforeEach(() => {
    useAnimation.setState({ playing: false });
    registerSceneCanvas(null);
    resetLodForTest();
    setPack(loadPack('mono'));
  });
  const layout = () => twinLayoutOf(loadPack('mono'));
  const colorOf = () => '#336699';

  function farPose() {
    const l = twinLayoutOf((usePackStore.getState().state as { pack: { data: PackData } }).pack.data);
    const h = homePose(l, 1.6);
    const off = h.position.map((v, i) => v - h.target[i]!) as [number, number, number];
    return { position: h.target.map((v, i) => v + off[i]! * 2.2) as [number, number, number], target: h.target };
  }

  it('最上位の階層だけを表示している間は、下位の階層の 3D オブジェクトが生成されていない', () => {
    setPose(farPose());
    syncLod({ dt: 1 });
    const l = twinLayoutOf((usePackStore.getState().state as { pack: { data: PackData } }).pack.data);
    const key = useLod.getState().key;
    expect(key).toBe('1000');
    const groups = planDraw(l, colorOf, (d) => key[d] === '1');
    const root = buildDrawables(l, groups);
    const top = l.objects.filter((o) => o.depth === 0);
    expect(drawStats(root).objects).toBe(top.length);
    const created = new Set(root.children.flatMap((c) => (c.userData as { ids: string[] }).ids));
    for (const o of l.objects) expect(created.has(o.entityId), `${o.entityId}（深さ ${o.depth}）`).toBe(o.depth === 0);
    expect(generatedObjectCount()).toBe(top.length);
    // 投影（scene.objects）でも、下位のレベルは画面にない
    expect(sceneObjects().filter((o) => o.visible).every((o) => l.byId.get(o.entityId)!.depth === 0)).toBe(true);
  });

  it('カメラが近づくと下位のレベルが生成され、同じ形状・色・階層の項目が 1 つの InstancedMesh にまとまる', () => {
    const l = layout();
    const motor = l.byId.get('ent-mono-motor')!;
    setPose(framePose(motor, homePose(l, 1.6)));
    syncLod({ dt: 1 });
    expect(useLod.getState().key).toBe('1111');
    const groups = planDraw(l, colorOf, (d) => useLod.getState().key[d] === '1');
    const root = buildDrawables(l, groups);
    const st = drawStats(root);
    expect(st.objects).toBe(l.objects.length);
    expect(st.instancedMeshes, '同じ形のものが 1 つのインスタンス描画にまとまる').toBeGreaterThanOrEqual(1);
    expect(st.drawCalls, '描画の呼び出しは項目の数より少ない').toBeLessThan(st.objects);
    // 同じ形・同じ階層の 2 台（ロボットとプレス機）は、同じ InstancedMesh にある
    const inst = root.children.find((c) => (c.userData as { ids: string[] }).ids.includes('ent-mono-robot'))!;
    expect((inst as unknown as { isInstancedMesh?: boolean }).isInstancedMesh).toBe(true);
    expect((inst.userData as { ids: string[] }).ids).toContain('ent-mono-press');
    expect((inst as unknown as { count: number }).count).toBe((inst.userData as { ids: string[] }).ids.length);
    // 当たったインスタンス番号から項目の ID を引ける
    const ids = (inst.userData as { ids: string[] }).ids;
    ids.forEach((id, i) => expect(entityIdOfHit(inst, i)).toBe(id));
  });

  it('ホームでは最下位のレベルだけ生成しない（遅延生成）。下位が現れるとき台は薄くなる', () => {
    const l = layout();
    setPose(homePose(l, 1.6));
    syncLod({ dt: 1 });
    expect(useLod.getState().key).toBe('1110');
    const groups = planDraw(l, colorOf, (d) => useLod.getState().key[d] === '1');
    const root = buildDrawables(l, groups);
    expect(drawStats(root).objects).toBe(l.objects.filter((o) => o.depth <= 2).length);
    // 材質の不透明度: 下位のレベルが全部現れると、台は 1 より薄い。下位が 0 なら、台は 1
    setDrawOpacity(root, (d) => (d <= 2 ? 1 : 0));
    const plate = (id: string) => root.children.find((c) => (c.userData as { ids: string[] }).ids.includes(id))! as unknown as { material: { opacity: number } };
    expect(plate('ent-mono-robot').material.opacity).toBe(1);
    setDrawOpacity(root, () => 1);
    expect(plate('ent-mono-robot').material.opacity).toBeLessThan(1);
    expect(plate('ent-mono-plant').material.opacity).toBeLessThan(1);
    setDrawOpacity(root, (d) => (d === 0 ? 0 : 1));
    expect((root.children.find((c) => (c.userData as { depth: number }).depth === 0) as unknown as { visible: boolean }).visible).toBe(false);
  });

  it('停止中はズームしてしきい値を越えた時点で、下位が即座に生成される（FR-034 の前提）。ヒステリシスの中では切り替わらない', () => {
    const l = layout();
    const aspect = viewportAspect(); // LOD のしきい値は、キャンバスの縦横比のホームの距離に比例する
    const home = homePose(l, aspect);
    const dir = home.position.map((v, i) => v - home.target[i]!);
    const at = (k: number) => ({ position: home.target.map((v, i) => v + dir[i]! * k) as [number, number, number], target: home.target });
    const dist = homeDistance(l, aspect);
    const t3 = resolveLevels(l, aspect, loadPack('mono').entities.levels)[3]!.threshold;
    setPose(at(1));
    syncLod({ dt: 1 });
    expect(useLod.getState().key).toBe('1110');
    // 最下位のしきい値（ホームの 0.8 倍）を、表示の距離（0.95 倍）より少し手前までは、まだ生成しない
    setPose(at((t3 * 0.97) / dist));
    syncLod({ dt: 1 });
    expect(useLod.getState().key).toBe('1110');
    setPose(at((t3 * 0.9) / dist));
    syncLod({ dt: 1 });
    expect(useLod.getState().key).toBe('1111');
    // 少し離れてもヒステリシスの中では生成したまま
    setPose(at((t3 * 1.03) / dist));
    syncLod({ dt: 1 });
    expect(useLod.getState().key).toBe('1111');
    setPose(at((t3 * 1.1) / dist));
    syncLod({ dt: 1 });
    expect(useLod.getState().key).toBe('1110');
  });

  it('再生中の遷移では、不透明度が時間をかけて動き、停止すると即座に目標へ合う', () => {
    const l = layout();
    setPose(homePose(l, 1.6));
    syncLod({ dt: 1 });
    useAnimation.setState({ playing: true });
    setPose(framePose(l.byId.get('ent-mono-motor')!, homePose(l, 1.6)));
    syncLod({ dt: 1 / 60 });
    const o = useLod.getState().levels[3]!;
    expect(o.visible).toBe(true);
    expect(o.opacity).toBeGreaterThan(0);
    expect(o.opacity).toBeLessThan(0.2);
    useAnimation.setState({ playing: false });
    expect(useLod.getState().levels[3]!.opacity).toBe(1);
  });
});

// FR-033 AC-040（ミニマップのキーボード操作: 矢印で場所を選び、Enter で移動する）
describe('FR-033 AC-040 ミニマップのキーボード操作（minimapNeighbor）', () => {
  const layout = twinLayoutOf(loadPack('mono'));
  it('左右は同じ階層の隣（水平の位置順）、上は親、下は表示中の子の先頭に動く', () => {
    expect(minimapNeighbor(layout, 3, 'ent-mono-line-a', 'ArrowRight')).toBe('ent-mono-line-b');
    expect(minimapNeighbor(layout, 3, 'ent-mono-line-b', 'ArrowLeft')).toBe('ent-mono-line-a');
    expect(minimapNeighbor(layout, 3, 'ent-mono-robot', 'ArrowRight')).toBe('ent-mono-press');
    expect(minimapNeighbor(layout, 3, 'ent-mono-robot', 'ArrowUp')).toBe('ent-mono-line-a');
    expect(minimapNeighbor(layout, 3, 'ent-mono-line-a', 'ArrowDown')).toBe('ent-mono-robot');
    expect(minimapNeighbor(layout, 3, 'ent-mono-robot', 'ArrowDown')).toBe('ent-mono-motor');
  });
  it('端・最上位・末端・表示中でない階層へは動かず、今の場所のまま', () => {
    expect(minimapNeighbor(layout, 3, 'ent-mono-line-b', 'ArrowRight')).toBe('ent-mono-line-b');
    expect(minimapNeighbor(layout, 3, 'ent-mono-plant', 'ArrowUp')).toBe('ent-mono-plant');
    expect(minimapNeighbor(layout, 3, 'ent-mono-motor', 'ArrowDown')).toBe('ent-mono-motor');
    expect(minimapNeighbor(layout, 2, 'ent-mono-robot', 'ArrowDown')).toBe('ent-mono-robot');
    expect(minimapNeighbor(layout, 3, 'nothing', 'ArrowLeft')).toBe('nothing');
  });
});
