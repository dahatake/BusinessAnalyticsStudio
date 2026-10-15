// @vitest-environment jsdom
// データビュアー（FR-169 AC-336・AC-337、NFR-A11Y-007 AC-345・AC-346、NFR-UX-012 AC-347）の結合テスト。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DataViewer } from '../../src/components/DataViewer';
import { useDataViewer } from '../../src/store/dataViewer';
import { useDataCatalog } from '../../src/store/datacatalog';
import { SCREENS } from '../../src/screens/registry';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type ViewerEntity } from '../../src/datacatalog/viewer';

// 3D の描画は jsdom では行えないため、同じ属性・操作を持つ代替に差し替える（描画そのものは System Test E2E で確かめる）
vi.mock('../../src/three/DataViewer3D', () => ({
  DataViewer3D: (p: { clusters: { entities: ViewerEntity[] }[]; level: string; selectedKey: string | null; onSelect: (k: string) => void }) => (
    <div data-testid="stub3d">
      {p.clusters.flatMap((c) => c.entities).map((e) => (
        <div key={e.key} role="option" aria-selected={e.key === p.selectedKey} data-viewer-entity={e.name} onClick={() => p.onSelect(e.key)}>
          {e.name}{p.level === 'column' ? e.columns.map((c) => <span key={c.name} data-viewer-column={c.name}>{c.name}</span>) : null}
        </div>
      ))}
    </div>
  ),
}));

const ents: ViewerEntity[] = [
  { key: 'juchu', name: '受注', description: '受注の記録', columns: [{ name: '受注番号', type: 'string' }, { name: '金額', type: 'number' }], cluster: '営業', relatedUseCases: [{ name: 'UC1', kind: 'derived' }], category: '一致' },
  { key: 'kokyaku', name: '顧客', description: '顧客の記録', columns: [], cluster: '営業', relatedUseCases: [], category: 'BASのみ' },
  { key: 'zaiko', name: '在庫', description: '在庫の記録', columns: [{ name: '数量' }], cluster: '物流', relatedUseCases: [], category: '差異' },
];

function Host({ available3D = true }: { available3D?: boolean }) {
  const key = useDataCatalog((s) => s.selectedKey);
  const select = useDataCatalog((s) => s.select);
  return <FluentProvider theme={webLightTheme}><DataViewer entities={ents} selectedKey={key} onSelect={select} available3D={available3D} /></FluentProvider>;
}
const viewer = () => screen.getByTestId('data-viewer');
const level = () => viewer().getAttribute('data-detail-level');
const zoomOf = () => Number(viewer().getAttribute('data-zoom'));
const click = (name: string) => fireEvent.click(within(viewer()).getByRole('button', { name }));

beforeEach(() => { useDataViewer.getState().reset(); useDataCatalog.getState().reset(); });
afterEach(cleanup);

describe('FR-169 AC-336 拡大・縮小の操作（結合）', () => {
  it('ボタンの 1 操作で倍率が 1.25 倍（縮小は逆数）になり、上限・下限では変わらず壊れない', () => {
    render(<Host />);
    expect(zoomOf()).toBeCloseTo(1);
    click('拡大'); expect(zoomOf()).toBeCloseTo(ZOOM_STEP);
    click('縮小'); expect(zoomOf()).toBeCloseTo(1);
    for (let i = 0; i < 40; i++) click('拡大');
    expect(zoomOf()).toBeCloseTo(ZOOM_MAX); click('拡大'); expect(zoomOf()).toBeCloseTo(ZOOM_MAX);
    expect(level()).toBe('column');
    for (let i = 0; i < 60; i++) click('縮小');
    expect(zoomOf()).toBeCloseTo(ZOOM_MIN); click('縮小'); expect(zoomOf()).toBeCloseTo(ZOOM_MIN);
    expect(level()).toBe('bird');
    click('拡大'); click('全体表示に戻す'); expect(zoomOf()).toBeCloseTo(1);
  });

  it('キー（+ − 0）で拡大・縮小・全体表示、ホイールで連続して倍率が変わる', () => {
    render(<Host />);
    fireEvent.keyDown(viewer(), { key: '+' }); expect(zoomOf()).toBeCloseTo(ZOOM_STEP);
    fireEvent.keyDown(viewer(), { key: '-' }); expect(zoomOf()).toBeCloseTo(1);
    fireEvent.keyDown(viewer(), { key: '=' }); fireEvent.keyDown(viewer(), { key: '0' }); expect(zoomOf()).toBeCloseTo(1);
    fireEvent.wheel(viewer(), { deltaY: -200 }); expect(zoomOf()).toBeGreaterThan(1);
    fireEvent.wheel(viewer(), { deltaY: 2000 }); expect(zoomOf()).toBeLessThan(1);
  });

  it('ピンチ（2 点の距離の変化）で倍率が変わる', () => {
    render(<Host />);
    const v = viewer();
    const ev = (type: string, id: number, x: number) => { const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>; e.pointerId = id; e.clientX = x; e.clientY = 0; act(() => { v.dispatchEvent(e); }); };
    ev('pointerdown', 1, 0); ev('pointerdown', 2, 100); ev('pointermove', 2, 200);
    expect(zoomOf()).toBeCloseTo(2);
    ev('pointerup', 1, 0); ev('pointerup', 2, 200);
  });
});

describe('FR-169 AC-334・AC-337 表示の切替と保持（結合）', () => {
  it('列の詳細度で、選択・倍率・絞り込みが 2D↔3D の切替でも保たれる。入力中の内容も失われない', async () => {
    render(<Host />);
    for (let i = 0; i < 6; i++) click('拡大');
    expect(level()).toBe('column');
    fireEvent.click(viewer().querySelector('[data-viewer-entity="受注"]')!);
    const box = within(viewer()).getByRole('searchbox', { name: '絞り込み' }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: '受' } });
    const z = zoomOf();
    for (const mode of ['3D', '2D', '3D']) {
      fireEvent.click(within(viewer()).getByRole('radio', { name: mode }));
      expect(viewer().getAttribute('data-view-mode')).toBe(mode.toLowerCase());
      if (mode === '3D') await screen.findByTestId('stub3d');
      expect(viewer().querySelector('[data-viewer-entity="受注"]')!.getAttribute('aria-selected')).toBe('true');
      expect(level()).toBe('column'); expect(zoomOf()).toBeCloseTo(z);
      expect((within(viewer()).getByRole('searchbox', { name: '絞り込み' }) as HTMLInputElement).value).toBe('受');
      expect(viewer().querySelector('[data-viewer-entity="受注"] [data-viewer-column]')).not.toBeNull();
    }
    expect(viewer().querySelector('[data-viewer-entity="在庫"]')).toBeNull(); // 絞り込みが効いている
  });

  it('拡大すると鳥観図（塊）→エンティティ→列の順で、最大で列名が読める', () => {
    render(<Host />);
    expect(viewer().querySelector('[data-viewer-cluster="営業"]')).not.toBeNull();
    expect(viewer().querySelector('[data-viewer-entity]')).toBeNull();
    const seen = [level()];
    for (let i = 0; i < 12; i++) { click('拡大'); if (level() !== seen[seen.length - 1]) seen.push(level()); }
    expect(seen).toEqual(['bird', 'entity', 'column']);
    expect(viewer().querySelector('[data-viewer-entity="受注"]')!.textContent).toContain('受注番号');
  });
});

describe('NFR-A11Y-007 AC-345 キーボード操作とアクセシブルな名前（結合）', () => {
  it('矢印で隣へ移動し Enter で選択でき、操作部品に名前があり、選択と詳細度の変化が aria-live に出る', () => {
    render(<Host />);
    for (let i = 0; i < 4; i++) fireEvent.keyDown(viewer(), { key: '+' });
    expect(level()).toBe('entity');
    const opts = [...viewer().querySelectorAll<HTMLElement>('[role="option"]')];
    opts[0]!.focus();
    fireEvent.keyDown(opts[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(opts[1]);
    fireEvent.keyDown(opts[1]!, { key: 'Enter' });
    expect(useDataCatalog.getState().selectedKey).toBe('kokyaku');
    expect(screen.getByTestId('viewer-live').textContent).toContain('顧客 を選択しました');
    expect(screen.getByTestId('viewer-live').getAttribute('aria-live')).toBe('polite');
    fireEvent.keyDown(viewer(), { key: '+' }); fireEvent.keyDown(viewer(), { key: '+' }); fireEvent.keyDown(viewer(), { key: '+' }); fireEvent.keyDown(viewer(), { key: '+' });
    expect(screen.getByTestId('viewer-live').textContent).toMatch(/詳細度が/);
    for (const n of ['拡大', '縮小', '全体表示に戻す']) expect(within(viewer()).getByRole('button', { name: n })).toBeTruthy();
    expect(within(viewer()).getByRole('radiogroup', { name: '表示モード' })).toBeTruthy();
    expect(within(viewer()).getByRole('searchbox', { name: '絞り込み' })).toBeTruthy();
    fireEvent.keyDown(viewer(), { key: 'End' }); fireEvent.keyDown(viewer(), { key: 'Home' });
  });

  it('入力欄での + − は拡大・縮小にならない', () => {
    render(<Host />);
    const box = within(viewer()).getByRole('searchbox', { name: '絞り込み' });
    fireEvent.keyDown(box, { key: '+' });
    expect(zoomOf()).toBeCloseTo(1);
  });
});

describe('NFR-A11Y-007 AC-346 3D が使えない環境の代替（結合）', () => {
  it('3D が使えないと 2D で表示され、3D は無効で理由が出る。表で全件（区分・種別は文字）を確認できる', () => {
    useDataViewer.getState().setMode('3d');
    render(<Host available3D={false} />);
    expect(viewer().getAttribute('data-view-mode')).toBe('2d');
    expect((within(viewer()).getByRole('radio', { name: '3D' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('viewer-no3d-reason').textContent).toContain('3D は選べません');
    const rows = within(screen.getByTestId('viewer-table')).getAllByRole('row');
    expect(rows).toHaveLength(1 + ents.length);
    const t = screen.getByTestId('viewer-table').textContent!;
    for (const w of ['受注番号（string）', '一致', 'BASのみ', '差異', 'UC1（導出）', '列の情報なし', '営業', '物流']) expect(t).toContain(w);
  });

  it('3D が使える環境でも同じ表がある（2D・3D のどちらでも全件）', async () => {
    render(<Host />);
    fireEvent.click(within(viewer()).getByRole('radio', { name: '3D' }));
    expect(await screen.findByTestId('stub3d')).toBeTruthy();
    expect(within(screen.getByTestId('viewer-table')).getAllByRole('row')).toHaveLength(1 + ents.length);
  });
});

describe('NFR-UX-012 AC-347 コンポーネント化と状態の保持（結合）', () => {
  it('データカタログの画面（ワークスペースのコンポーネント）に入っており、作り直されても選択・倍率・表示モードが保たれる', async () => {
    expect(SCREENS.some((x) => x.key === 'data-catalog')).toBe(true);
    const r = render(<Host />);
    for (let i = 0; i < 6; i++) click('拡大');
    fireEvent.click(viewer().querySelector('[data-viewer-entity="受注"]')!);
    fireEvent.click(within(viewer()).getByRole('radio', { name: '3D' }));
    await screen.findByTestId('stub3d');
    const z = zoomOf();
    r.unmount(); // 最大化・移動・非表示・既定のレイアウトに戻すでコンポーネントが作り直される状況
    render(<Host />);
    await screen.findByTestId('stub3d');
    expect(viewer().getAttribute('data-view-mode')).toBe('3d');
    expect(level()).toBe('column'); expect(zoomOf()).toBeCloseTo(z);
    expect(viewer().querySelector('[data-viewer-entity="受注"]')!.getAttribute('aria-selected')).toBe('true');
    act(() => useDataViewer.getState().reset());
  });

  it('列は折り返す一覧で、横スクロールを強いる固定幅を持たない（積み重ね）', () => {
    render(<Host />);
    const grid = viewer().querySelector('[role="listbox"] > div') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain('auto-fill');
  });
});
