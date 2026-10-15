// 顧客の了承の記録（FR-181）の単体・結合検査。
// FR-181 AC-374 AC-382 AC-383: 記録の保存・取消・案件ごとの分離・個人名と連絡先の拒否
// FR-181 AC-381: パイプラインの実調査・生成の了承のゲート
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentSettings } from '../../src/ai/ConsentSettings';
import { CONSENT_EXPORT_FILE, CONSENT_EXPORT_GUIDE, CONSENT_SELF_DECLARED_NOTICE, buildConsentExport, buildConsentRecord, consentKeyOf, parseConsentRecord, personalInfoReason } from '../../src/ai/consent';
import { useConsentStore } from '../../src/ai/useConsent';
import { CONSENT_FILE, readConsent } from '../../scripts/pipeline/consent';
import { runPipeline } from '../../scripts/pipeline/pipeline';
import { sampleResearcher, type Researcher } from '../../scripts/pipeline/research';
import { mockGenerator, type PackGenerator } from '../../scripts/pipeline/generate';
import { defaultPaths, type Inputs } from '../../scripts/pipeline/common';

describe('FR-181 AC-383 個人名・連絡先を保存しない', () => {
  it('役割名と方法のメモは保存でき、前後の空白は取り除く', () => {
    const r = buildConsentRecord('2026-10-15', '  顧客側の担当役員（口頭）  ');
    expect(r).toEqual({ ok: true, record: { granted: true, confirmedOn: '2026-10-15', note: '顧客側の担当役員（口頭）' } });
    expect(buildConsentRecord('2026-10-15', 'IT 部門の責任者（メール）').ok).toBe(true);
  });

  it.each([
    ['メールアドレス', '担当 taro@example.com にメールで確認'],
    ['電話番号', '担当役員に 03-1234-5678 で確認'],
    ['携帯の番号', '090 1234 5678 に電話'],
    ['URL', 'https://example.com/profile で確認'],
    ['敬称つきの名前', '山田様に口頭で確認'],
    ['さん付けの名前', '田中さんにチャットで確認'],
    ['英字の氏名', 'John Smith に確認'],
  ])('%s らしい入力は保存しない', (_n, note) => {
    const r = buildConsentRecord('2026-10-15', note);
    expect(r.ok).toBe(false);
    expect(personalInfoReason(note)).toBeTruthy();
  });

  it('メモが空・長すぎる・確認日が不正なら保存しない', () => {
    expect(buildConsentRecord('2026-10-15', '   ').ok).toBe(false);
    expect(buildConsentRecord('2026-10-15', 'あ'.repeat(201)).ok).toBe(false);
    expect(buildConsentRecord('15/10/2026', '役員（口頭）').ok).toBe(false);
  });

  it('端末内の保存データを読み直すときも、個人名らしい・形の違う値は捨てる', () => {
    expect(parseConsentRecord({ granted: true, confirmedOn: '2026-10-15', note: '山田様に確認' })).toBeUndefined();
    expect(parseConsentRecord({ granted: true, confirmedOn: '2026-10-15', note: 3 })).toBeUndefined();
    expect(parseConsentRecord(null)).toBeUndefined();
  });
});

describe('FR-181 AC-374 AC-382 記録の保存・取消と案件ごとの分離', () => {
  beforeEach(() => { useConsentStore.setState({ records: {} }); });

  it('保存すると案件の記録になり、別の案件（デモ）には及ばず、取消で消える', () => {
    const real = consentKeyOf('サンプル商事', 'DX 推進');
    const demo = consentKeyOf('デモ', 'デモ');
    expect(useConsentStore.getState().save(real, '2026-10-15', '顧客側の担当役員（口頭）')).toEqual({ ok: true });
    expect(useConsentStore.getState().records[real]?.note).toBe('顧客側の担当役員（口頭）');
    expect(useConsentStore.getState().records[demo]).toBeUndefined();
    useConsentStore.getState().revoke(real);
    expect(useConsentStore.getState().records[real]).toBeUndefined();
  });

  it('個人名らしいメモは保存されず、保存データにも含まれない', () => {
    const k = consentKeyOf('A 社', 'P');
    expect(useConsentStore.getState().save(k, '2026-10-15', '佐藤さん（090-1234-5678）').ok).toBe(false);
    expect(JSON.stringify(useConsentStore.getState().records)).not.toContain('佐藤');
  });

  it('了承が自己申告の記録であることを示す文言がある', () => {
    expect(CONSENT_SELF_DECLARED_NOTICE).toContain('自己申告');
    expect(CONSENT_SELF_DECLARED_NOTICE).toContain('検証しません');
  });
});

describe('FR-181 AC-381 パイプラインの了承のゲート', () => {
  let root: string;
  const logs: string[] = [];
  const input = (customer: string, projectName = 'P'): Inputs => ({ customer, projectName, intensity: 'Showcase', materials: [] });
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-')); logs.length = 0; });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const paths = () => defaultPaths({ workspace: path.join(root, 'ws'), repoRoot: root });

  function spies() {
    const sent = { research: 0, generate: 0 };
    const researcher: Researcher = {
      researchCustomer: async (i) => { sent.research++; return sampleResearcher.researchCustomer(i); },
      researchBrand: async (i) => { sent.research++; return sampleResearcher.researchBrand(i); },
    };
    const generator: PackGenerator = { generate: async (req) => { sent.generate++; return mockGenerator.generate(req); } };
    return { sent, researcher, generator };
  }
  const writeConsent = (customer: string, projectName: string) => {
    const ws = paths().workspace;
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, CONSENT_FILE), JSON.stringify({ records: { [consentKeyOf(customer, projectName)]: { granted: true, confirmedOn: '2026-10-15', note: '顧客側の担当役員（口頭）' } } }));
  };

  it('了承の記録がない案件では、外部への送信が 0 回で、実調査をしない旨を出力し、サンプルで進む', async () => {
    const { sent, researcher } = spies();
    const r = await runPipeline('research', input('甲社'), { paths: paths(), researcher, log: (l) => logs.push(l) });
    expect(r.stages).toEqual(['research-customer', 'research-brand']);
    expect(sent.research).toBe(0);
    expect(logs.join('\n')).toContain('了承の記録がない');
    expect(logs.join('\n')).toContain('推定（サンプル）');
  });

  it('生成も、了承の記録がなければ差し替えの生成器を使わない', async () => {
    const { sent, generator } = spies();
    await runPipeline('research', input('乙社'), { paths: paths(), generator, log: () => {} });
    expect(sent.generate).toBe(0);
  });

  it('了承の記録がある企業・Project では送信される。デモの記録は実 Project の了承にならない', async () => {
    writeConsent('丙社', 'P');
    const a = spies();
    await runPipeline('research', input('丙社'), { paths: paths(), researcher: a.researcher, log: () => {} });
    expect(a.sent.research).toBe(2);
    // 同じ企業でも Project が違えば別の案件（了承なし）
    const b = spies();
    await runPipeline('research', input('丙社', '別の Project'), { paths: paths(), researcher: b.researcher, log: () => {} });
    expect(b.sent.research).toBe(0);
    // デモの了承を入力しても、実 Project の案件には及ばない
    writeConsent('デモ', 'デモ');
    expect(readConsent(paths(), input('丁社'))).toBeUndefined();
    expect(readConsent(paths(), input('デモ', 'デモ'))).toBeDefined();
  });

  it('記録ファイルが壊れている・個人名らしい記録は「記録なし」として扱う', () => {
    const ws = paths().workspace;
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, CONSENT_FILE), '{broken');
    expect(readConsent(paths(), input('戊社'))).toBeUndefined();
    fs.writeFileSync(path.join(ws, CONSENT_FILE), JSON.stringify({ records: { [consentKeyOf('戊社', 'P')]: { granted: true, confirmedOn: '2026-10-15', note: '山田様に確認' } } }));
    expect(readConsent(paths(), input('戊社'))).toBeUndefined();
  });
});

// FR-181 AC-384 AC-385 AC-386: 了承の記録の consent.json 書き出し
describe('FR-181 AC-384 AC-385 AC-386 consent.json の書き出し', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-exp-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }); });
  const rec = { granted: true as const, confirmedOn: '2026-10-15', note: '顧客側の担当役員（口頭）' };

  it('AC-384 書き出したファイルを作業フォルダーに置くと readConsent で読め、別の案件の鍵では記録なし', () => {
    const key = consentKeyOf('戊社', 'DX');
    fs.writeFileSync(path.join(root, CONSENT_FILE), buildConsentExport(key, rec));
    expect(CONSENT_EXPORT_FILE).toBe(CONSENT_FILE);
    expect(readConsent({ workspace: root }, { customer: '戊社', projectName: 'DX' })).toEqual(rec);
    expect(readConsent({ workspace: root }, { customer: '戊社', projectName: '別' })).toBeUndefined();
    expect(readConsent({ workspace: root }, { customer: 'デモ', projectName: 'デモ' })).toBeUndefined();
  });

  it('AC-384 記録のない（または不正な）案件は書き出せない', () => {
    expect(() => buildConsentExport('', rec)).toThrow();
    expect(() => buildConsentExport('A / P', { granted: true, confirmedOn: '2026-10-15', note: '山田様に確認' })).toThrow();
  });

  it('AC-385 書き出しは通信 0 回で、この案件の記録以外（キー・パックの内容）を含まない', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const text = buildConsentExport('己社 / P', { ...rec, apiKey: 'sk-secret', pack: { x: 1 } } as typeof rec);
    expect(fetchSpy).not.toHaveBeenCalled();
    const j = JSON.parse(text) as { records: Record<string, Record<string, unknown>> };
    expect(Object.keys(j)).toEqual(['records']);
    expect(Object.keys(j.records['己社 / P']!).sort()).toEqual(['confirmedOn', 'granted', 'note']);
    expect(text).not.toContain('sk-secret');
  });

  it('AC-386 置き場所の案内と自己申告の注意が画面に表示され、書き出しはボタン（キーボード操作可）', () => {
    useConsentStore.setState({ records: {} });
    const html = renderToStaticMarkup(createElement(ConsentSettings, { onRevoke: () => {} }));
    expect(html).toContain('&lt;workspace&gt;/consent.json');
    expect(html).toContain('自己申告');
    expect(html).toMatch(/<button[^>]*>了承の記録を consent\.json として書き出す/);
    expect(CONSENT_EXPORT_GUIDE).toContain('<workspace>/consent.json');
  });
});
