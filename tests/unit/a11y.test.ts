// アクセシビリティ（NFR-A11Y-001・NFR-A11Y-003・NFR-A11Y-004）の単体テスト。
// 画面の操作（Tab・axe・表で見る）は System Test（tests/system/e2e/quality.spec.ts）が確かめる。ここは、その土台の判定・表の行の組み立て・書き方の規則。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSelectedHighlight, rovingTarget } from '../../src/components/roving';
import { siteTableRows, type MapSite } from '../../src/map/data';
import { isOverlayOpen, shouldClearSelectionOnEscape } from '../../src/selection/keys';
import { buildTwinLayout } from '../../src/three/entityLayout';
import { twinTableRows } from '../../src/three/twin';
import { parseWeight } from '../../src/analysis/priority';
import { placeCard } from '../../src/whiteboard/ops';

describe('NFR-A11Y-001 AC-170 矢印キーで項目を移す（ナビゲーション・択一の選択肢）', () => {
  // NFR-A11Y-001 AC-170
  it('NFR-A11Y-001 AC-170 → ↓ は次、← ↑ は前（先頭・末尾は回り込む）、Home・End は両端、ほかのキーは移さない', () => {
    expect(rovingTarget('ArrowRight', 0, 4)).toBe(1);
    expect(rovingTarget('ArrowDown', 3, 4)).toBe(0);
    expect(rovingTarget('ArrowLeft', 0, 4)).toBe(3);
    expect(rovingTarget('ArrowUp', 2, 4)).toBe(1);
    expect(rovingTarget('Home', 2, 4)).toBe(0);
    expect(rovingTarget('End', 0, 4)).toBe(3);
    expect(rovingTarget('Tab', 0, 4)).toBeNull();
    expect(rovingTarget('a', 0, 4)).toBeNull();
  });

  it('NFR-A11Y-001 AC-170 項目がない・位置が範囲外のときは移さない', () => {
    expect(rovingTarget('ArrowRight', 0, 0)).toBeNull();
    expect(rovingTarget('ArrowRight', -1, 3)).toBeNull();
    expect(rovingTarget('ArrowRight', 3, 3)).toBeNull();
  });

  it('NFR-A11Y-001 AC-170 択一の選択肢（Radio・RadioGroup）は、すべて Tab で届く共通部品（components/ChoiceRadio）から使う', () => {
    const root = path.resolve(__dirname, '../../src');
    const bad: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name) || e.name === 'ChoiceRadio.tsx') continue;
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@fluentui\/react-components'/g)) {
          const names = (m[1] ?? '').split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]);
          if (names.includes('Radio') || names.includes('RadioGroup')) bad.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(bad, 'Fluent の Radio / RadioGroup を直接使っている（同じグループの 1 つにしか Tab が止まらない）').toEqual([]);
  });
});

describe('NFR-A11Y-001 AC-169 表の行の aria-selected', () => {
  // NFR-A11Y-001 AC-169
  it('NFR-A11Y-001 AC-169 data-highlight に selected を含む行だけが選択中（selected 以外の語や部分一致は選択中にしない）', () => {
    expect(isSelectedHighlight('selected')).toBe(true);
    expect(isSelectedHighlight('selected related')).toBe(true);
    expect(isSelectedHighlight('hover selected')).toBe(true);
    expect(isSelectedHighlight('related')).toBe(false);
    expect(isSelectedHighlight('hover dimmed')).toBe(false);
    expect(isSelectedHighlight('unselected')).toBe(false);
    expect(isSelectedHighlight('')).toBe(false);
    expect(isSelectedHighlight(undefined)).toBe(false);
  });
});

describe('NFR-A11Y-001 Esc とポップアップ', () => {
  type El = Record<string, string>;
  /** CSS セレクターのうち `[属性="値"]` / `[属性]` の連なりを、カンマで区切って判定する最小の root */
  const rootOf = (els: El[]): ParentNode => ({
    querySelector: (sel: string) => {
      const ok = sel.split(',').some((part) => {
        const conds = [...part.matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)];
        return els.some((el) => conds.every((c) => (c[2] === undefined ? c[1]! in el : el[c[1]!] === c[2])));
      });
      return ok ? {} : null;
    },
  }) as unknown as ParentNode;
  const escapeCtx = (overlayOpen: boolean) => ({ key: 'Escape', defaultPrevented: false, overlayOpen, editable: false, hasSelection: true });

  // NFR-A11Y-001 AC-170: 展開中の combobox（Dropdown・Combobox・コマンドパレット）は、Esc で自分を閉じるので、選択の解除は起こさない
  it('NFR-A11Y-001 AC-170 展開中の combobox・ダイアログ・メニューは「開いているポップアップ」、閉じた combobox は数えない', () => {
    expect(isOverlayOpen(rootOf([{ role: 'combobox', 'aria-expanded': 'true' }]))).toBe(true);
    expect(isOverlayOpen(rootOf([{ role: 'combobox', 'aria-expanded': 'false' }]))).toBe(false);
    expect(isOverlayOpen(rootOf([{ role: 'dialog' }]))).toBe(true);
    expect(isOverlayOpen(rootOf([{ role: 'menu' }]))).toBe(true);
    expect(isOverlayOpen(rootOf([]))).toBe(false);
  });

  // FR-027 AC-032 / NFR-A11Y-001 AC-170: キャンバスの「議題の一覧」（常時表示の listbox）が開いていても、Esc で選択を解除できる
  it('FR-027 AC-032 議題の一覧（常時表示の listbox）を開いた状態で Esc を押すと、選択が解除される', () => {
    const root = rootOf([{ role: 'listbox', 'aria-label': '議題' }]);
    expect(isOverlayOpen(root)).toBe(false);
    expect(shouldClearSelectionOnEscape(escapeCtx(isOverlayOpen(root)))).toBe(true);
    // 比較: 展開中の combobox があれば解除しない
    const open = rootOf([{ role: 'listbox', 'aria-label': '議題' }, { role: 'combobox', 'aria-expanded': 'true' }]);
    expect(shouldClearSelectionOnEscape(escapeCtx(isOverlayOpen(open)))).toBe(false);
  });
});

describe('NFR-A11Y-003 AC-173 「表で見る」の行', () => {
  const entities = [
    { id: 'site-1', type: 'site', name: '東京工場', parentId: null },
    { id: 'line-1', type: 'part', name: '第 1 ライン', parentId: 'site-1' },
    { id: 'line-2', type: 'part', name: '第 2 ライン', parentId: 'site-1' },
  ];

  // NFR-A11Y-003 AC-173
  it('NFR-A11Y-003 AC-173 3D ビューの項目は、渡した ID の順に、名称・種別・上位の項目・下位の項目数の行になる', () => {
    const layout = buildTwinLayout(entities);
    const rows = twinTableRows(layout, ['line-2', 'site-1']);
    expect(rows.map((r) => r.id)).toEqual(['line-2', 'site-1']);
    expect(rows[0]?.cells).toEqual(['第 2 ライン', 'part', '東京工場', 0]);
    expect(rows[1]?.cells).toEqual(['東京工場', 'site', '—', 2]);
  });

  it('NFR-A11Y-003 AC-173 配置にない ID は行にしない。配置がない（パック未読込）ときは空', () => {
    const layout = buildTwinLayout(entities);
    expect(twinTableRows(layout, ['line-1', 'no-such']).map((r) => r.id)).toEqual(['line-1']);
    expect(twinTableRows(layout, [])).toEqual([]);
    expect(twinTableRows(null, ['line-1'])).toEqual([]);
  });

  it('NFR-A11Y-003 AC-173 地図の拠点は、件数・順序を変えずに、名称・種別・緯度・経度の行になる', () => {
    const sites: MapSite[] = [
      { id: 'site-1', name: '東京工場', type: 'site', lat: 35.68, lng: 139.77 },
      { id: 'site-2', name: '大阪倉庫', type: 'site', lat: 34.69, lng: 135.5 },
    ];
    const rows = siteTableRows(sites);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: 'site-1', cells: ['東京工場', 'site', 35.68, 139.77] });
    expect(rows[1]?.cells).toEqual(['大阪倉庫', 'site', 34.69, 135.5]);
    expect(siteTableRows([])).toEqual([]);
  });
});

describe('NFR-A11Y-004 AC-174 ドラッグ以外の操作（数値入力・メニューでの配置）の土台', () => {
  // NFR-A11Y-004 AC-174
  it('NFR-A11Y-004 AC-174 重みは、スライダーのドラッグでなく数値入力（0〜10 の整数）で変えられ、範囲外・数値でない入力は反映しない', () => {
    expect(parseWeight('7')).toEqual({ ok: true, value: 7 });
    expect(parseWeight(0)).toEqual({ ok: true, value: 0 });
    expect(parseWeight('11').ok).toBe(false);
    expect(parseWeight('abc').ok).toBe(false);
    expect(parseWeight('2.5').ok).toBe(false);
    expect(parseWeight('').ok).toBe(false);
  });

  it('NFR-A11Y-004 AC-174 課題カードは、ポインターの位置を使わず座標だけでボードに置け、同じ元データは重ねて置かない', () => {
    const first = placeCard([], { entityId: 'issue-1', label: '課題 1', sub: '課題' }, { x: 40, y: 60 });
    expect(first.existing).toBe(false);
    expect(first.items.some((i) => i.type === 'card' && i.sourceEntityId === 'issue-1')).toBe(true);
    expect(placeCard(first.items, { entityId: 'issue-1', label: '課題 1' }, { x: 0, y: 0 }).existing).toBe(true);
  });
});
