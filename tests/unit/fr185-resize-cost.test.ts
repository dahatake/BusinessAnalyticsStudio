import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FOLLOW_DURATION_MS, MOTION_MAX_MS } from '../../src/theme/tokens';

const src = readFileSync('src/workspace/Workspace.tsx', 'utf8');

describe('FR-185 AC-393 境界のドラッグ中の 1 フレームの描画を軽くする', () => {
  // FR-185 AC-393
  it('FR-185 AC-393 境界のドラッグ中のセルは contain: layout style で、中の変化を外へ広げず描画のまとまりを細かくしない', () => {
    const block = src.slice(src.indexOf('resizing: {'), src.indexOf('split: {'));
    expect(block).toContain("transitionProperty: 'flex-grow'");
    expect(block).toContain("contain: 'layout style'");
    // 中身を切り抜く paint 封じ込めは使わない（影・フォーカスの輪・はみ出す表示を欠かさない）
    expect(block).not.toMatch(/contain:\s*'[^']*paint/);
  });

  // FR-185 AC-393 / NFR-UX-017（追従は短時間）
  it('FR-185 AC-393 追従の所要時間は短時間で、入力の間隔（約 100ms）を大きく超えて遅れない（フレームごとに大きさが変わる速さを保つ）', () => {
    expect(FOLLOW_DURATION_MS).toBeGreaterThan(0);
    expect(FOLLOW_DURATION_MS).toBeLessThanOrEqual(100);
    expect(FOLLOW_DURATION_MS).toBeLessThanOrEqual(MOTION_MAX_MS);
  });
});
