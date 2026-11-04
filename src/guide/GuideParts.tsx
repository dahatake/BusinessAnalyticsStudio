// ガイドのカードの部品（メイン画面の「はじめての方へ」・ウェルカム・分析画面の「使い方」で共有。FR-266・FR-268・FR-272）。
import { useRef, useState } from 'react';
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import {
  FLOW_ALT, GUIDE_STEPS, GUIDE_TERMS, GUIDE_WHAT, GUIDE_WORKSPACE,
  PACK_COMMANDS, PACK_KIT_FILE, PACK_PROMPT_FILE, PACK_PROMPT_FILE_GHCP, PACK_PROMPT_GHCP, PACK_PROMPT_M365, PACK_SAMPLE, PACK_URL,
} from './guideContent';
import { useT } from '../i18n';

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
  promptBox: { maxHeight: '16em', overflowY: 'auto' },
  note: { color: tokens.colorNeutralForeground2 },
  svg: { maxWidth: '100%', height: 'auto' },
  h2: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  h3: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
});

/** 描画する要素を少なくするため（説明は常に画面にある）、文字は Fluent の Text ではなく素の要素で書く。見た目は親の block のクラスで決める */
const Text = ({ children, className, ...rest }: { children?: React.ReactNode; className?: string; weight?: string }) => <span className={className} style={rest.weight === 'semibold' ? { fontWeight: tokens.fontWeightSemibold } : undefined}>{children}</span>;

export function GuideH({ children, level = 3 }: { children: string; level?: 2 | 3 | 4 }) {
  const s = useStyles();
  const t = useT();
  const H = `h${level}` as 'h3';
  return <H className={level === 2 ? s.h2 : s.h3}>{t(children)}</H>;
}

export function WhatSection() {
  const s = useStyles();
  const t = useT();
  return (
    <div className={s.block}>
      <GuideH>このアプリでできること</GuideH>
      {GUIDE_WHAT.map((w) => <Text key={w}>{t(w)}</Text>)}
    </div>
  );
}

export function TermsSection() {
  const s = useStyles();
  const t = useT();
  return (
    <div className={s.block}>
      <GuideH>用語の説明</GuideH>
      <ul className={s.list}>
        {GUIDE_TERMS.map((m) => <li key={m.term}><Text weight="semibold">{t(m.term)}</Text>{t('：')}<Text>{t(m.text)}</Text></li>)}
      </ul>
    </div>
  );
}

export function StepsSection() {
  const s = useStyles();
  const t = useT();
  return (
    <div className={s.block}>
      <GuideH>4 つの手順</GuideH>
      <ol className={s.plain} aria-label={t('4 つの手順の説明')}>
        {GUIDE_STEPS.map((st, i) => (
          <li key={st.name} className={s.step}>
            <Text weight="semibold">{i + 1}. {t(st.name)}</Text>
            <Text>{t(st.what)}</Text>
            <Text>{t('例：')}{t(st.example)}</Text>
            <Text className={s.note}>{t('次に：')}{t(st.next)}</Text>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 全体の流れの図（FR-266 AC-676）。番号・文字・形で段を区別し、色だけに頼らない。代替テキストは title と desc で伝える */
export function FlowDiagram() {
  const s = useStyles();
  const t = useT();
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
      <title id="guide-flow-title">{t('全体の流れ')}</title>
      <desc id="guide-flow-desc">{t(FLOW_ALT)}</desc>
      {GUIDE_STEPS.map((st, i) => {
        const x = 2 + i * (W + GAP);
        return (
          <g key={st.name}>
            {shape(i, x)}
            <text x={x + W / 2} y={8 + 26} textAnchor="middle" fontSize="16" fontWeight="700" fill={ink}>{i + 1}</text>
            <text x={x + W / 2} y={8 + 48} textAnchor="middle" fontSize="14" fill={ink}>{t(st.name)}</text>
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
  const t = useT();
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
      <Button size="small" aria-label={t('{label}をコピー', { label: t(label) })} onClick={() => { void copy(); }}>{t('コピー')}</Button>
      <span role="status" aria-live="polite">
        {state === 'ok' ? t('コピーしました') : state === 'ng' ? t('コピーできませんでした（この環境では、クリップボードを使えません）。文字列を選択した状態にしたので、Ctrl+C でコピーしてください。') : ''}
      </span>
    </>
  );
}

export function CommandRow({ label, command }: { label: string; command: string }) {
  const s = useStyles();
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  return (
    <div className={s.cmd}>
      <Text>{t(label)}</Text>
      {/* 長いコマンドは、狭いパネルで読みやすいよう引数ごとに行を分ける（コピーされる文字列は command のまま） */}
      <code ref={ref} className={s.code}>{command.split(/ (?=--(?:customer|project) )/).map((part, i) => <span key={i} style={{ display: 'block' }}>{i > 0 ? ' ' : ''}{part}</span>)}</code>
      <CopyButton text={command} label={label} codeRef={ref} />
    </div>
  );
}

/** kit の全文（FR-268 AC-834）。閉じている間は読み込まず（バンドルを肥大させない）、開いたときに動的に読み込む */
function KitViewer() {
  const s = useStyles();
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const [kit, setKit] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [opened, setOpened] = useState(false);
  const load = (open: boolean) => {
    setOpened(open);
    if (!open || kit !== null) return;
    import('../../tools/envisioning/_attach/customer-pack-kit.md?raw').then((m) => setKit(m.default), () => setFailed(true));
  };
  return (
    <details onToggle={(e) => load((e.currentTarget as HTMLDetailsElement).open)}>
      <summary aria-expanded={opened}>{t('kit（顧客パックの形式の決まりとお手本）を見る')}</summary>
      {failed ? <Text>{t('kit を読み込めませんでした。画面を再読み込みするか、担当者に npm run pack:kit の実行を依頼してください。')}</Text> : null}
      {kit !== null ? (
        <div className={s.cmd}>
          <pre ref={ref as React.RefObject<HTMLPreElement>} className={`${s.code} ${s.pre} ${s.promptBox}`} tabIndex={0}>{kit}</pre>
          <CopyButton text={kit} label="kit" codeRef={ref} />
        </div>
      ) : failed ? null : <Text>{t('読み込み中です…')}</Text>}
    </details>
  );
}

/** 顧客パックの説明（FR-268）。メイン画面の「顧客パック」region とウェルカムのカードで共有する */
export function PackSection({ withHeading = true, entry }: { withHeading?: boolean; entry?: React.ReactNode }) {
  const s = useStyles();
  const t = useT();
  const promptRef = useRef<HTMLElement>(null);
  const promptRef2 = useRef<HTMLElement>(null);
  return (
    <div className={s.block}>
      {withHeading ? <GuideH>顧客パックとは</GuideH> : null}
      <Text>{t('顧客パックは、顧客ごとの課題・解決策・計画・ブランド（色・ロゴ）などをまとめたフォルダーです。')}{t('置き場所は、public/data/ と public/brand/ ほかです。')}</Text>
      <Text weight="semibold">{t('顧客パックがなくても、デモ（お手本パック {sample}/）で試せます。', { sample: PACK_SAMPLE })}</Text>
      <GuideH level={4}>作り方（画面だけで進められます）</GuideH>
      <GuideH level={4}>① Prompt と kit をコピーする</GuideH>
      <Text>{t('顧客パックの書式の定義は、下の「kit」にまとまっています。ファイルを開く必要はなく、画面からコピーして Copilot に貼り付けるだけで使えます。書式が古いと kit は作られません。その場合は担当者に更新を依頼してください。')}</Text>
      <KitViewer />
      <GuideH level={4}>② Copilot に貼ってファイルを作る</GuideH>
      <ol className={s.list}>
        <li>
          <Text weight="semibold">{t('方法 A: M365 Copilot で作る。')}</Text>
          <Text>{t('M365 Copilot を開く → 上の「kit」をコピーして貼り付ける → 続けて、下の Prompt をコピーして貼り、【】の部分を書き換える。kit がないときは、Prompt の指示で作らず kit を求められます。出力のコードブロックは、見出しのファイル名（customer.json など 9 個と brand-profile.json）で保存します。')}</Text>
          <div className={s.cmd}>
            <pre ref={promptRef as React.RefObject<HTMLPreElement>} className={`${s.code} ${s.pre} ${s.promptBox}`} tabIndex={0}>{PACK_PROMPT_M365}</pre>
            <CopyButton text={PACK_PROMPT_M365} label="M365 Copilot 用 Prompt" codeRef={promptRef} />
          </div>
        </li>
        <li>
          <Text weight="semibold">{t('方法 B: GitHub Copilot ＋ WorkIQ で作る。')}</Text>
          <Text>{t('WorkIQ が使える状態で、kit を貼り付けたあと、下の Prompt を、先頭の変数を書き換えて貼ります。ファイルの作成と自己点検まで、エージェントが行います。')}</Text>
          <div className={s.cmd}>
            <pre ref={promptRef2 as React.RefObject<HTMLPreElement>} className={`${s.code} ${s.pre} ${s.promptBox}`} tabIndex={0}>{PACK_PROMPT_GHCP}</pre>
            <CopyButton text={PACK_PROMPT_GHCP} label="GitHub Copilot 用 Prompt" codeRef={promptRef2} />
          </div>
        </li>
      </ol>
      <GuideH level={4}>③ 画面からアップロードして取り込む</GuideH>
      <Text>{t('作ったファイルを、「顧客パックを取り込む」の画面で、複数選択するか、ドラッグ＆ドロップで入れます。ファイルはこの端末の中だけで読み、外へは送りません。')}</Text>
      {entry}
      <GuideH level={4}>④ 検証の結果を読み、直す</GuideH>
      <Text>{t('アップロードすると、検証の結果が出ます。エラーが出たら、表示された「ファイル名・項目名」を確かめます。その部分だけを Copilot に貼って作り直させ、もう一度アップロードします。')}</Text>
      <GuideH level={4}>⑤ 取り込む前に、人が確かめる</GuideH>
      <Text>{t('取り込む前に、出典の機密区分とロゴの状態を確かめます。種別「人」の個人名・連絡先や、出典のない数値がないことも確かめてから、進めます。')}</Text>
      <GuideH level={4}>担当者向け</GuideH>
      <Text className={s.note}>{t('担当者向け（kit の場所: {kit}）: 更新は npm run gen:schema → npm run pack:kit の順に実行します。', { kit: PACK_KIT_FILE })}</Text>
      <Text className={s.note}>{t('Prompt の元は {file} と {file2} です。お手本パックは {sample}/ です。', { file: PACK_PROMPT_FILE, file2: PACK_PROMPT_FILE_GHCP, sample: PACK_SAMPLE })}</Text>
      <Text>{t('準備（最初の 1 回）。リポジトリを取得し、必要なものを入れて、schema とお手本を 1 ファイルにまとめた kit を作ります。')}</Text>
      <CommandRow label="リポジトリの取得" command={PACK_COMMANDS.clone} />
      <CommandRow label="インストール" command={PACK_COMMANDS.install} />
      <CommandRow label="kit の作成" command={PACK_COMMANDS.kit} />
      <Text weight="semibold">{t('方法 C: 生成パイプラインで作る。')}</Text>
      <CommandRow label="パイプライン" command={PACK_COMMANDS.pipeline} />
      <Text>{t('作業フォルダーに作ったときは、検証します。')}</Text>
      <CommandRow label="形式の検査" command={PACK_COMMANDS.check} />
      <CommandRow label="受け入れ判定" command={PACK_COMMANDS.verify} />
      <Text>{t('画面への反映（リポジトリに直接置く場合）。検証が通った顧客パックの public/data/ と public/brand/ の中身を、このリポジトリの public/data/ と public/brand/ に置きます。顧客の情報なので、コミットしません。')}</Text>
      <CommandRow label="ビルド" command={PACK_COMMANDS.build} />
      <CommandRow label="起動" command={PACK_COMMANDS.start} />
      <Text>{t('起動したら、ブラウザーで {url} を開きます。', { url: PACK_URL })}</Text>
      <Text>{t('エラーが出たときは、検査に出た「ファイル名・項目名」の JSON だけを直し、もう一度 npm run check:pack を実行します。')}</Text>
    </div>
  );
}

/** 分析画面の「使い方」の最初のカード（FR-272） */
export function WorkspaceSection() {
  const s = useStyles();
  const t = useT();
  return (
    <div className={s.block}>
      <GuideH>画面の見方</GuideH>
      <ul className={s.list}>{GUIDE_WORKSPACE.view.map((v) => <li key={v}>{t(v)}</li>)}</ul>
      <GuideH>よく使う操作</GuideH>
      <ul className={s.list}>{GUIDE_WORKSPACE.ops.map((v) => <li key={v}>{t(v)}</li>)}</ul>
      <GuideH>顧客パック</GuideH>
      <Text>{t(GUIDE_WORKSPACE.pack)}</Text>
    </div>
  );
}