// データビュアー（FR-169 AC-335、純関数）の単体テスト。倍率→詳細度の判定、丸め、刻み、塊のまとめ、配置。
import { describe, expect, it } from 'vitest';
import {
  HYSTERESIS, THRESHOLDS, UNGROUPED, ZOOM_HOME, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom, filterEntities, fitDistance, groupClusters, is3DAvailable, layoutViewer,
  levelOfZoom, moveIndex, nextLevel, scaleZoom, stepZoom, toViewerEntities, zoomKeyAction, type DetailLevel, type ViewerEntity,
} from '../../src/datacatalog/viewer';
import { normalizeKey, type DataEntity } from '../../src/datacatalog/model';

const ent = (name: string, cluster: string, cols: string[] = []): ViewerEntity => ({
  key: normalizeKey(name), name, description: `${name}の説明`, columns: cols.map((n) => ({ name: n })), cluster, relatedUseCases: [], category: '',
});

describe('FR-169 AC-335 詳細度の判定（単体）', () => {
  it('倍率を小さい値から大きい値へ連続して変えると、鳥観図→エンティティ→列の順にだけ変わり、段を飛ばさない', () => {
    let lv: DetailLevel = 'bird';
    const seen: DetailLevel[] = [lv];
    for (let z = ZOOM_MIN; z <= ZOOM_MAX; z += 0.01) {
      const n = nextLevel(lv, z);
      if (n !== lv) { expect(Math.abs(['bird', 'entity', 'column'].indexOf(n) - ['bird', 'entity', 'column'].indexOf(lv))).toBe(1); seen.push(n); lv = n; }
    }
    expect(seen).toEqual(['bird', 'entity', 'column']);
    // 大きい値から小さい値へ戻すと、逆順にだけ変わる
    const back: DetailLevel[] = [lv];
    for (let z = ZOOM_MAX; z >= ZOOM_MIN; z -= 0.01) { const n = nextLevel(lv, z); if (n !== lv) { back.push(n); lv = n; } }
    expect(back).toEqual(['column', 'entity', 'bird']);
  });

  it('1 回の判定で動くのは 1 段まで（極端な倍率でも段を飛ばさない）', () => {
    expect(nextLevel('bird', ZOOM_MAX)).toBe('entity');
    expect(nextLevel('column', ZOOM_MIN)).toBe('entity');
  });

  it('しきい値の前後で PARAM-023（10%）未満の幅で往復しても、詳細度は切り替わらない', () => {
    expect(HYSTERESIS).toBe(0.1);
    for (let i = 0; i < THRESHOLDS.length; i++) {
      const t = THRESHOLDS[i]!;
      const lower: DetailLevel = i === 0 ? 'bird' : 'entity';
      const upper: DetailLevel = i === 0 ? 'entity' : 'column';
      for (const start of [lower, upper]) {
        let lv: DetailLevel = start;
        for (let k = 0; k < 20; k++) {
          lv = nextLevel(lv, k % 2 === 0 ? t * 0.97 : t * 1.03);
          expect(lv).toBe(start);
        }
      }
    }
  });

  it('倍率の上限・下限を超える値は上限・下限に丸められ、刻みは PARAM-057（1.25 倍）で縮小は逆数', () => {
    expect(clampZoom(1000)).toBe(ZOOM_MAX);
    expect(clampZoom(0.0001)).toBe(ZOOM_MIN);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_HOME);
    expect(nextLevel('bird', 1e9)).toBe('entity');
    expect(ZOOM_STEP).toBe(1.25);
    expect(stepZoom(2, 1)).toBeCloseTo(2.5);
    expect(stepZoom(2, -1)).toBeCloseTo(1.6);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(scaleZoom(2, 1.5)).toBeCloseTo(3);
    expect(scaleZoom(2, -1)).toBe(2);
    expect(levelOfZoom(1)).toBe('bird');
    expect(levelOfZoom(2)).toBe('entity');
    expect(levelOfZoom(5)).toBe('column');
  });

  it('ボタン・キーの刻みだけで、倍率の上限までに鳥観図→エンティティ→列の順で到達できる', () => {
    let z = ZOOM_HOME; let lv: DetailLevel = 'bird'; const seen: DetailLevel[] = ['bird'];
    for (let i = 0; i < 30; i++) { z = stepZoom(z, 1); const n = nextLevel(lv, z); if (n !== lv) { seen.push(n); lv = n; } }
    expect(seen).toEqual(['bird', 'entity', 'column']);
  });
});

describe('FR-169 塊・絞り込み・配置・キー（単体）', () => {
  const list = [ent('受注', '営業', ['A', 'B']), ent('顧客', '営業'), ent('在庫', '物流', ['C'])];
  it('塊は最初に現れた順にまとまり、絞り込みは名前・列名で効く', () => {
    expect(groupClusters(list).map((c) => `${c.name}:${c.entities.length}`)).toEqual(['営業:2', '物流:1']);
    expect(filterEntities(list, '').length).toBe(3);
    expect(filterEntities(list, 'c').map((e) => e.name)).toEqual(['在庫']);
    expect(filterEntities(list, '営業').length).toBe(2);
    expect(filterEntities(list, 'zzz')).toEqual([]);
  });
  it('ドメインがあればそれ、なければ関連するユースケース、なければ未分類の塊になる', () => {
    const e = (name: string): DataEntity => ({ key: normalizeKey(name), name, description: '', origins: [] });
    const v = toViewerEntities(
      [e('受注'), e('顧客'), e('在庫')], [{ name: '受注', description: '', domain: '営業', columns: [{ name: 'X', type: 'int' }] }],
      (x) => (x.name === '顧客' ? [{ name: 'UC1', kind: 'derived' as const }] : []), normalizeKey,
    );
    expect(v.map((x) => x.cluster)).toEqual(['営業', 'UC1', UNGROUPED]);
    expect(v[0]!.columns).toEqual([{ name: 'X', type: 'int' }]);
  });
  it('配置は決まった入力で同じ結果で、全エンティティに位置があり、重ならない', () => {
    const big = Array.from({ length: 12 }, (_, i) => ent(`E${i}`, i < 7 ? 'A' : 'B'));
    const l1 = layoutViewer(groupClusters(big));
    expect(layoutViewer(groupClusters(big))).toEqual(l1);
    expect(l1.entities).toHaveLength(12);
    expect(new Set(l1.entities.map((p) => `${p.x},${p.z}`)).size).toBe(12);
    expect(l1.extent).toBeGreaterThan(0);
    expect(fitDistance(l1.extent)).toBeGreaterThan(0);
    expect(layoutViewer([]).entities).toEqual([]);
  });
  it('キーの移動と拡大・縮小・全体表示の割り当て、3D の可否', () => {
    expect(moveIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(moveIndex(0, 3, 'ArrowRight')).toBe(1);
    expect(moveIndex(2, 3, 'ArrowDown')).toBe(2);
    expect(moveIndex(0, 3, 'ArrowUp')).toBe(0);
    expect(moveIndex(1, 3, 'End')).toBe(2);
    expect(moveIndex(1, 3, 'x')).toBeNull();
    expect(moveIndex(0, 0, 'Home')).toBeNull();
    expect([zoomKeyAction('+'), zoomKeyAction('-'), zoomKeyAction('0'), zoomKeyAction('a')]).toEqual(['in', 'out', 'home', null]);
    expect(is3DAvailable({ hasWebGPU: false, hasWebGL2: false })).toBe(false);
    expect(is3DAvailable({ hasWebGPU: false, hasWebGL2: true })).toBe(true);
  });
});
