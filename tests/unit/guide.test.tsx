// @vitest-environment jsdom
// 初心者向けアプリ内ガイド（FR-266〜FR-268・FR-272）の単体・結合テスト。jsdom + testing-library。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { MainScreen } from '../../src/projects/MainScreen';
import { resetProjects } from '../../src/store/projects';
import { resetAnalyses } from '../../src/store/analyses';
import { useMainScreen } from '../../src/store/mainScreen';
import { useWorkTargetUi } from '../../src/projects/workTargetUi';
import { GuideButton, GuideHost } from '../../src/guide';
import { GUIDE_ACK_KEY, resetGuide, shouldAutoShow, useGuide } from '../../src/guide/guideStore';
import { PANEL_MOTION_MS } from '../../src/guide/GettingStarted';
import { GUIDE_STEPS, GUIDE_TERMS, PACK_COMMANDS, PACK_PROMPT_FILE, PACK_PROMPT_FILE_GHCP, PACK_PROMPT_GHCP, PACK_PROMPT_M365, PACK_SAMPLE, PACK_URL, GUIDE_WHAT, GUIDE_WORKSPACE } from '../../src/guide/guideContent';

const wrap = (ui: ReactNode) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

beforeEach(() => {
  resetProjects(); resetAnalyses(); resetGuide(); localStorage.clear();
  useMainScreen.setState({ shown: true });
  useWorkTargetUi.setState({ demoOnly: false });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

/** 補足パネルの開閉ボタン（既定は閉じている。FR-266 AC-675）を押して開く */
const openPanel = () => { fireEvent.click(screen.getByRole('button', { name: 'はじめての方へ' })); };
const sentences = (t: string) => t.split(/[。！？\n]/).map((s) => s.trim()).filter(Boolean);

describe('FR-266 はじめての方へ', () => {
  // FR-266 AC-675
  it('FR-266 AC-675 補足パネルを開くと、できること・用語・4 手順（例・次に）が出て、各文は 60 字以内。既定は閉じていて説明は出ない', () => {
    render(wrap(<MainScreen />));
    expect(screen.queryByRole('region', { name: 'はじめての方へ' })).toBeNull();
    openPanel();
    const region = screen.getByRole('region', { name: 'はじめての方へ' });
    const text = region.textContent ?? '';
    for (const t of GUIDE_TERMS) expect(text).toContain(t.term);
    for (const st of GUIDE_STEPS) expect(text).toContain(st.name);
    expect((text.match(/例/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/次に/);
    const all = [...GUIDE_WHAT, ...GUIDE_TERMS.map((t) => t.text), ...GUIDE_STEPS.flatMap((s) => [s.what, s.example, s.next])];
    for (const s of all.flatMap(sentences)) expect(s.length).toBeLessThanOrEqual(60);
  });

  // FR-266 AC-676
  it('FR-266 AC-676 流れの図に代替テキストがあり、4 段が番号と文字で区別できる', () => {
    render(wrap(<MainScreen />));
    openPanel();
    const svg = screen.getAllByRole('img', { name: /全体の流れ/ })[0]!;
    expect(svg.getAttribute('aria-labelledby')).toBeTruthy();
    expect(svg.querySelector('desc')?.textContent).toMatch(/1 企業を登録.*2 Project を作成.*3 Project を開く.*4 分析を開始/);
    const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent);
    for (let i = 0; i < 4; i++) { expect(labels).toContain(String(i + 1)); expect(labels).toContain(GUIDE_STEPS[i]!.name); }
    expect(new Set([...svg.querySelectorAll('rect, polygon, ellipse')].map((e) => e.tagName + (e.getAttribute('rx') ?? ''))).size).toBe(4);
  });

  // FR-266 AC-677
  it('FR-266 AC-677 既存の手順の操作（main-guide の 4 項目）と見出しの階層が保たれる', () => {
    render(wrap(<MainScreen />));
    openPanel();
    expect(within(screen.getByTestId('main-guide')).getAllByRole('listitem').length).toBe(4);
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBe(1);
    expect(screen.getByRole('heading', { level: 2, name: 'はじめての方へ' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 4 }).length).toBeGreaterThan(0);
  });
});

describe('FR-266 補足パネルの開閉', () => {
  const setReduce = (reduce: boolean) => {
    window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  };
  const css = () => [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText); } catch { return []; } }).join('\n');

  // FR-266 AC-675: 開閉ボタンは常に見え、aria-expanded が変わり、Enter・Space（button の既定の click）で操作できる。登録の有無によらず同じ
  it('FR-266 AC-675 開閉ボタン（role=button・ラベル「はじめての方へ」）は既定で aria-expanded=false。押すと true で region が出て、もう一度押すと閉じる', async () => {
    setReduce(true);
    render(wrap(<MainScreen />));
    const btn = screen.getByRole('button', { name: 'はじめての方へ' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-controls')).toBe(screen.getByRole('region', { name: 'はじめての方へ' }).id);
    expect(screen.getByTestId('getting-started')).toBeTruthy();
    expect(screen.getByTestId('pack-guide')).toBeTruthy();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'はじめての方へ' })).toBeNull();
  });

  // FR-266 AC-820（integration）
  it('FR-266 AC-820 開閉は PARAM-074（500ms）以内のアニメーション。動きの軽減（reduce）では即時に閉じ、動きの長さは 0', async () => {
    expect(PANEL_MOTION_MS).toBeGreaterThan(0);
    expect(PANEL_MOTION_MS).toBeLessThanOrEqual(500);
    expect(css()).toContain(`animation-duration: ${PANEL_MOTION_MS}ms`);
    expect(css()).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-duration: 0ms/);
    // 通常: 閉じる動きの間は残り、終わると消える。状態（aria-expanded）は直ちに伝わる
    setReduce(false);
    render(wrap(<MainScreen />));
    const btn = screen.getByRole('button', { name: 'はじめての方へ' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'はじめての方へ' })).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'はじめての方へ' })).toBeNull(), { timeout: 500 });
    // 動きの軽減: 即座に切り替わる
    cleanup();
    setReduce(true);
    render(wrap(<MainScreen />));
    const b2 = screen.getByRole('button', { name: 'はじめての方へ' });
    fireEvent.click(b2);
    fireEvent.click(b2);
    expect(screen.queryByRole('region', { name: 'はじめての方へ' })).toBeNull();
  });

  // FR-266 AC-821（integration）
  it('FR-266 AC-821 パネルは本文（手順・企業一覧）の右の aside。狭い幅では縦に並ぶ（本文の下）規則があり、開閉ボタンはその aside の中にある', () => {
    render(wrap(<MainScreen />));
    const main = screen.getByTestId('main-screen');
    const aside = main.querySelector('aside')!;
    const body = screen.getByTestId('main-guide').parentElement!;
    expect(aside.contains(screen.getByRole('button', { name: 'はじめての方へ' }))).toBe(true);
    expect(body.contains(aside)).toBe(false);
    expect(body.nextElementSibling).toBe(aside); // 本文のあと（右、狭い幅では下）
    expect(css()).toMatch(/max-width: 720px[\s\S]*flex-direction: column/);
  });
});

describe('FR-267 ウェルカム', () => {
  // FR-267 AC-679
  it('FR-267 AC-679 「次回から表示しない」を選んで閉じたときだけ記録する。選ばずに閉じても記録しない', async () => {
    render(wrap(<><GuideHost /><MainScreen /></>));
    useGuide.getState().openGuide('main');
    let dlg = await screen.findByRole('dialog', { name: 'ウェルカム' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'スキップ' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'ウェルカム' })).toBeNull());
    expect(localStorage.getItem(GUIDE_ACK_KEY)).toBeNull();
    useGuide.getState().openGuide('main');
    dlg = await screen.findByRole('dialog', { name: 'ウェルカム' });
    fireEvent.click(within(dlg).getByRole('checkbox', { name: '次回から表示しない' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'スキップ' }));
    await waitFor(() => expect(localStorage.getItem(GUIDE_ACK_KEY)).toBe('1'));
  });

  it('FR-267 AC-679 自動表示は、e2e=1 のときは welcome=1 のときだけ。確認済みなら出ない', () => {
    expect(shouldAutoShow('')).toBe(true);
    expect(shouldAutoShow('?e2e=1')).toBe(false);
    expect(shouldAutoShow('?e2e=1&welcome=1')).toBe(true);
    localStorage.setItem(GUIDE_ACK_KEY, '1');
    expect(shouldAutoShow('?e2e=1&welcome=1')).toBe(false);
  });

  // FR-267 AC-680
  it('FR-267 AC-680 カードの順番（n / 総数）が伝わり、次へ・戻るで替わり、Esc で閉じる', async () => {
    render(wrap(<><GuideHost /><MainScreen /></>));
    useGuide.getState().openGuide('main');
    const dlg = await screen.findByRole('dialog', { name: 'ウェルカム' });
    expect(within(dlg).getByText('カード 1 / 4')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: '次へ' }));
    expect(within(dlg).getByText('カード 2 / 4')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: '戻る' }));
    expect(within(dlg).getByText('カード 1 / 4')).toBeTruthy();
    fireEvent.keyDown(dlg, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'ウェルカム' })).toBeNull());
  });

  // FR-267 AC-681
  it('FR-267 AC-681 「使い方を見る」で、確認済みでも同じダイアログが開く。動きを減らすと切替は 0 ms', async () => {
    localStorage.setItem(GUIDE_ACK_KEY, '1');
    render(wrap(<><GuideHost /><MainScreen /></>));
    fireEvent.click(screen.getByRole('button', { name: '使い方を見る' }));
    const dlg = await screen.findByRole('dialog', { name: 'ウェルカム' });
    expect(within(dlg).getByTestId('guide-card').getAttribute('data-motion-ms')).toMatch(/^(0|150)$/);
  });
});

describe('FR-268 顧客パックの説明', () => {
  // FR-268 AC-682
  it('FR-268 AC-682 補足パネルを開くと「顧客パック」region に意味・デモ・3 通り・確認コマンド・起動の手順が出る', () => {
    render(wrap(<MainScreen />));
    openPanel();
    const t = screen.getByRole('region', { name: '顧客パック' }).textContent ?? '';
    for (const s of ['顧客パックがなくても', PACK_SAMPLE, PACK_PROMPT_FILE, 'npm run pipeline', 'npm run check:pack', 'npm run verify:pack', 'npm run build', 'npm start', PACK_URL]) expect(t).toContain(s);
  });

  // FR-268 AC-683
  it('FR-268 AC-683 コピーのボタンで文字列がコピーされ「コピーしました」が伝わる。使えないときは原因と次の行動が出る', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(wrap(<MainScreen />));
    openPanel();
    const region = screen.getByRole('region', { name: '顧客パック' });
    const buttons = within(region).getAllByRole('button', { name: /コピー/ });
    expect(buttons.length).toBe(7); // Prompt 2 つ（M365・GitHub Copilot）+ 5 コマンド（pipeline・check・verify・build・start）
    fireEvent.click(within(region).getByRole('button', { name: '形式の検査をコピー' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PACK_COMMANDS.check));
    await waitFor(() => expect(within(region).getByText('コピーしました')).toBeTruthy());
    writeText.mockRejectedValue(new Error('denied'));
    fireEvent.click(within(region).getByRole('button', { name: 'ビルドをコピー' }));
    await waitFor(() => expect(within(region).getByText(/コピーできませんでした.*Ctrl\+C/)).toBeTruthy());
  });

  // FR-268 AC-684
  it('FR-268 AC-684 コマンド・パスが package.json の scripts と実在のファイル・README・QuickStart §13 と一致する', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    for (const n of ['pipeline', 'check:pack', 'verify:pack', 'build', 'start']) expect(scripts[n], n).toBeTruthy();
    expect(PACK_COMMANDS.pipeline).toContain('npm run pipeline');
    expect(PACK_COMMANDS.check).toContain('npm run check:pack');
    expect(PACK_COMMANDS.verify).toContain('npm run verify:pack');
    expect(existsSync(join(ROOT, PACK_PROMPT_FILE))).toBe(true);
    for (const [file, text] of [[PACK_PROMPT_FILE, PACK_PROMPT_M365], [PACK_PROMPT_FILE_GHCP, PACK_PROMPT_GHCP]] as const) {
      expect(read(file).replace(/\r\n/g, '\n')).toContain(text);
    }
    expect(read('users-guide/01-quick-start.md')).toContain(PACK_PROMPT_FILE_GHCP);
    expect(existsSync(join(ROOT, PACK_SAMPLE))).toBe(true);
    const readme = read('README.md');
    expect(readme).toContain(PACK_URL);
    expect(readme).toContain('npm run pipeline -- all --customer');
    expect(readme).toContain(PACK_PROMPT_FILE);
    expect(readme).toContain('npm run check:pack -- ');
    expect(readme).toContain('npm run verify:pack -- <作業フォルダー>');
    const qs = read('users-guide/01-quick-start.md');
    expect(qs).toContain(PACK_URL);
    expect(qs).toContain('npm run build');
  });
});

describe('FR-272 分析画面の「使い方」', () => {
  // FR-272 AC-690・AC-697
  it('FR-272 AC-690 AC-697 「使い方」ボタンで画面の見方・よく使う操作・顧客パックが出て、Esc で閉じる', async () => {
    render(wrap(<><GuideHost /><GuideButton /></>));
    const btn = screen.getByRole('button', { name: '使い方' });
    fireEvent.click(btn);
    const dlg = await screen.findByRole('dialog', { name: '使い方' });
    for (const s of ['画面の見方', 'よく使う操作', '顧客パック']) expect(dlg.textContent).toContain(s);
    expect(GUIDE_WORKSPACE.ops.join('')).toContain('メイン画面へ戻る');
    expect(within(dlg).getByText('カード 1 / 5')).toBeTruthy();
    fireEvent.keyDown(dlg, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(localStorage.getItem(GUIDE_ACK_KEY)).toBeNull();
  });
});
