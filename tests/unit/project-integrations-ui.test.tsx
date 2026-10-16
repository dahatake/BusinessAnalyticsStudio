// @vitest-environment jsdom
// FR-201 / FR-202 / FR-203 / NFR-SEC-008 の画面と連携カタログ・送信ゲートの単体・結合テスト
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { INTEGRATION_CATALOG, parseIntegrationCatalog } from '../../src/integrations/catalog';
import { integrationNotice } from '../../src/integrations/sendGate';
import { IntegrationsPanel } from '../../src/projects/IntegrationsPanel';
import { MAX_INTEGRATIONS_PER_PROJECT, resetProjectIntegrations, useProjectIntegrations } from '../../src/store/projectIntegrations';

const consentMock = vi.hoisted(() => ({ granted: false }));
vi.mock('../../src/ai/useConsent', () => ({ useConsent: () => ({ key: 'k', record: undefined, granted: consentMock.granted }) }));

const ui = (id = 'p1') => render(<FluentProvider theme={webLightTheme}><IntegrationsPanel projectId={id} /></FluentProvider>);
const region = () => screen.getByRole('region', { name: '外部連携' });
const box = (name: string) => within(region()).getByRole('checkbox', { name }) as HTMLInputElement;
const save = () => fireEvent.click(within(region()).getByRole('button', { name: '連携の選択を保存' }));
const first = (): string => names()[0] ?? '';
const names = () => INTEGRATION_CATALOG.filter((c) => c.status !== '廃止').map((c) => c.name);

beforeEach(() => { resetProjectIntegrations(); consentMock.granted = false; });
afterEach(cleanup);

describe('外部連携カタログ（docs/integration-catalog.md との一致）', () => {
  // FR-201 AC-440
  it('FR-201 AC-440 カタログの表の全行（連携名・状態）が選択肢になる', () => {
    const md = readFileSync('docs/integration-catalog.md', 'utf8');
    const rows = md.split(/\r?\n/).filter((l) => l.startsWith('| ') && !l.startsWith('| 連携名') && !l.startsWith('|---'));
    expect(INTEGRATION_CATALOG.length).toBe(rows.length);
    expect(new Set(INTEGRATION_CATALOG.map((c) => c.name)).size).toBe(rows.length);
    expect(INTEGRATION_CATALOG.length).toBeGreaterThanOrEqual(2);
  });
  it('FR-201 AC-448 表の状態の語を読み取る（計画・稼働・廃止予定・廃止以外の行は除く）', () => {
    const md = '## 外部連携\n\n| 連携名 | 連携先 | 方向 | 種別 | 状態 |\n|---|---|---|---|---|\n| A | x | 受信 | API | 廃止 |\n| B | x | 受信 | API | 計画 |\n| C | x | 受信 | API | ???? |\n';
    expect(parseIntegrationCatalog(md).map((c) => [c.name, c.status])).toEqual([['A', '廃止'], ['B', '計画']]);
  });
});

describe('IntegrationsPanel', () => {
  // FR-201 AC-440
  it('FR-201 AC-440 保存した選択だけが残り、保存しない選択は開き直すと消える', () => {
    const x = first();
    const a = ui();
    fireEvent.click(box(x));
    a.unmount();
    ui();
    expect(box(x).checked).toBe(false);
    fireEvent.click(box(x));
    save();
    cleanup();
    ui();
    expect(box(x).checked).toBe(true);
    cleanup();
    ui('p2');
    expect(within(region()).queryAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(0);
  });
  // FR-201 AC-448
  it('FR-201 AC-448 廃止の連携は選べない（理由を表示）。選択済みが廃止になっても選択は残り状態が分かる', () => {
    const retired = INTEGRATION_CATALOG.find((c) => c.status === '廃止');
    if (retired) {
      ui();
      expect(box(retired.name).disabled).toBe(true);
      expect(within(region()).getAllByText('廃止のため新たに選択できません。').length).toBeGreaterThan(0);
      cleanup();
    }
    const x = INTEGRATION_CATALOG[0]!;
    useProjectIntegrations.getState().select('p1', { ...x, status: '稼働' });
    ui();
    expect(box(x.name).checked).toBe(true);
    expect(within(region()).getAllByText(/状態: /).length).toBeGreaterThan(0);
  });
  // FR-201 AC-441
  it('FR-201 AC-441 上限に達した選択は保存で拒否され、理由が表示され、既存の選択は変わらない', () => {
    for (let i = 0; i < MAX_INTEGRATIONS_PER_PROJECT; i++) useProjectIntegrations.getState().select('p1', { id: `dummy${i}`, name: `ダミー${i}`, status: '稼働' });
    ui();
    fireEvent.click(box(first()));
    save();
    expect(screen.getByRole('alert').textContent).toContain(`${MAX_INTEGRATIONS_PER_PROJECT} 件まで`);
    expect(useProjectIntegrations.getState().byProject.p1!.selected).toHaveLength(MAX_INTEGRATIONS_PER_PROJECT);
    expect(useProjectIntegrations.getState().byProject.p1!.selected).not.toContain(first());
  });
  // FR-202 AC-442 AC-446
  it('FR-202 AC-442 AC-446 設定を記録・参照し、未確認を区別して表示する。解除しても設定は残り再選択で戻る', () => {
    const x = first();
    ui();
    fireEvent.click(box(x));
    save();
    const g = screen.getByRole('group', { name: `${x} の設定` });
    fireEvent.change(within(g).getByLabelText('連携先'), { target: { value: 'api.example.com' } });
    fireEvent.change(within(g).getByLabelText('利用規約・ライセンスの確認状況'), { target: { value: '確認済み' } });
    fireEvent.change(within(g).getByLabelText('利用規約・ライセンスの確認日（YYYY-MM-DD）'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(g).getByRole('button', { name: '設定を保存' }));
    expect(useProjectIntegrations.getState().byProject.p1!.settings[x]!.target).toBe('api.example.com');
    expect(within(g).getAllByText('未確認', { selector: '.fui-Badge' }).length).toBe(2); // 費用・SLA は未確認のまま
    fireEvent.click(box(x));
    save();
    expect(screen.queryByRole('group', { name: `${x} の設定` })).toBeNull();
    fireEvent.click(box(x));
    save();
    expect((within(screen.getByRole('group', { name: `${x} の設定` })).getByLabelText('連携先') as HTMLInputElement).value).toBe('api.example.com');
  });
  // FR-202 AC-443 NFR-SEC-008
  it('FR-202 AC-443 NFR-SEC-008 資格情報の形式の値は保存を拒否し、理由を表示する', () => {
    const x = first();
    ui();
    fireEvent.click(box(x));
    save();
    const g = screen.getByRole('group', { name: `${x} の設定` });
    fireEvent.change(within(g).getByLabelText(/保管場所の名前/), { target: { value: 'Bearer ' + 'abcd1234efgh' } });
    fireEvent.click(within(g).getByRole('button', { name: '設定を保存' }));
    expect(within(g).getByRole('alert').textContent).toContain('資格情報');
    expect(useProjectIntegrations.getState().byProject.p1!.settings[x]).toBeUndefined();
  });
  // FR-203 AC-444
  it('FR-203 AC-444 了承が無い案件では了承を求める表示と未確認の識別が出る。選択・保存で外部送信（fetch）はしない', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const x = first();
    ui();
    expect(screen.queryByTestId('integration-consent-notice')).toBeNull();
    fireEvent.click(box(x));
    save();
    expect(screen.getByTestId('integration-consent-notice').textContent).toContain('了承の記録がありません');
    expect(screen.getByTestId('integration-unconfirmed').textContent).toContain(x);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('integrationNotice（FR-203）', () => {
  const cur = { selected: ['a'], names: { a: 'A' }, settings: {} };
  // FR-203 AC-444
  it('FR-203 AC-444 了承が無ければ送信不可で了承を求める。了承があれば求めない。選択の有無で可否は変わらない', () => {
    expect(integrationNotice(false, cur)).toMatchObject({ sendAllowed: false, unconfirmed: ['A'] });
    expect(integrationNotice(false, cur).consentNotice).toBeTruthy();
    expect(integrationNotice(true, cur).consentNotice).toBeUndefined();
    expect(integrationNotice(false, undefined)).toMatchObject({ sendAllowed: false, unconfirmed: [] });
  });
  it('FR-203 AC-444 全項目が確認済みなら未確認として識別しない', () => {
    const ok = { status: '確認済み' as const, date: '2026-10-01' };
    const c = { ...cur, settings: { a: { integrationId: 'a', name: 'A', target: '', authMethod: '', secretStoreName: '', terms: ok, cost: ok, sla: ok } } };
    expect(integrationNotice(true, c).unconfirmed).toEqual([]);
  });
});
