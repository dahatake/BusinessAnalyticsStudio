// ガイドのカードの部品（メイン画面の「はじめての方へ」・ウェルカム・分析画面の「使い方」で共有。FR-266・FR-268・FR-272）。
import { useRef, useState } from 'react';
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import {
  FLOW_ALT, GUIDE_STEPS, GUIDE_TERMS, GUIDE_WHAT, GUIDE_WORKSPACE,
  PACK_COMMANDS, PACK_PROMPT_FILE, PACK_PROMPT_POINTS, PACK_SAMPLE, PACK_URL,
} from './guideContent';

const useStyles = makeStyles({
  block: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalXL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  plain: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  step: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  cmd: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  code: {
    fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, userSelect: 'all', overflowWrap: 'anywhere',
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`, borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    flex: '1 1 20ch', minWidth: 0,
  },
  pre: { whiteSpace: 'pre-wrap', margin: 0 },
  note: { color: tokens.colorNeutralForeground2 },
  svg: { maxWidth: '100%', height: 'auto' },
  h2: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  h3: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
});

/** 描画する要素を少なくするため（説明は常に画面にある）、文字は Fluent の Text ではなく素の要素で書く。見た目は親の block のクラスで決める */
const Text = ({ children, className, ...rest }: { children?: React.ReactNode; className?: string; weight?: string }) => <span className={className} style={rest.weight === 'semibold' ? { fontWeight: tokens.fontWeightSemibold } : undefined}>{children}</span>;

export function GuideH({ children, level = 3 }: { children: string; level?: 2 | 3 | 4 }) {
  const s = useStyles();
  const H = `h${level}` as 'h3';
  return <H className={level === 2 ? s.h2 : s.h3}>{children}</H>;
}

export function WhatSection() {
  const s = useStyles();
  return (
    <div className={s.block}>
      <GuideH>このアプリでできること</GuideH>
      {GUIDE_WHAT.map((t) => <Text key={t}>{t}</Text>)}
    </div>
  );
}

export function TermsSection() {
  const s = useStyles();
  return (
    <div className={s.block}>
      <GuideH>用語の説明</GuideH>
      <ul className={s.list}>
        {GUIDE_TERMS.map((t) => <li key={t.term}><Text weight="semibold">{t.term}</Text>：<Text>{t.text}</Text></li>)}
      </ul>
    </div>
  );
}

export function StepsSection() {
  const s = useStyles();
  return (
    <div className={s.block}>
      <GuideH>4 つの手順</GuideH>
      <ol className={s.plain} aria-label="4 つの手順の説明">
        {GUIDE_STEPS.map((st, i) => (
          <li key={st.name} className={s.step}>
            <Text weight="semibold">{i + 1}. {st.name}</Text>
            <Text>{st.what}</Text>
            <Text>例：{st.example}</Text>
            <Text className={s.note}>次に：{st.next}</Text>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 全体の流れの図（FR-266 AC-676）。番号・文字・形で段を区別し、色だけに頼らない。代替テキストは title と desc で伝える */
export function FlowDiagram() {
  const s = useStyles();
  const ink = tokens.colorNeutralForeground1;
  const fill = tokens.colorNeutralBackground2;
  const W = 150, H = 64, GAP = 30;
  const shape = (i: number, x: number) => {
    const common = { fill, stroke: ink, strokeWidth: 2 };
    if (i === 0) return <rect x={x} y={8} width={W} height={H} {...common} />;
    if (i === 1) return <rect x={x} y={8} width={W} height={H} rx={18} {...common} />;
    if (i === 2) return <polygon points={`${x + 14},8 ${x + W},8 ${x + W - 14},${8 + H} ${x},${8 + H}`} {...common} />;
    return <ellipse cx={x + W / 2} cy={8 + H / 2} rx={W / 2} ry={H / 2} {...common} />;
  };
  const width = 4 * W + 3 * GAP + 4;
  return (
    <svg className={s.svg} viewBox={`0 0 ${width} ${H + 16}`} width={width} role="img" aria-labelledby="guide-flow-title guide-flow-desc" data-testid="guide-flow">
      <title id="guide-flow-title">全体の流れ</title>
      <desc id="guide-flow-desc">{FLOW_ALT}</desc>
      {GUIDE_STEPS.map((st, i) => {
        const x = 2 + i * (W + GAP);
        return (
          <g key={st.name}>
            {shape(i, x)}
            <text x={x + W / 2} y={8 + 26} textAnchor="middle" fontSize="16" fontWeight="700" fill={ink}>{i + 1}</text>
            <text x={x + W / 2} y={8 + 48} textAnchor="middle" fontSize="14" fill={ink}>{st.name}</text>
            {i < 3 ? <path d={`M ${x + W + 4} ${8 + H / 2} L ${x + W + GAP - 4} ${8 + H / 2}`} stroke={ink} strokeWidth={2} markerEnd="url(#guide-arrow)" fill="none" /> : null}
          </g>
        );
      })}
      <defs>
        <marker id="guide-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={ink} /></marker>
      </defs>
    </svg>
  );
}

export function FlowSection() {
  const s = useStyles();
  return (
    <div className={s.block}>
      <GuideH>全体の流れ</GuideH>
      <FlowDiagram />
    </div>
  );
}

/** コピーのボタン（FR-268 AC-683）。結果は role=status で支援技術にも伝える。クリップボードが使えないときは、選択できる状態で原因と次の行動を示す */
export function CopyButton({ text, label, codeRef }: { text: string; label: string; codeRef?: React.RefObject<HTMLElement | null> }) {
  const [state, setState] = useState<'idle' | 'ok' | 'ng'>('idle');
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      setState('ng');
      const el = codeRef?.current;
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
    }
  };
  return (
    <>
      <Button size="small" aria-label={`${label}をコピー`} onClick={() => { void copy(); }}>コピー</Button>
      <span role="status" aria-live="polite">
        {state === 'ok' ? 'コピーしました' : state === 'ng' ? 'コピーできませんでした（この環境では、クリップボードを使えません）。文字列を選んだ状態にしたので、Ctrl+C でコピーしてください。' : ''}
      </span>
    </>
  );
}

export function CommandRow({ label, command }: { label: string; command: string }) {
  const s = useStyles();
  const ref = useRef<HTMLElement>(null);
  return (
    <div className={s.cmd}>
      <Text>{label}</Text>
      <code ref={ref} className={s.code}>{command}</code>
      <CopyButton text={command} label={label} codeRef={ref} />
    </div>
  );
}

/** 顧客パックの説明（FR-268）。メイン画面の「顧客パック」region とウェルカムのカードで共有する */
export function PackSection({ withHeading = true }: { withHeading?: boolean }) {
  const s = useStyles();
  const promptRef = useRef<HTMLElement>(null);
  return (
    <div className={s.block}>
      {withHeading ? <GuideH>顧客パックとは</GuideH> : null}
      <Text>顧客パックは、顧客ごとの課題・解決策・計画・ブランド（色・ロゴ）などをまとめたデータのフォルダーです（public/data/ と public/brand/ ほか）。</Text>
      <Text weight="semibold">顧客パックがなくても、デモ（お手本パック {PACK_SAMPLE}/）で試せます。</Text>
      <GuideH level={4}>作り方は 3 通り</GuideH>
      <ol className={s.list}>
        <li>
          <Text>M365 Copilot で作る。{PACK_PROMPT_FILE} の Prompt を貼ります。</Text>
          <div className={s.cmd}>
            <pre ref={promptRef as React.RefObject<HTMLPreElement>} className={`${s.code} ${s.pre}`}>{PACK_PROMPT_POINTS}</pre>
            <CopyButton text={PACK_PROMPT_POINTS} label="Prompt の要点" codeRef={promptRef} />
          </div>
        </li>
        <li><Text>生成パイプラインで作る。</Text><CommandRow label="パイプライン" command={PACK_COMMANDS.pipeline} /></li>
        <li><Text>お手本 {PACK_SAMPLE} を複製して、手で書き換えます。</Text></li>
      </ol>
      <GuideH level={4}>作ったあとの確認</GuideH>
      <CommandRow label="形式の検査" command={PACK_COMMANDS.check} />
      <CommandRow label="受け入れ判定" command={PACK_COMMANDS.verify} />
      <GuideH level={4}>画面を起動する</GuideH>
      <CommandRow label="ビルド" command={PACK_COMMANDS.build} />
      <CommandRow label="起動" command={PACK_COMMANDS.start} />
      <Text>起動したら、ブラウザーで {PACK_URL} を開きます。</Text>
    </div>
  );
}

/** 分析画面の「使い方」の最初のカード（FR-272） */
export function WorkspaceSection() {
  const s = useStyles();
  return (
    <div className={s.block}>
      <GuideH>画面の見方</GuideH>
      <ul className={s.list}>{GUIDE_WORKSPACE.view.map((t) => <li key={t}>{t}</li>)}</ul>
      <GuideH>よく使う操作</GuideH>
      <ul className={s.list}>{GUIDE_WORKSPACE.ops.map((t) => <li key={t}>{t}</li>)}</ul>
      <GuideH>顧客パック</GuideH>
      <Text>{GUIDE_WORKSPACE.pack}</Text>
    </div>
  );
}