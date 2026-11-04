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
import { PANEL_MOTION_MS } from '../../src/guide/GettingStarted';
import { resetGuide, useGuide } from '../../src/guide/guideStore';
import { GUIDE_STEPS, GUIDE_TERMS, PACK_COMMANDS, PACK_KIT_FILE, PACK_PROMPT_FILE, PACK_PROMPT_FILE_GHCP, PACK_PROMPT_GHCP, PACK_PROMPT_M365, PACK_SAMPLE, PACK_URL, GUIDE_WHAT, GUIDE_WORKSPACE } from '../../src/guide/guideContent';

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
  it('FR-267 AC-679 スキップ・最後まで見る・Esc のどれで閉じても何も保存せず、新しく描画（再起動）しても自動では開かず、アイコンから再度開ける。「次回から表示しない」はない', async () => {
    const closers: Array<(dlg: HTMLElement) => void> = [
      (dlg) => fireEvent.click(within(dlg).getByRole('button', { name: 'スキップ' })),
      (dlg) => { for (let i = 0; i < 3; i++) fireEvent.click(within(dlg).getByRole('button', { name: '次へ' })); fireEvent.click(within(dlg).getByRole('button', { name: '閉じる' })); },
      (dlg) => fireEvent.keyDown(dlg, { key: 'Escape' }),
    ];
    for (const close of closers) {
      resetGuide();
      const view = render(wrap(<><GuideHost /><MainScreen /></>));
      expect(screen.queryByRole('dialog')).toBeNull(); // 起動時（初回・再起動）は自動では開かない
      fireEvent.click(screen.getByRole('button', { name: '使い方を見る' }));
      const dlg = await screen.findByRole('dialog', { name: 'ウェルカム' });
      expect(within(dlg).queryByRole('checkbox')).toBeNull();
      expect(within(dlg).queryByText('次回から表示しない')).toBeNull();
      close(dlg);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(localStorage.length).toBe(0); // 「確認済み」を含め、何も保存しない
      view.unmount(); // 再読込・新しいタブ相当（画面を作り直す）
      resetGuide();
      render(wrap(<><GuideHost /><MainScreen /></>));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('button', { name: '使い方を見る' })).toBeTruthy();
      cleanup();
    }
  });

  it('FR-267 AC-679 旧実装の自動表示・確認済みの保存が残っていない', () => {
    expect(existsSync(join(ROOT, 'src/guide/WelcomeAuto.tsx'))).toBe(false);
    const store = read('src/guide/guideStore.ts');
    expect(store).not.toMatch(/localStorage|welcomeAck|autoOpen|shouldAutoShow/);
    expect(read('src/guide/WelcomeDialog.tsx')).not.toMatch(/Checkbox|t\('次回から表示しない'\)/);
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

  // FR-267 AC-680（焦点: 開くと最初の操作対象へ、閉じるとアイコンへ戻る）
  it('FR-267 AC-680 開くとダイアログ内の最初の操作対象に焦点が移り、閉じるとアイコンに焦点が戻る', async () => {
    render(wrap(<><GuideHost /><MainScreen /></>));
    const icon = screen.getByRole('button', { name: '使い方を見る' });
    icon.focus();
    fireEvent.click(icon);
    const dlg = await screen.findByRole('dialog', { name: 'ウェルカム' });
    await waitFor(() => expect(dlg.contains(document.activeElement)).toBe(true));
    fireEvent.click(within(dlg).getByRole('button', { name: 'スキップ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(icon));
  });

  // FR-267 AC-681
  it('FR-267 AC-681 右上のアイコン「使い方を見る」は、ツールチップ・ラベルを持つキーボードで操作できるボタンで、押すと同じダイアログが開く', async () => {
    render(wrap(<><GuideHost /><MainScreen /></>));
    const icon = screen.getByRole('button', { name: '使い方を見る' }) as HTMLButtonElement;
    expect(icon.tagName).toBe('BUTTON'); // ネイティブのボタン: Tab で到達し、Enter／Space で押せる
    expect(icon.disabled).toBe(false);
    expect(icon.tabIndex).toBeGreaterThanOrEqual(0);
    expect(icon.querySelector('svg')).toBeTruthy(); // アイコン
    expect(icon.textContent).toContain('使い方を見る'); // 表示ラベル
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // 画面の先頭（見出しの行）に置く
    icon.focus();
    expect(document.activeElement).toBe(icon);
    fireEvent.click(icon); // Enter／Space はブラウザーが click に変換する
    expect(await screen.findByRole('dialog', { name: 'ウェルカム' })).toBeTruthy();
  });

  it('FR-267 AC-681 「動きを減らす」が有効なとき、カードの切替は 0 ms（アニメーションなし）。無効なときは動きを付ける', async () => {
    const original = window.matchMedia;
    const stub = (reduce: boolean) => { window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; };
    try {
      for (const [reduce, ms] of [[true, '0'], [false, '150']] as const) {
        stub(reduce);
        render(wrap(<><GuideHost /><MainScreen /></>));
        fireEvent.click(screen.getByRole('button', { name: '使い方を見る' }));
        const dlg = await screen.findByRole('dialog', { name: 'ウェルカム' });
        expect(within(dlg).getByTestId('guide-card').getAttribute('data-motion-ms')).toBe(ms);
        fireEvent.click(within(dlg).getByRole('button', { name: '次へ' }));
        expect(within(dlg).getByTestId('guide-card').getAttribute('data-motion-ms')).toBe(ms);
        cleanup(); resetGuide();
      }
    } finally { window.matchMedia = original; }
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
    expect(buttons.length).toBe(10); // Prompt 2 つ（M365・GitHub Copilot）+ 8 コマンド（clone・install・pack:kit・pipeline・check・verify・build・start）
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

  // FR-268 AC-829 AC-830（単体: 文面と手順が kit の運用と一致する）
  it('FR-268 AC-829 M365 用 Prompt は kit の schema に従い、添付がなければ作らず添付を求める。入手できない添付の記述は残らない', () => {
    expect(PACK_PROMPT_M365).toContain('customer-pack-kit.md');
    expect(PACK_PROMPT_M365).toMatch(/見当たらないときは、顧客パックを作らず、私に添付を求めて/);
    for (const text of [PACK_PROMPT_M365, PACK_PROMPT_GHCP, read('users-guide/01-quick-start.md'), read(PACK_PROMPT_FILE)]) {
      expect(text).not.toMatch(/添付の\s*`?schema\/\*\.json/);
    }
  });

  it('FR-268 AC-830 画面の説明に ①準備〜⑥画面への反映の手順・kit の場所・コピーできるコマンドがあり、scripts と一致する', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    expect(scripts['pack:kit']).toContain('make-pack-kit');
    expect(PACK_KIT_FILE).toBe('tools/envisioning/_attach/customer-pack-kit.md');
    expect(PACK_COMMANDS.kit).toBe('npm run pack:kit');
    expect(PACK_COMMANDS.install).toBe('npm install');
    expect(existsSync(join(ROOT, 'scripts/make-pack-kit.ts'))).toBe(true);
    render(wrap(<MainScreen />));
    openPanel();
    const t = screen.getByRole('region', { name: '顧客パック' }).textContent ?? '';
    for (const s of ['準備', '方法 A', '方法 B', '方法 C', '検証', '画面への反映', PACK_KIT_FILE, 'public/data', 'public/brand', 'エラー', 'npm install', 'npm run pack:kit']) expect(t, s).toContain(s);
  });
  // FR-268 AC-834 AC-835 AC-836
  it('FR-268 AC-834 AC-835 kit は折りたたみで、開くと tools の kit（buildKit() の出力）と一致する全文が出て、コピーできる', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { buildKit } = await import('../../scripts/make-pack-kit');
    const canonical = read(PACK_KIT_FILE).replace(/\r\n/g, '\n');
    // 古いとき: 直し方（npm run pack:kit）を示して失敗する
    expect(canonical, '画面の kit が古い。直し方: npm run pack:kit').toBe(buildKit());
    render(wrap(<MainScreen />));
    openPanel();
    const region = screen.getByRole('region', { name: '顧客パック' });
    const details = region.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    details.open = true;
    fireEvent(details, new Event('toggle'));
    const btn = await within(region).findByRole('button', { name: 'kitをコピー' });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((writeText.mock.calls[0]![0] as string).replace(/\r\n/g, '\n')).toBe(canonical);
    await waitFor(() => expect(within(region).getAllByText('コピーしました').length).toBeGreaterThan(0));
  });

  it('FR-268 AC-836 schema の入手先は平易な文で、担当者向けの更新手順は別の 1 行に残る', () => {
    render(wrap(<MainScreen />));
    openPanel();
    const t = screen.getByRole('region', { name: '顧客パック' }).textContent ?? '';
    expect(t).toContain('書式の定義は、下の「kit」にまとまっています');
    expect(t).not.toContain('リポジトリの schema/');
    expect(t).toMatch(/書式が古い[\s\S]{0,60}担当者[\s\S]{0,20}依頼/);
    expect(t).toContain('npm run gen:schema');
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
    expect(localStorage.length).toBe(0);
  });
});
