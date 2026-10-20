// FR-225 の単体テスト（AC-523 のトークン層・AC-524）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, MIN_CONTRAST_TEXT, MIN_CONTRAST_UI } from '../../src/theme/brand';
import { THEMES } from '../../src/theme/resolve';
import { CONTRAST_PAIRS, STATE_STYLES, type UiState } from '../../src/theme/stateTokens';
import { withContrastFixes } from '../../src/theme/tokens';

const STATES: UiState[] = ['rest', 'hover', 'pressed', 'selected', 'focus', 'disabled', 'success', 'warning', 'error'];

describe('FR-225 AC-523 トークンのコントラスト（ライト・ダーク）', () => {
  for (const name of ['light', 'dark'] as const) {
    it(`FR-225 AC-523 ${name}: 主な前景と背景の組が 文字 4.5:1・UI 部品 3:1 以上`, () => {
      const theme = withContrastFixes(THEMES[name]) as unknown as Record<string, string>;
      const bad: string[] = [];
      let min = Infinity;
      for (const p of CONTRAST_PAIRS) {
        const r = contrastRatio(theme[p.fg] ?? '#000000', theme[p.bg] ?? '#FFFFFF');
        min = Math.min(min, r);
        if (r < (p.kind === 'text' ? MIN_CONTRAST_TEXT : MIN_CONTRAST_UI)) bad.push(`${p.name} ${r.toFixed(2)}`);
      }
      expect(bad, `最小 ${min.toFixed(2)}`).toEqual([]);
    });
  }
});

describe('FR-225 AC-524 状態の区別（色以外）', () => {
  it('FR-225 AC-524 9 つの状態すべてに、互いに異なる色以外の手がかり（記号・文字・形の組）がある', () => {
    expect(Object.keys(STATE_STYLES).sort()).toEqual([...STATES].sort());
    const keys = new Set<string>();
    for (const s of STATES) {
      const c = STATE_STYLES[s].cue;
      expect(c.label.length).toBeGreaterThan(0);
      keys.add(`${c.glyph}|${c.label}|${c.shape}`);
    }
    expect(keys.size).toBe(STATES.length);
    for (const s of ['success', 'warning', 'error'] as const) expect(STATE_STYLES[s].cue.glyph).not.toBe('');
  });
  it('FR-225 AC-524 成功・警告・エラーの記号は互いに異なる', () => {
    const g = ['success', 'warning', 'error'].map((s) => STATE_STYLES[s as UiState].cue.glyph);
    expect(new Set(g).size).toBe(3);
  });
});

// FR-225 AC-524: 見出し・左メニュー・設定・ステップの部品に直書きの色がない
describe('FR-225 AC-524 直書きの色 0 件', () => {
  const root = path.resolve(__dirname, '../../src');
  const TARGET = /(Heading|Header|Menu|Nav|Settings|Step|Stepper|PanelHandle|Panel)[^/\\]*\.(tsx|ts|css)$|[\\/]theme[\\/](?!brand)[^/\\]+\.(ts|tsx|css)$|[\\/]stepper[\\/]|[\\/]settings[\\/]/;
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
  function walk(d: string, out: string[] = []): string[] {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p, out); else if (TARGET.test(p) && !/[\\/]show[\\/]ControlBar/.test(p)) out.push(p);
    }
    return out;
  }
  it('FR-225 AC-524 対象の部品に色のリテラルがない', () => {
    const hits: string[] = [];
    for (const f of walk(root)) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        const code = l.replace(/\/\/.*$/, '').replace(/`[^`]*色として読めません[^`]*`/, '');
        if (/^\s*(\*|\/\*)/.test(l)) return;
        if (LITERAL.test(code)) hits.push(`${path.relative(root, f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
