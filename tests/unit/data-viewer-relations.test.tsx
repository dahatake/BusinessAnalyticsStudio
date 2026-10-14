// @vitest-environment jsdom
// データビュアーの関連の表現・選択の連動・簡略表示の結合テスト（FR-170 AC-339・AC-340、FR-171 AC-342）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DataViewer } from '../../src/components/DataViewer';
import { useDataViewer } from '../../src/store/dataViewer';
import { useDataCatalog } from '../../src/store/datacatalog';
import { deriveViewerRelations } from '../../src/datacatalog/relations';
import { normalizeKey } from '../../src/datacatalog/model';
import type { ViewerEntity } from '../../src/datacatalog/viewer';

vi.mock('../../src/three/DataViewer3D', () => ({
  DataViewer3D: (p: { clusters: { entities: ViewerEntity[] }[]; selectedKey: string | null; onSelect: (k: string) => void; detailKeys: ReadonlySet<string> | null }) => (
    <div data-testid="stub3d">
      {p.clusters.flatMap((c) => c.entities).filter((e) => !p.detailKeys || p.detailKeys.has(e.key)).map((e) => (
        <div key={e.key} role="option" aria-selected={e.key === p.selectedKey} data-viewer-entity={e.name} onClick={() => p.onSelect(e.key)}>{e.name}</div>
      ))}
    </div>
  ),
}));

const mk = (key: string, over: Partial<ViewerEntity> = {}): ViewerEntity => ({ key, name: key, description: `${key}の説明`, columns: [], cluster: '営業', relatedUseCases: [], category: '', ...over });
const ents: ViewerEntity[] = [
  mk('受注', { relatedUseCases: [{ name: 'UC1', kind: 'derived' }], category: '一致' }),
  mk('顧客', { relatedUseCases: [{ name: 'UC1', kind: 'explicit' }], category: 'BASのみ' }),
  mk('在庫', { category: '差異' }),
];
const rels = deriveViewerRelations({ entities: ents, entityLinks: [{ from: '受注', to: '顧客', label: '発注' }], catalogItems: [], normalize: normalizeKey });

function Host({ list = ents, relations = rels, limits, available3D = false }: { list?: ViewerEntity[]; relations?: typeof rels; limits?: { entities: number; columns: number }; available3D?: boolean }) {
  const key = useDataCatalog((s) => s.selectedKey);
  const select = useDataCatalog((s) => s.select);
  return (
    <FluentProvider theme={webLightTheme}>
      <button type="button" onClick={() => select('在庫')}>他のコンポーネントで在庫を選ぶ</button>
      <DataViewer entities={list} selectedKey={key} onSelect={select} relations={relations} limits={limits} available3D={available3D} />
      <output data-testid="shared-selection">{key ?? ''}</output>
    </FluentProvider>
  );
}
const viewer = () => screen.getByTestId('data-viewer');
const hlOf = (n: string) => viewer().querySelector(`[data-viewer-entity="${n}"]`)?.getAttribute('data-highlight');

beforeEach(() => { useDataViewer.getState().reset(); useDataViewer.getState().setZoom(2); useDataCatalog.getState().reset(); });
afterEach(() => cleanup());

describe('FR-170 AC-339 選択の連動と強調・減光', () => {
  it('選ぶと関連が強調され、他は減光され、共通の選択状態に反映され、aria-live で通知され、解除で元に戻る', () => {
    render(<Host />);
    fireEvent.click(viewer().querySelector('[data-viewer-entity="受注"]')!);
    expect(useDataCatalog.getState().selectedKey).toBe('受注');
    expect(hlOf('受注')).toBe('selected');
    expect(hlOf('顧客')).toBe('related');
    expect(hlOf('在庫')).toBe('dimmed');
    expect(screen.getByTestId('viewer-live').textContent).toContain('受注 を選択しました');
    fireEvent.click(screen.getByTestId('viewer-clear'));
    expect(useDataCatalog.getState().selectedKey).toBeNull();
    expect(hlOf('在庫')).toBe('none');
    expect(screen.getByTestId('viewer-live').textContent).toContain('選択を解除');
  });
  it('他のコンポーネントで選んだ対象がビュアーに反映される', () => {
    render(<Host />);
    fireEvent.click(screen.getByText('他のコンポーネントで在庫を選ぶ'));
    expect(viewer().querySelector('[data-viewer-entity="在庫"]')?.getAttribute('aria-selected')).toBe('true');
    expect(hlOf('受注')).toBe('dimmed');
    expect(screen.getByTestId('viewer-live').textContent).toContain('在庫 を選択しました');
  });
  it('ユースケースを選ぶと、それを使うエンティティが強調される', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'UC1' }));
    expect(hlOf('受注')).toBe('related');
    expect(hlOf('顧客')).toBe('related');
    expect(hlOf('在庫')).toBe('dimmed');
  });
});

describe('FR-170 AC-340 色に依存しない区別', () => {
  it('関連の線は、種類・導出／明示・区分が文字のラベルと線の種類で出る', () => {
    render(<Host />);
    fireEvent.click(viewer().querySelector('[data-viewer-entity="受注"]')!);
    const list = within(screen.getByTestId('viewer-relation-list'));
    expect(list.getByText(/①エンティティ間の関係.*発注.*実線/)).toBeTruthy();
    expect(list.getByText(/②ユースケースの使用［導出］.*UC1（導出）.*破線/)).toBeTruthy();
    expect(list.getByText(/④カタログとの突合［一致］/)).toBeTruthy();
    const dashes = [...screen.getByTestId('viewer-relation-list').querySelectorAll('line')].map((l) => `${l.getAttribute('stroke-dasharray')}|${l.getAttribute('stroke-width')}`);
    expect(new Set(dashes).size).toBe(dashes.length);
    expect(screen.getAllByText(/（実線）|（破線）|（点線）/).length).toBeGreaterThan(0); // 凡例にも文字がある
  });
});

describe('FR-171 AC-342 簡略表示', () => {
  const many = Array.from({ length: 8 }, (_, i) => mk(`E${i}`));
  it('上限を超えると、簡略である旨・理由・集約件数が出て、検索で選んだエンティティは詳細で表示され、上限以下に戻ると通常に戻る', () => {
    const { rerender } = render(<Host list={many} relations={[]} limits={{ entities: 5, columns: 100 }} />);
    act(() => useDataViewer.getState().setZoom(2));
    const note = screen.getByTestId('viewer-simplified').textContent ?? '';
    expect(note).toContain('簡略表示');
    expect(note).toContain('上限 5 件を超えている');
    expect(note).toContain('8 件を集約');
    expect(viewer().querySelectorAll('[data-viewer-entity]').length).toBe(0);
    fireEvent.change(screen.getByRole('searchbox', { name: '絞り込み' }), { target: { value: 'E3' } });
    expect(viewer().querySelector('[data-viewer-entity="E3"]')).toBeTruthy();
    fireEvent.click(viewer().querySelector('[data-viewer-entity="E3"]')!);
    expect(useDataCatalog.getState().selectedKey).toBe('E3');
    rerender(<Host list={many.slice(0, 5)} relations={[]} limits={{ entities: 5, columns: 100 }} />);
    expect(screen.queryByTestId('viewer-simplified')).toBeNull();
  });
  it('3D でも、簡略表示のときは詳細の対象だけを出す', async () => {
    render(<Host list={many} relations={[]} limits={{ entities: 5, columns: 100 }} available3D />);
    act(() => useDataViewer.getState().setMode('3d'));
    expect((await screen.findByTestId('stub3d')).querySelectorAll('[data-viewer-entity]').length).toBe(0);
  });
});
