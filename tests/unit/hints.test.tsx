// @vitest-environment jsdom
// FR-269 AC-686・FR-270 AC-688・FR-271 AC-689 の単体・結合テスト。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { existsSync, readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { NameDialog } from '../../src/projects/dialogs';
import { WorkTargetPicker } from '../../src/projects/WorkTargetPicker';
import { optionDescription } from '../../src/projects/workTarget';

const wrap = (ui: ReactNode) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
vi.setConfig({ testTimeout: 30000 });
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

describe('FR-269 NameDialog のヒント', () => {
  // FR-269 AC-686
  it('AC-686 ヒントが入力欄に関連づけられ、入力後も読め、空の入力の検証は変わらない', () => {
    const onSubmit = vi.fn(() => ({ ok: false as const, reason: '名前を入力してください' }));
    render(wrap(<NameDialog title="企業を登録" label="企業名" submit="登録" placeholder="ミズホ精機株式会社" help="例: ミズホ精機株式会社。登録すると Project を作成できます。" onSubmit={onSubmit} onClose={() => {}} />));
    const input = screen.getByRole('textbox', { name: '企業名' });
    expect(input.getAttribute('placeholder')).toBe('ミズホ精機株式会社');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.map((i) => document.getElementById(i)?.textContent ?? '').join(' ')).toMatch(/登録すると Project を作成/);
    fireEvent.change(input, { target: { value: 'あ' } });
    expect(screen.getByRole('dialog').textContent).toContain('登録すると Project を作成');
    fireEvent.click(screen.getByRole('button', { name: '登録' }));
    expect(onSubmit).toHaveBeenCalledWith('あ');
    expect(screen.getByRole('alert').textContent).toContain('名前を入力してください');
  });
});

describe('FR-270 作業先の候補の説明', () => {
  // FR-270 AC-687・AC-688
  it('AC-688 各候補に 60 字以内の説明が名前とともにあり、選択の動作は変わらない', () => {
    const onChoose = vi.fn();
    render(wrap(<WorkTargetPicker projects={[]} companies={[]} onChoose={onChoose} onClose={() => {}} />));
    const opts = screen.getAllByRole('option') as [HTMLElement, ...HTMLElement[]];
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect((o.textContent ?? '').length).toBeGreaterThan(0);
    expect(opts[0].textContent).toContain('顧客パックがなくても');
    for (const k of ['demo', 'project', 'register'] as const) expect(optionDescription(k).length).toBeLessThanOrEqual(60);
    fireEvent.click(opts[0]);
    expect(onChoose).toHaveBeenCalledWith({ kind: 'demo' });
  });
});

describe('FR-271 ドキュメント', () => {
  // FR-271 AC-689
  it('AC-689 README と利用ガイドが流れの図の SVG を参照し、ファイルが存在する', () => {
    expect(existsSync('users-guide/images/guide-flow.svg')).toBe(true);
    expect(readFileSync('README.md', 'utf8')).toContain('users-guide/images/guide-flow.svg');
    const g = readFileSync('users-guide/01-quick-start.md', 'utf8');
    expect(g).toContain('./images/guide-flow.svg');
    expect(g).toContain('はじめての方へ');
  });
});