// @vitest-environment jsdom
// NFR-UX-016（AC-477）・NFR-UX-017（AC-480）・NFR-A11Y-009（AC-484・AC-485）の単体・結合テスト。
// デザイン基盤の部品（画面の切替のフェード・ダイアログの動きとフォーカスの戻り・ブランドの色の補正・操作の対象の大きさ）を確かめる。
// 全画面での見た目の判定は System Test（tests/system/e2e/fluent-design.spec.ts・a11y-all-screens.spec.ts）が行う。
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { useState } from 'react';
import { Dialog, DialogSurface, returnFocus } from '../../src/components/Dialog';
import { SCREEN_FADE_ATTR, fadeInScreen, screenMotionAllowed } from '../../src/motion/transitions';
import { useAnimation } from '../../src/store/animation';
import { buildBrandTheme } from '../../src/theme/brandTheme';
import { contrastRatio } from '../../src/theme/brand';
import { MIN_TARGET_PX } from '../../src/theme/tokens';

function mockReducedMotion(reduce: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('prefers-reduced-motion') ? reduce : false,
    media: q, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  mockReducedMotion(false);
  useAnimation.setState({ playing: true, choice: null });
});
afterEach(() => cleanup());

describe('NFR-UX-017 AC-480 画面の切替のフェード', () => {
  // NFR-UX-017 AC-480
  it('NFR-UX-017 AC-480 動きを付けてよいとき、開いた画面の面にフェードの印を付け、動きが終わった後（上限より十分に後）に外す', () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('section');
      document.body.append(el);
      fadeInScreen(el, true);
      expect(el.hasAttribute(SCREEN_FADE_ATTR)).toBe(true);
      vi.advanceTimersByTime(500);
      expect(el.hasAttribute(SCREEN_FADE_ATTR)).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(el.hasAttribute(SCREEN_FADE_ATTR)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // NFR-UX-017 AC-480
  it('NFR-UX-017 AC-480 停止中（FR-071）・視差効果を減らす（FR-072）では、印を付けず最終の状態のまま', () => {
    const el = document.createElement('section');
    fadeInScreen(el, false);
    expect(el.hasAttribute(SCREEN_FADE_ATTR)).toBe(false);
    useAnimation.setState({ playing: false });
    expect(screenMotionAllowed()).toBe(false);
    useAnimation.setState({ playing: true });
    mockReducedMotion(true);
    expect(screenMotionAllowed()).toBe(false);
    mockReducedMotion(false);
    expect(screenMotionAllowed()).toBe(true);
  });

  // NFR-UX-017 AC-480
  it('NFR-UX-017 AC-480 フェードはモーションのトークン（所要時間・イージング）で指定し、視差効果を減らすでは全画面の動きを 0 にする', () => {
    const css = readFileSync('src/theme/design.css', 'utf8');
    expect(css).toMatch(/\[data-screen-fade\]::after[\s\S]*animation-duration: var\(--durationNormal\)[\s\S]*animation-timing-function: var\(--curveDecelerateMid\)/);
    expect(css).toMatch(/@keyframes edb-screen-fade[\s\S]*opacity: 1[\s\S]*opacity: 0/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[\s\S]*animation-duration: 0s !important;[\s\S]*transition-duration: 0s !important;/);
    // 覆いはポインターを受けない（操作を妨げない）
    expect(css).toMatch(/\[data-screen-fade\]::after\s*\{[^}]*pointer-events: none/);
  });
});

function Harness({ initial = false }: { initial?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <FluentProvider theme={webLightTheme}>
      <button type="button" onClick={() => setOpen(true)}>開く</button>
      {open ? (
        <Dialog open onOpenChange={(_, d) => setOpen(d.open)}>
          <DialogSurface aria-label="テストのダイアログ">
            <button type="button" onClick={() => setOpen(false)}>閉じる</button>
          </DialogSurface>
        </Dialog>
      ) : null}
    </FluentProvider>
  );
}

describe('NFR-A11Y-009 AC-484 ダイアログを閉じるとフォーカスが開く前の要素に戻る', () => {
  // NFR-A11Y-009 AC-484
  it('NFR-A11Y-009 AC-484 フォーカスが行き場を失っているときだけ、開く前の要素へ戻す', () => {
    const opener = document.createElement('button');
    const other = document.createElement('button');
    document.body.append(opener, other);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(returnFocus(opener)).toBe(true);
    expect(document.activeElement).toBe(opener);
    other.focus();
    expect(returnFocus(opener)).toBe(false);
    expect(document.activeElement).toBe(other);
    opener.remove();
    other.blur();
    expect(returnFocus(opener)).toBe(false);
  });

  // NFR-A11Y-009 AC-484
  it('NFR-A11Y-009 AC-484 親が描画の有無で開閉するダイアログでも、閉じた後に開いたボタンへフォーカスが戻る', async () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      const opener = screen.getByRole('button', { name: '開く' });
      opener.focus();
      act(() => opener.click());
      const close = await vi.waitFor(() => screen.getByRole('button', { name: '閉じる' }));
      close.focus();
      act(() => close.click());
      act(() => { vi.runAllTimers(); });
      expect(document.activeElement).toBe(opener);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('NFR-UX-017 AC-480 ダイアログの出入りの動き', () => {
  // NFR-UX-017 AC-480
  it('NFR-UX-017 AC-480 視差効果を減らすが有効なら、ダイアログを動きなし（Fluent の motion を外す）で開く', () => {
    const src = readFileSync('src/components/Dialog.tsx', 'utf8');
    expect(src).toMatch(/surfaceMotion=\{motion \? props\.surfaceMotion : null\}/);
    expect(src).toMatch(/backdropMotion=\{motion \? props\.backdropMotion : null\}/);
    mockReducedMotion(true);
    render(<Harness initial />);
    expect(screen.getByRole('dialog', { name: 'テストのダイアログ' })).toBeTruthy();
  });

  // NFR-UX-017 AC-480
  it('NFR-UX-017 AC-480 アプリのダイアログは共通の包み（src/components/Dialog.tsx）を使う', () => {
    const files = readFileSync('src/commands/CommandPalette.tsx', 'utf8');
    expect(files).toMatch(/import \{ Dialog, DialogSurface \} from '\.\.\/components\/Dialog'/);
  });
});

describe('NFR-UX-016 AC-477 ブランドの色のコントラスト（ホバー・押下の面を含む）', () => {
  // NFR-UX-016 AC-477
  it('NFR-UX-016 AC-477 ブランドの文字・アイコンの色は、既定・ホバー・押下のどの面とも 4.5:1 以上（Light・Dark、明るい・暗いブランドの色）', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const primary of ['#7B2D8E', '#F2C744', '#0F6CBD', '#1B5E20']) {
        const t = buildBrandTheme(mode, primary).theme as unknown as Record<string, string>;
        for (const fg of ['colorNeutralForeground2BrandHover', 'colorNeutralForeground2BrandPressed', 'colorNeutralForeground2BrandSelected', 'colorBrandForeground1', 'colorBrandForegroundLink']) {
          for (const bg of ['colorNeutralBackground1', 'colorNeutralBackground1Hover', 'colorSubtleBackgroundHover']) {
            expect(contrastRatio(t[fg]!, t[bg]!), `${mode} ${primary} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
});

describe('NFR-A11Y-009 AC-485 操作の対象の大きさ（部品の指定）', () => {
  // NFR-A11Y-009 AC-485
  it('NFR-A11Y-009 AC-485 操作の対象の最小の大きさは PARAM-040（24px）で、主要な小さな部品は 24px 以上を指定している', () => {
    expect(MIN_TARGET_PX).toBe(24);
    const gantt = readFileSync('src/screens/GanttScreen.tsx', 'utf8');
    expect(gantt).toMatch(/bar: \{[\s\S]*?height: '24px',[\s\S]*?minWidth: '24px'/);
    expect(readFileSync('src/audio/AudioControls.tsx', 'utf8')).toMatch(/height: '24px'/);
    expect(readFileSync('src/three/LodNavigator.tsx', 'utf8')).toMatch(/minHeight: '24px'/);
    expect(readFileSync('src/components/AppShell.tsx', 'utf8')).toMatch(/'& > \*': \{ flexShrink: 0 \}/);
    expect(readFileSync('src/screens/KnowledgeGraphScreen.tsx', 'utf8')).toMatch(/MIN_TARGET_PX \/ Math\.max\(scale/);
  });
});

describe('NFR-A11Y-009 AC-483 拡大・縮小できる面の印と、面の中の文字の省略記号＋全文', () => {
  // NFR-A11Y-009 AC-483（A-51。CONTRACT.md §21 の data-zoom-surface）
  it('NFR-A11Y-009 AC-483 地図・ホワイトボード・グラフの描画領域に data-zoom-surface を付ける', () => {
    expect(readFileSync('src/screens/MapScreen.tsx', 'utf8')).toMatch(/data-zoom-surface="map"/);
    expect(readFileSync('src/ink/BoardSurface.tsx', 'utf8')).toMatch(/data-zoom-surface=\{overlay \? undefined : 'whiteboard'\}/);
    expect(readFileSync('src/screens/KnowledgeGraphScreen.tsx', 'utf8')).toMatch(/data-zoom-surface="graph"/);
  });

  // NFR-A11Y-009 AC-483
  it('NFR-A11Y-009 AC-483 3D のラベルは 1 行に収まらない分を省略記号にし、全文を title に持つ', async () => {
    const { sceneLabelStyle } = await import('../../src/three/labelStyles');
    expect(sceneLabelStyle).toMatchObject({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    expect(readFileSync('src/three/TwinScene.tsx', 'utf8')).toMatch(/style=\{labelStyle\} title=\{o\.name\}/);
    expect(readFileSync('src/three/Graph3D.tsx', 'utf8')).toMatch(/style=\{labelStyle\} title=\{n\.label\}/);
  });

  // NFR-A11Y-009 AC-483
  it('NFR-A11Y-009 AC-483 地図の拠点は省略記号を使い、全文をボタンの名前に持つ', () => {
    const map = readFileSync('src/screens/MapScreen.tsx', 'utf8');
    expect(map).toMatch(/marker: \{[\s\S]*?textOverflow: 'ellipsis'/);
    expect(map).toMatch(/aria-label=\{`拠点 \$\{site\.name\}/);
  });
});
