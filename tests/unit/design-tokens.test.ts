// NFR-UX-015（AC-475）・NFR-UX-016（AC-478）・NFR-UX-017（AC-479）の結合テスト: 雛形のソース（src/ の全画面・全コンポーネント）の静的検査。
// 色・文字の大きさ・行の高さ・文字の太さ・余白・角丸・線の太さ・影・動きの指定が、Fluent 2 のトークンの参照か、トークンの定義ファイルの中だけにあることを確かめる。
// 例外（検査の除外）は下の EXCEPTIONS に、理由（[ASSUMPTION] A-51 の項目）とともに明示する。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokens } from '@fluentui/react-components';
import {
  ELEVATION_LEVEL, FLUENT2_RADIUS, MOTION, MOTION_MAX_MS, RADIUS_RAMP_PX, SPACING_RAMP_PX, TEXT, TYPE_RAMP,
  elevationStyles, forcedColorsTheme, isSpacingRamp, isTypeRamp, shadowOf, withDesignFoundation,
} from '../../src/theme/tokens';
import { webDarkTheme, webLightTheme } from '@fluentui/react-components';

const SRC = 'src';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) ? [p.replaceAll('\\', '/')] : [];
  });
}

/** 検査の対象から外すファイル（規則ごと）。理由は [ASSUMPTION] A-51 とトークンの定義ファイル */
const EXCEPTIONS: Record<string, { rules: Rule[] | 'all'; reason: string }> = {
  // トークンの定義ファイル（値の定義はここだけにある）
  'src/theme/tokens.ts': { rules: 'all', reason: 'デザイントークンの定義ファイル' },
  'src/theme/design.css': { rules: 'all', reason: 'デザイン基盤のグローバルの規則（トークンの参照だけ。システム色を含む）' },
  'src/motion/fluent.ts': { rules: 'all', reason: 'モーションのトークン（所要時間・イージング）の定義ファイル（JS から使う値）' },
  'src/theme/brand.ts': { rules: 'all', reason: 'A-51: 顧客のブランドの色から生成したランプ（FR-059。生成結果をトークンとして登録する）' },
  'src/theme/brandTheme.ts': { rules: 'all', reason: 'A-51: ブランドのランプからテーマのトークンを作る定義（FR-059・FR-062 の書体の順を含む）' },
  // 3D シーンの材質・光源（A-51）
  'src/three/ArchitectureStack.tsx': { rules: ['color'], reason: 'A-51: 3D シーンの材質の色' },
  'src/three/Graph3D.tsx': { rules: ['color'], reason: 'A-51: 3D シーンの材質の色' },
  'src/three/DataViewer3D.tsx': { rules: ['color'], reason: 'A-51: 3D シーンの材質の色' },
  'src/three/TwinScene.tsx': { rules: ['color'], reason: 'A-51: 3D シーンの材質の色' },
  'src/three/presets.ts': { rules: ['color'], reason: 'A-51: 3D シーンの材質・光源（業種プリセット）' },
  'src/map/MapScene.tsx': { rules: ['color'], reason: 'A-51: 3D の地図のシーンの材質の色' },
  // 演出の時間（FR-016・FR-164・FR-177。A-51・NFR-UX-017 の上限の対象外）
  'src/story/StoryHost.tsx': { rules: ['motion', 'type'], reason: 'A-51: ストーリーの演出（FR-177）の時間と、画面の幅に合わせて伸縮する演出の文字' },
  'src/usecase/storyboard.css': { rules: ['motion', 'type', 'color', 'radius', 'shadow', 'stroke'], reason: 'A-51: ストーリーボードの演出（FR-164）の時間・スタイル（アニメ・アイソメトリック・手描き風の作風の値）' },
  'src/show/Quiz.tsx': { rules: ['motion', 'type'], reason: 'A-51: プレゼンテーションの演出（FR-016）の時間と演出の文字' },
  'src/show/ControlBarActions.tsx': { rules: ['color', 'shadow', 'radius', 'spacing'], reason: 'A-51: プレゼンテーションの演出（FR-016）のレーザーポインターの光と位置合わせ（画面の部品の色・余白ではない）' },
  'src/app/Opening.tsx': { rules: ['motion', 'type'], reason: 'A-51: オープニングの演出（FR-016）の時間と演出の文字' },
  // 拡大・縮小できる面の中の文字（等倍以外。A-51・AC-476）
  'src/screens/Drawing2DScreen.tsx': { rules: ['type', 'stroke'], reason: 'A-51: 拡大・縮小できる面（2D 図面。SVG の図の座標で指定する文字と線）' },
  'src/ink/BoardSurface.tsx': { rules: ['type', 'spacing'], reason: 'A-51: 拡大・縮小できる面（ホワイトボード。倍率に比例する付箋の文字と余白）' },
  'src/three/entityLayout.ts': { rules: 'all', reason: 'A-51: 3D シーンの配置の寸法（シーンの座標。画面の部品の余白ではない）' },
  'src/show/ShowStage.tsx': { rules: ['type', 'motion'], reason: 'A-51: プレゼンテーションの演出（FR-016）の大きな数値の文字と演出の時間' },
  // 画面の見た目ではなく、出力するファイル（Mermaid・SVG・PDF・動画）や canvas に描く内容の値（画面の部品のスタイルの指定ではない）
  'src/analysis/architecture.ts': { rules: ['color'], reason: '出力ファイル（Mermaid・SVG）の生成の色' },
  'src/analysis/tree.ts': { rules: ['color'], reason: '出力ファイル（SVG）の生成の色' },
  'src/export/pdf.ts': { rules: ['color'], reason: '出力ファイル（PDF）の生成の色' },
  'src/export/svg.ts': { rules: ['color'], reason: '出力ファイル（SVG）の生成の色' },
};

type Rule = 'color' | 'type' | 'spacing' | 'radius' | 'stroke' | 'shadow' | 'motion';

function excepted(file: string, rule: Rule): boolean {
  const e = EXCEPTIONS[file];
  return !!e && (e.rules === 'all' || e.rules.includes(rule));
}

/** コメントを除く（文字列の中の // は残す） */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n');
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
/** 値の式（文字列リテラル・テンプレート・識別子・数値の並び。次の「,」「}」・行末まで） */
const VALUE = "((?:`[^`]*`|'[^'\\n]*'|\"[^\"\\n]*\"|[^,\\n}'\"`])+)";
const prop = (names: string) => new RegExp(`\\b(${names})\\s*:\\s*${VALUE}`, 'g');

/** 0 の値と -1（calc の符号）は直書きとみなさない */
const ZERO = /^-?0(?:\.0+)?(?:px|s|ms|%|em|rem)?$/;

/**
 * 値（式の文字列）の中の直書きの値（数字を含む語）。トークンの参照（tokens.*・TEXT.*・var(--…)）・テンプレートの ${…}・
 * 変数（数字を含まない識別子）・キーワードは除く。
 */
function literalParts(expr: string): string[] {
  const rest = expr
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/var\(--[\w-]+(?:,[^)]*)?\)/g, ' ')
    .replace(/\b(?:tokens|TEXT|MOTION|FLUENT2_RADIUS)\.[\w.]+/g, ' ')
    .replace(/['"`]|calc\(|\)|\(|,|\*|\+|\//g, ' ');
  return rest.split(/\s+/).filter(Boolean).filter((w) => /\d/.test(w) && !ZERO.test(w) && w !== '-1');
}

interface Hit { file: string; line: number; rule: Rule; text: string }

const PROP_RULES: Array<[Rule, RegExp]> = [
  ['type', prop('fontSize|lineHeight|fontWeight')],
  ['spacing', prop('padding|paddingTop|paddingRight|paddingBottom|paddingLeft|paddingInline|paddingBlock|paddingInlineStart|paddingInlineEnd|paddingBlockStart|paddingBlockEnd|margin|marginTop|marginRight|marginBottom|marginLeft|marginInline|marginBlock|marginInlineStart|marginInlineEnd|marginBlockStart|marginBlockEnd|gap|rowGap|columnGap')],
  ['radius', prop('borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius')],
  ['stroke', prop('borderWidth|borderTopWidth|borderRightWidth|borderBottomWidth|borderLeftWidth|borderInlineStartWidth|borderInlineEndWidth|outlineWidth')],
  ['shadow', prop('boxShadow|textShadow')],
  ['motion', prop('transitionDuration|animationDuration|transitionTimingFunction|animationTimingFunction|transitionDelay|animationDelay')],
];
const EASING_LITERAL = /cubic-bezier|\bease(?:-in|-out|-in-out)?\b|\blinear\b|\bsteps\(/;

/** TS・TSX のスタイルの指定（makeStyles の object・style 属性・SVG の属性）を検査する */
function scanTs(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = stripComments(text).split('\n');
  lines.forEach((l, i) => {
    const push = (rule: Rule, t: string) => { if (!excepted(file, rule)) hits.push({ file, line: i + 1, rule, text: t.trim().slice(0, 120) }); };
    for (const [rule, re] of PROP_RULES) {
      for (const m of l.matchAll(re)) {
        const v = m[2]!;
        const bad = rule === 'motion' && /TimingFunction/.test(m[1]!) ? EASING_LITERAL.test(v.replace(/\$\{[^}]*\}/g, '')) : literalParts(v).length > 0;
        if (bad) push(rule, `${m[1]}: ${v}`);
      }
    }
    // 線の太さの直書き（border・outline の一括指定）
    for (const m of l.matchAll(prop('border|borderTop|borderRight|borderBottom|borderLeft|borderInlineStart|borderInlineEnd|borderBlockStart|borderBlockEnd|outline'))) {
      if (/(?:^|[\s'"`])\d+(?:\.\d+)?px\b/.test(m[2]!.replace(/\$\{[^}]*\}/g, ' '))) push('stroke', `${m[1]}: ${m[2]}`);
    }
    // 色（CSS のプロパティ・SVG の属性）
    for (const m of l.matchAll(/\b(color|backgroundColor|background|borderColor|border\w*Color|border|borderTop|borderRight|borderBottom|borderLeft|outline|outlineColor|fill|stroke|accentColor|caretColor|boxShadow)\s*[:=]\s*\{?\s*((?:`[^`]*`|'[^'\n]*'|"[^"\n]*"|[^,\n}'"`])+)/g)) {
      if (COLOR_LITERAL.test(m[2]!)) push('color', `${m[1]}: ${m[2]}`);
    }
    // 動きの一括指定（transition・animation）の直書きの時間・イージング
    for (const m of l.matchAll(prop('transition|animation'))) {
      const v = m[2]!.replace(/\$\{[^}]*\}/g, ' ');
      if (/(?:^|[\s'"`])\d+(?:\.\d+)?m?s\b/.test(v) || EASING_LITERAL.test(v)) push('motion', `${m[1]}: ${m[2]}`);
    }
  });
  return hits;
}

/** CSS ファイルの宣言を検査する（var(--token) の参照だけを許す。var の予備の値は参照の一部として扱う） */
function scanCss(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const map: Array<[Rule, RegExp]> = [
    ['type', /^(font-size|line-height|font-weight)$/],
    ['spacing', /^(padding|margin|gap|row-gap|column-gap)(-[\w-]+)?$/],
    ['radius', /^border(-[\w-]+)?-radius$/],
    ['stroke', /^(border(-[\w-]+)?-width|outline-width)$/],
    ['shadow', /^(box-shadow|text-shadow)$/],
    ['motion', /^(transition|animation)(-duration|-delay|-timing-function)?$/],
  ];
  body.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/(?:^|[\s;{])([a-z-]+)\s*:\s*([^;{}]+);?/g)) {
      const name = m[1]!;
      const raw = m[2]!;
      const value = raw.replace(/var\(--[\w-]+(?:,[^)]*\))?\)?/g, ' ').replace(/calc\(|\)|\(|\*|,|!important/g, ' ');
      const words = value.split(/\s+/).filter(Boolean).filter((w) => !ZERO.test(w) && w !== '-1');
      for (const [rule, re] of map) {
        if (!re.test(name) || excepted(file, rule)) continue;
        const bad = rule === 'motion' ? words.some((w) => /^\d+(?:\.\d+)?m?s$/.test(w)) || EASING_LITERAL.test(value) : words.some((w) => /\d/.test(w));
        if (bad) hits.push({ file, line: i + 1, rule, text: `${name}: ${raw.trim()}`.slice(0, 120) });
      }
      if (/^(color|background|background-color|border(-[\w-]+)?|outline(-color)?|fill|stroke)$/.test(name) && COLOR_LITERAL.test(raw.replace(/var\(--[\w-]+,[^)]*\)/g, ' ')) && !excepted(file, 'color')) {
        hits.push({ file, line: i + 1, rule: 'color', text: `${name}: ${raw.trim()}`.slice(0, 120) });
      }
    }
  });
  return hits;
}
function scanAll(): Hit[] {
  return walk(SRC).flatMap((f) => {
    const text = readFileSync(f, 'utf8');
    return f.endsWith('.css') ? scanCss(f, text) : scanTs(f, text);
  });
}

const fmt = (h: Hit) => `${h.file}:${h.line} [${h.rule}] ${h.text}`;

describe('NFR-UX-015 AC-475 デザイントークンの静的検査', () => {
  const hits = scanAll();

  // NFR-UX-015 AC-475
  it('NFR-UX-015 AC-475 色・文字の大きさ・行の高さ・文字の太さ・余白・角丸・線の太さ・影の直書きの値が 0 件（例外の一覧を除く）', () => {
    expect(hits.filter((h) => h.rule !== 'motion').map(fmt).join('\n')).toBe('');
  });

  // NFR-UX-015 AC-475
  it('NFR-UX-015 AC-475 例外の一覧は実在するファイルを指し、理由が書かれている', () => {
    for (const [file, e] of Object.entries(EXCEPTIONS)) {
      expect(statSync(file).isFile(), file).toBe(true);
      expect(e.reason.length, file).toBeGreaterThan(4);
    }
  });

  // NFR-UX-015 AC-475
  it('NFR-UX-015 AC-475 検査は直書きを見つけられる（検査そのものの確認）', () => {
    const sample = [
      "const s = makeStyles({ a: { padding: '7px', fontSize: '13px', borderRadius: 6, boxShadow: '0 0 2px #000', color: '#123456' } });",
      "const t = { border: '1px solid red', lineHeight: 1.4, transitionDuration: '250ms' };",
    ].join('\n');
    const rules = scanTs('src/sample.tsx', sample).map((h) => h.rule);
    expect(new Set(rules)).toEqual(new Set(['spacing', 'type', 'radius', 'shadow', 'color', 'stroke', 'motion']));
    expect(scanTs('src/sample.tsx', "const ok = { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, margin: 0, fontSize: tokens.fontSizeBase300, ...TEXT.body1 };")).toEqual([]);
    expect(scanCss('src/sample.css', '.a { padding: 3px; color: #fff; transition: opacity 120ms ease; }').map((h) => h.rule).sort()).toEqual(['color', 'motion', 'spacing']);
    expect(scanCss('src/sample.css', '.a { padding: var(--spacingVerticalS); box-shadow: var(--shadow4); }')).toEqual([]);
  });

  // NFR-UX-015 AC-475
  it('NFR-UX-015 AC-475 余白の値は Fluent 2 の余白の段だけ（トークンの値が段に含まれる）', () => {
    const spacing = Object.entries(webLightTheme).filter(([k]) => /^spacing(Horizontal|Vertical)/.test(k));
    expect(spacing.length).toBeGreaterThan(0);
    for (const [k, v] of spacing) expect(isSpacingRamp(parseFloat(String(v))), `${k}=${v}`).toBe(true);
    expect([...SPACING_RAMP_PX]).toEqual([0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32]);
  });
});

describe('NFR-UX-015 デザイン基盤のトークンの対応（文字の段・角丸・影の役割）', () => {
  // NFR-UX-015 AC-475 AC-476
  it('NFR-UX-015 AC-476 文字の段は Caption 2〜Display の大きさと行の高さの組で、テーマのトークンの値と一致する', () => {
    const val = (v: string) => parseFloat(String((webLightTheme as unknown as Record<string, string>)[v.replace(/^var\(--|\)$/g, '')]));
    for (const [name, size, line] of TYPE_RAMP) {
      const t = TEXT[name];
      expect([val(t.fontSize), val(t.lineHeight)], name).toEqual([size, line]);
      expect(isTypeRamp(size, line)).toBe(true);
    }
    expect(isTypeRamp(13.333, NaN)).toBe(false);
    expect(isTypeRamp(12, 20)).toBe(false);
  });

  // NFR-UX-015 AC-476
  it('NFR-UX-015 AC-476 角丸は Fluent 2 の段（0・2・4・8・12 と Circle）にそろい、丸い端の部品は X-Large の段で表す', () => {
    for (const base of [webLightTheme, webDarkTheme]) {
      const t = withDesignFoundation(base) as unknown as Record<string, string>;
      for (const k of Object.keys(t).filter((x) => x.startsWith('borderRadius'))) {
        expect((RADIUS_RAMP_PX as readonly number[]).includes(parseFloat(t[k]!)), `${k}=${t[k]}`).toBe(true);
      }
      expect(t.borderRadiusCircular).toBe(FLUENT2_RADIUS.borderRadiusXLarge);
      expect(t.borderRadiusLarge).toBe('8px');
      expect(t.borderRadiusXLarge).toBe('12px');
    }
  });

  // NFR-UX-015 AC-476
  it('NFR-UX-015 AC-476 影は役割ごとに 1 つの段（カード 4・メニューとツールチップ 8・コールアウト 16・ナビゲーション 28・ダイアログ 64）', () => {
    expect(ELEVATION_LEVEL).toMatchObject({ card: 4, menu: 8, tooltip: 8, callout: 16, hoverCard: 16, nav: 28, sheet: 28, dialog: 64, panel: 64 });
    expect(shadowOf('card')).toBe(tokens.shadow4);
    expect(shadowOf('menu')).toBe(tokens.shadow8);
    expect(shadowOf('dialog')).toBe(tokens.shadow64);
  });

  // NFR-UX-015 AC-476（ハイコントラストでは影の代わりに境界線）
  it('NFR-UX-016 AC-477 ハイコントラストのテーマは、色のトークンを OS のシステム色にする（アイコンも周りの文字と同じ色で描かれる）', () => {
    const t = forcedColorsTheme(webDarkTheme) as unknown as Record<string, string>;
    expect(t.colorNeutralForeground1).toBe('CanvasText');
    expect(t.colorNeutralBackground1).toBe('Canvas');
    expect(t.colorBrandBackground).toBe('Canvas');
    expect(t.colorBrandForegroundLink).toBe('LinkText');
    expect(t.colorNeutralForegroundDisabled).toBe('GrayText');
    expect(t.colorSubtleBackground).toBe('transparent');
    expect(Object.entries(t).filter(([k, v]) => /^color.*(Foreground|Background|Stroke|Border)/.test(k) && !/Shadow/.test(k) && typeof v === 'string' && v.startsWith('#'))).toEqual([]);
  });

  // NFR-UX-015 AC-476（ハイコントラストでは影の代わりに境界線）
  it('NFR-UX-015 AC-476 ハイコントラスト（forced-colors）では、エレベーションを影の代わりに境界線で表す', () => {
    const st = elevationStyles('card') as unknown as Record<string, Record<string, string>>;
    const hc = st['@media (forced-colors: active)']!;
    expect(hc.boxShadow).toBe('none');
    expect(hc.outlineStyle).toBe('solid');
    expect(hc.outlineWidth).toBe(tokens.strokeWidthThin);
    const css = readFileSync('src/theme/design.css', 'utf8');
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*\[data-surface='card'\][\s\S]*outline: var\(--strokeWidthThin\) solid CanvasText/);
  });
});

describe('NFR-UX-017 AC-479 モーションの静的検査', () => {
  const hits = scanAll().filter((h) => h.rule === 'motion');

  // NFR-UX-017 AC-479
  it('NFR-UX-017 AC-479 transition・animation の所要時間とイージングの直書きが 0 件（演出の対象外の一覧を除く）', () => {
    expect(hits.map(fmt).join('\n')).toBe('');
  });

  // NFR-UX-017 AC-479
  it('NFR-UX-017 AC-479 等速（linear）は回転の動きだけに使う', () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      if (excepted(f, 'motion')) continue;
      const lines = stripComments(readFileSync(f, 'utf8')).split('\n');
      lines.forEach((l, i) => {
        if (/curveLinear|\blinear\b/.test(l) && /(Timing|timing|easing|animation|transition)/.test(l) && !/rotate|spin/i.test(lines.slice(Math.max(0, i - 3), i + 4).join('\n'))) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 100)}`);
      });
    }
    expect(bad.join('\n')).toBe('');
    expect(MOTION.rotate.easing).toBe(tokens.curveLinear);
  });

  // NFR-UX-017 AC-479 AC-480
  it('NFR-UX-017 AC-479 役割ごとの動きはモーションのトークンで、所要時間は上限（PARAM-074）以下', () => {
    const ms = (v: string) => parseFloat(String((webLightTheme as unknown as Record<string, string>)[v.replace(/^var\(--|\)$/g, '')]));
    for (const [role, m] of Object.entries(MOTION)) {
      if (!('duration' in m)) continue;
      expect(m.duration, role).toMatch(/^var\(--duration\w+\)$/);
      expect(ms(m.duration), role).toBeLessThanOrEqual(MOTION_MAX_MS);
      expect(m.easing, role).toMatch(/^var\(--curve\w+\)$/);
    }
    expect(MOTION_MAX_MS).toBe(500);
  });
});

describe('NFR-UX-016 AC-478 色の役割（静的検査）', () => {
  // NFR-UX-016 AC-478
  it('NFR-UX-016 AC-478 アプリの背景・コンポーネントの面・ダイアログの面の背景色はニュートラルのトークン', () => {
    const shell = readFileSync('src/components/AppShell.tsx', 'utf8');
    const panel = readFileSync('src/components/Panel.tsx', 'utf8');
    const provider = readFileSync('src/theme/AppThemeProvider.tsx', 'utf8');
    for (const [name, text] of [['AppShell', shell], ['Panel', panel]] as const) {
      const bgs = [...text.matchAll(/backgroundColor:\s*([^,\n}]+)/g)].map((m) => m[1]!.trim());
      expect(bgs.length, name).toBeGreaterThan(0);
      // 面（root・nav・main・body・pane）はニュートラル。ブランドの色はハンドル（掴み場所。FR-183）と選択中の表示だけ
      const brand = bgs.filter((b) => /Brand/.test(b));
      expect(brand.length, `${name}: ブランドの背景 ${brand.join(' ')}`).toBeLessThanOrEqual(name === 'Panel' ? 1 : 0);
      expect(bgs.filter((b) => !/Brand|Neutral|ButtonFace|transparent/.test(b)), name).toEqual([]);
    }
    expect(provider).toMatch(/backgroundColor = theme\.colorNeutralBackground1/);
  });

  // NFR-UX-016 AC-478
  it('NFR-UX-016 AC-478 意味の色（危険・注意・成功・情報）で塗った表示は、アイコンか文字の説明を伴う', () => {
    // 意味の色のトークン（colorStatus*・colorPalette{Red,Yellow,Green,...}Background）を背景に使う makeStyles の指定を探し、
    // そのクラスを使う要素に文字（子の文字列）かアイコンがあることを、同じファイルの中で確かめる（静的な近似）。
    const bad: string[] = [];
    for (const f of walk(SRC).filter((x) => x.endsWith('.tsx'))) {
      const text = stripComments(readFileSync(f, 'utf8'));
      for (const m of text.matchAll(/(\w+):\s*\{[^{}]*backgroundColor:\s*tokens\.(colorStatus(?:Danger|Warning|Success)Background\d|colorPalette(?:Red|Yellow|Green|DarkOrange)Background\d)[^{}]*\}/g)) {
        const cls = m[1]!;
        const uses = [...text.matchAll(new RegExp(`className=\\{[^}]*\\bs\\.${cls}\\b[^}]*\\}[^>]*>([\\s\\S]{0,160})`, 'g'))];
        for (const u of uses) {
          if (!/[^\s<{}]|\{[^}]+\}|Icon|Regular|Filled/.test(u[1]!)) bad.push(`${f}: ${cls}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
