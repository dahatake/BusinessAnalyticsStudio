// @vitest-environment jsdom
// FR-293 AC-786 / AC-787 / AC-790（FR-294 の基盤）: 表示言語の切り替えの単体テスト
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LANG_STORAGE_KEY, LanguageToggle, initLang, tr, translate, useLang, useT } from '../../src/i18n';

function Probe() {
  const t = useT();
  return <p data-testid="p">{t('表示言語')}</p>;
}

beforeEach(() => {
  localStorage.clear();
  initLang();
});

describe('FR-293 言語の状態', () => {
  it('AC-786 既定は日本語で html lang=ja', () => {
    expect(useLang.getState().lang).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
  });
  it('AC-786 切り替えると保存され html lang が変わり、読み直すと復元される', () => {
    act(() => useLang.getState().setLang('en'));
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en');
    useLang.setState({ lang: 'ja' });
    expect(initLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
  it('AC-786 異常系: 保存値が不正なら日本語', () => {
    localStorage.setItem(LANG_STORAGE_KEY, '@@invalid@@');
    expect(initLang()).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
  });
});

describe('FR-294 翻訳', () => {
  it('日本語ではそのまま、英語では辞書を引く', () => {
    expect(translate('ja', '表示言語')).toBe('表示言語');
    expect(translate('en', '表示言語')).toBe('Display language');
  });
  it('辞書にない文言は日本語のまま返る', () => {
    expect(translate('en', '辞書にない文言')).toBe('辞書にない文言');
  });
  it('{name} 形式の補間（未指定の名前はそのまま）', () => {
    expect(translate('ja', '{n} 件の {what}', { n: 3, what: '要求' })).toBe('3 件の 要求');
    expect(translate('en', '{n} 件 {x}', { n: 2 })).toBe('{n} 件 {x}'.replace('{n}', '2'));
  });
  it('tr は現在の言語で即時に返す', () => {
    expect(tr('表示言語')).toBe('表示言語');
    act(() => useLang.getState().setLang('en'));
    expect(tr('表示言語')).toBe('Display language');
  });
  it('useT は言語の切り替えで再描画される', () => {
    render(<Probe />);
    expect(screen.getByTestId('p').textContent).toBe('表示言語');
    act(() => useLang.getState().setLang('en'));
    expect(screen.getByTestId('p').textContent).toBe('Display language');
  });
});

describe('FR-293 トグル', () => {
  it('AC-786 ボタン名は 日本語/English で、aria-pressed が現在の言語を示し、クリックで切り替わる', async () => {
    render(<LanguageToggle />);
    const ja = screen.getByRole('button', { name: '日本語' });
    const en = screen.getByRole('button', { name: 'English' });
    expect(ja.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('group').getAttribute('aria-label')).toBeTruthy();
    await userEvent.click(en);
    expect(en.getAttribute('aria-pressed')).toBe('true');
    expect(ja.getAttribute('aria-pressed')).toBe('false');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('FR-293 AC-790 英語辞書の健全性', () => {
  const files = import.meta.glob('../../src/i18n/en/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;
  it('辞書ファイルがあり、キーが重複せず、値が空でなく、補間の名前が日英で一致する', () => {
    // 同じキーの重複は、値が同じなら許容（マージ時に後勝ちでも同じ）。値が異なる重複だけ失敗にする。
    const seen = new Map<string, { path: string; value: string }>();
    const problems: string[] = [];
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [path, mod] of Object.entries(files)) {
      for (const [k, v] of Object.entries(mod.default)) {
        const prev = seen.get(k);
        if (prev && prev.value !== v) problems.push(`値が異なる重複: ${k}（${prev.path} と ${path}）`);
        if (!prev) seen.set(k, { path, value: v });
        if (typeof v !== 'string' || v.trim() === '') problems.push(`空の値: ${k}（${path}）`);
        else {
          const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
          if (names(k) !== names(v)) problems.push(`補間の不一致: ${k}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('FR-294 AC-788/789 作成時の言語で初期名・検証メッセージを作る', () => {
  it('AC-788 追加・複製の初期名と期限の検証メッセージは、言語に追従する', () => {
    expect(tr('新しい課題')).toBe('新しい課題');
    act(() => useLang.getState().setLang('en'));
    expect(tr('新しい課題')).toBe('New issue');
    expect(tr('{base}（複製）', { base: 'A' })).toBe('A (copy)');
    expect(tr('拠点 {name}（緯度 {lat}、経度 {lng}）', { name: 'X', lat: 1, lng: 2 })).toBe('Site X (lat 1, lng 2)');
  });
});
