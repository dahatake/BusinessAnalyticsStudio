import { beforeEach, describe, expect, it } from 'vitest';
import { credentialShapes } from '../../src/integrations/credentialShape';
import {
  MAX_INTEGRATIONS_PER_PROJECT, registerProjectIntegrationsSnapshot, resetProjectIntegrations, selectionView,
  useProjectIntegrations, type IntegrationSetting,
} from '../../src/store/projectIntegrations';
import { restore, snapshot, startPersistence, STORAGE_KEY } from '../../src/store/persist';
import { buildMemoForPack, restoreFromMemo } from '../../src/discussion/restore';
import { resetProjects, useProjects } from '../../src/store/projects';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const st = () => useProjectIntegrations.getState();
const item = (id: string, status: '計画' | '稼働' | '廃止予定' | '廃止' = '稼働') => ({ id, name: `連携${id}`, status });
const setting = (id: string, over: Partial<IntegrationSetting> = {}): IntegrationSetting => ({
  integrationId: id, name: `連携${id}`, target: 'https://example.com/api', authMethod: 'OAuth 2.0', secretStoreName: 'kv-prod/ext-key',
  terms: { status: '確認済み', date: '2026-10-01' }, cost: { status: '未確認' }, sla: { status: '確認済み', date: '2026-10-02' }, ...over,
});
// 資格情報の形式の値は実行時に組み立てる（ソースに値の形式を置かない）
const LONG = ['a1B2', 'c3D4', 'e5F6', 'g7H8'].join('').repeat(2) + 'zz';
const BEARER = 'Bearer ' + 'abcd1234efgh';

beforeEach(() => { resetProjects(); resetProjectIntegrations(); });

describe('FR-201 Project ごとの連携の選択', () => {
  // FR-201 AC-441
  it('AC-441: 新規 Project は 0 件・Project 間で独立・上限で拒否し既存は不変', () => {
    expect(selectionView('P-new', () => '稼働')).toEqual([]);
    expect(st().select('A', item('x')).ok).toBe(true);
    expect(st().byProject['B']).toBeUndefined();
    expect(st().select('B', item('y')).ok).toBe(true);
    expect(st().byProject['A']!.selected).toEqual(['x']);
    for (let i = 0; i < MAX_INTEGRATIONS_PER_PROJECT - 1; i++) expect(st().select('A', item(`n${i}`)).ok).toBe(true);
    const before = [...st().byProject['A']!.selected];
    const r = st().select('A', item('over'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(String(MAX_INTEGRATIONS_PER_PROJECT));
    expect(st().byProject['A']!.selected).toEqual(before);
  });
  // FR-201 AC-448
  it('AC-448: 廃止は選択不可、計画・稼働・廃止予定は可、後から状態が変わっても残り識別できる', () => {
    const r = st().select('A', item('d', '廃止'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('廃止');
    for (const s of ['計画', '稼働', '廃止予定'] as const) expect(st().select('A', item(`s-${s}`, s)).ok).toBe(true);
    const v = selectionView('A', (id) => (id === 's-稼働' ? '廃止' : id === 's-計画' ? '廃止予定' : '稼働'));
    expect(v.find((e) => e.id === 's-稼働')?.status).toBe('廃止');
    expect(v.find((e) => e.id === 's-計画')?.status).toBe('廃止予定');
    expect(v).toHaveLength(3);
  });
});

describe('FR-202 連携設定の記録', () => {
  // FR-202 AC-442
  it('AC-442: 保存→開き直しで同じ値、未確認は区別でき、アーカイブ・復元で残る', () => {
    const s = store();
    const stop = startPersistence(s);
    const p = useProjects.getState();
    const c = p.addCompany('社');
    const pr = p.addProject((c as { id: string }).id, 'P') as { id: string };
    st().select(pr.id, item('x'));
    expect(st().saveSetting(pr.id, setting('x')).ok).toBe(true);
    useProjects.getState().setArchived(pr.id, true);
    useProjects.getState().setArchived(pr.id, false);
    stop(); resetProjects(); resetProjectIntegrations();
    expect(restore(s)).toBe(true);
    const got = st().byProject[pr.id]!.settings['x']!;
    expect(got).toEqual(setting('x'));
    expect(got.cost.status).toBe('未確認');
    expect(got.terms.status).not.toBe(got.cost.status);
  });
  // FR-202 AC-443 NFR-SEC-008
  it('AC-443: 資格情報の形式の値は保管場所などの欄で保存拒否、値は保存されない', () => {
    st().select('A', item('x'));
    for (const bad of [LONG, BEARER, 'api_key=' + 'q9w8e7r6', '-----BEGIN PRIVATE KEY-----']) {
      for (const field of ['secretStoreName', 'target', 'authMethod'] as const) {
        const r = st().saveSetting('A', setting('x', { [field]: bad }));
        expect(r.ok).toBe(false);
      }
    }
    expect(st().byProject['A']!.settings['x']).toBeUndefined();
    expect(JSON.stringify(st().byProject)).not.toContain(LONG);
  });
  it('AC-443: AC-430 の除外規則（一般語・2 種類以下・ハッシュ長・ダミー表記）は拒否しない', () => {
    expect(credentialShapes('Bearer authentication scheme')).toEqual([]);
    expect(credentialShapes('a'.repeat(40))).toEqual([]);
    expect(credentialShapes('abab'.repeat(10))).toEqual([]);
    expect(credentialShapes('a1b2c3d4e5'.repeat(4).slice(0, 40))).toEqual([]); // 16 進 40 桁（commit ハッシュ）
    expect(credentialShapes('token=xxxx')).toEqual([]);
    expect(credentialShapes('api_key=<ここに値>')).toEqual([]);
    expect(credentialShapes('password=REDACTED')).toEqual([]);
    expect(credentialShapes('token=xx')).not.toEqual([]); // x が PARAM-067 未満はダミーでない
    expect(credentialShapes('API キー')).toEqual([]);
    expect(credentialShapes('kv-prod/ext-key')).toEqual([]);
  });
  // FR-202 AC-446
  it('AC-446: 解除しても設定は保持され、再選択で復元される', () => {
    st().select('A', item('x'));
    st().saveSetting('A', setting('x'));
    st().deselect('A', 'x');
    expect(selectionView('A', () => '稼働')).toEqual([]);
    expect(st().byProject['A']!.settings['x']).toEqual(setting('x'));
    st().select('A', item('x'));
    expect(selectionView('A', () => '稼働')[0]!.setting).toEqual(setting('x'));
  });
  it('選択していない連携の設定は記録できない', () => {
    expect(st().saveSetting('A', setting('zz')).ok).toBe(false);
  });
  // FR-202 AC-447
  it('AC-447: 全量エクスポートから復元すると選択と設定が同じ値で戻る', () => {
    const off = registerProjectIntegrationsSnapshot();
    st().select('A', item('x'));
    st().select('A', item('y'));
    st().saveSetting('A', setting('x'));
    st().deselect('A', 'y');
    st().select('B', item('z'));
    const before = JSON.parse(JSON.stringify(st().byProject));
    const md = buildMemoForPack({ customerName: '社', projectName: 'A' });
    resetProjectIntegrations();
    const r = restoreFromMemo(md, { customerName: '社', projectName: 'A' });
    off();
    expect(r.ok).toBe(true);
    expect(st().byProject).toEqual(before);
  });
  it('AC-447: 資格情報の形式を含むファイルからの復元は、検証で拒否され現在の内容を変えない', () => {
    const off = registerProjectIntegrationsSnapshot();
    st().select('A', item('x'));
    st().saveSetting('A', setting('x'));
    const md = buildMemoForPack({ customerName: '社', projectName: 'A' });
    const tampered = md.split('kv-prod/ext-key').join(LONG);
    const before = JSON.parse(JSON.stringify(st().byProject));
    const r = restoreFromMemo(tampered, { customerName: '社', projectName: 'A' });
    off();
    expect(r.ok).toBe(false);
    expect(st().byProject).toEqual(before);
  });
});

describe('NFR-SEC-008 保存・書き出しに資格情報の値を含めない', () => {
  // NFR-SEC-008 AC-445
  it('AC-445: 保存内容と書き出したファイルに資格情報の形式の文字列がない', () => {
    const off = registerProjectIntegrationsSnapshot();
    st().select('A', item('x'));
    st().saveSetting('A', setting('x'));
    st().saveSetting('A', setting('x', { secretStoreName: LONG }));
    const saved = JSON.stringify(snapshot());
    const memo = buildMemoForPack({ customerName: '社', projectName: 'A' });
    off();
    for (const text of [saved, memo]) {
      expect(text).toContain('kv-prod/ext-key');
      expect(text).not.toContain(LONG);
    }
    const s = store();
    s.setItem(STORAGE_KEY, saved.replace('kv-prod/ext-key', LONG));
    resetProjects(); resetProjectIntegrations();
    restore(s);
    expect(st().byProject['A']?.settings['x']).toBeUndefined();
  });
});
