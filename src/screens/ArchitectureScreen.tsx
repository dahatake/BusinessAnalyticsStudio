// アーキテクチャ図（2D/3D。FR-040）。ビジネスアーキテクチャ（Capability Map・バリューストリーム）と、アプリ/システムの層（2D のブロック図、3D のレイヤー積層図）。
// AsIs/ToBe を切り替えると差分（追加・削除・変更）を色とラベルでハイライトする。図は Mermaid・SVG・PNG で出力でき、JSON で編集できる。
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { lifeOpacity, usePresenceItems } from '../motion';
import {
  Badge, Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Text, Textarea, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { ArrowDownload24Regular, Code24Regular } from '@fluentui/react-icons';
import {
  DIFF_LABEL, archToJson, archVariants, modelFor, parseArchitectureJson, sectionsOf, toMermaid, toSvg, validateArchitectureChange,
  type ArchSection, type ArchView, type DiffElement, type DiffKind,
} from '../analysis/architecture';
import { downloadBlob, downloadText, exportFileName, svgToPng } from '../analysis/exportFile';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { RelatedMini } from '../components/RelatedMini';
import { EmptyView, LoadingView } from '../components/StateViews';
import { onEntityKey, useEntityBinding, useSelection } from '../selection/hooks';
import { useEditStore } from '../store/edit';
import { usePackStore } from '../store/pack';
import { ArchitectureStack } from '../three/ArchitectureStack';

import { useComponentView, usePublishViewItems } from '../view/useView';
import { ModeRadio } from '../view/ModeRadio';
const ORIGIN = 'architecture';

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'end', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  section: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalM },
  stream: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS },
  card: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM, minHeight: '56px',
    border: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    overflowWrap: 'anywhere',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
  },
  chevron: { clipPath: 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%, 12% 50%)', paddingInline: tokens.spacingHorizontalXXL, minWidth: '140px', alignItems: 'center', textAlign: 'center' },
  added: { backgroundColor: tokens.colorPaletteGreenBackground1, borderTopColor: tokens.colorPaletteGreenBorder2, borderRightColor: tokens.colorPaletteGreenBorder2, borderBottomColor: tokens.colorPaletteGreenBorder2, borderLeftColor: tokens.colorPaletteGreenBorder2 },
  removed: { backgroundColor: tokens.colorPaletteRedBackground1, borderTopColor: tokens.colorPaletteRedBorder2, borderRightColor: tokens.colorPaletteRedBorder2, borderBottomColor: tokens.colorPaletteRedBorder2, borderLeftColor: tokens.colorPaletteRedBorder2, borderTopStyle: 'dashed', borderRightStyle: 'dashed', borderBottomStyle: 'dashed', borderLeftStyle: 'dashed' },
  changed: { backgroundColor: tokens.colorPaletteYellowBackground1, borderTopColor: tokens.colorPaletteYellowBorder2, borderRightColor: tokens.colorPaletteYellowBorder2, borderBottomColor: tokens.colorPaletteYellowBorder2, borderLeftColor: tokens.colorPaletteYellowBorder2 },
  links: { margin: 0, paddingInlineStart: tokens.spacingHorizontalXL },
  json: { fontFamily: tokens.fontFamilyMonospace, minHeight: '320px' },
});


function DiffBadge({ diff }: { diff: DiffKind }) {
  if (diff === 'same') return null;
  const color = diff === 'added' ? 'success' : diff === 'removed' ? 'danger' : 'warning';
  const mark = diff === 'added' ? '＋' : diff === 'removed' ? '－' : '≠';
  return <Badge appearance="filled" color={color} size="medium">{mark} {DIFF_LABEL[diff]}</Badge>;
}

function ElementCard({ item, chevron, life = 1 }: { item: DiffElement; chevron?: boolean; life?: number }) {
  const s = useStyles();
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const props = bind(item.element.id);
  return (
    <div
      {...props} role="button" tabIndex={0}
      data-diff={item.diff === 'same' ? undefined : item.diff}
      style={life < 1 ? { opacity: lifeOpacity(life) } : undefined}
      className={mergeClasses(s.card, chevron && s.chevron, item.diff === 'added' && s.added, item.diff === 'removed' && s.removed, item.diff === 'changed' && s.changed, hl(props['data-highlight']))}
      onKeyDown={(e) => { onEntityKey(e, item.element.id, ORIGIN); }}
    >
      <Text weight="semibold">{item.element.name}</Text>
      <DiffBadge diff={item.diff} />
    </div>
  );
}

/** 区画 1 つ。要素は ID を保ったまま出入りする（FR-070 AC-086）。削除は薄れて消えるまで元の区画に残る（消える途中のカードは ID・操作を持たない）。 */
function SectionBlock({ sec }: { sec: ArchSection }) {
  const s = useStyles();
  const presence = usePresenceItems(sec.items, (e) => e.element.id, () => []);
  return (
    <section className={s.section} aria-label={sec.title}>
      <Text as="h3" size={400} weight="semibold">{sec.title}</Text>
      <div className={sec.kind === 'stream' ? s.stream : s.grid}>
        {presence.map(({ item, life, exiting }) => exiting
          ? (
            <div key={item.element.id} aria-hidden style={{ opacity: lifeOpacity(life), pointerEvents: 'none' }}
              className={mergeClasses(s.card, sec.kind === 'stream' && s.chevron)}>
              <Text weight="semibold">{item.element.name}</Text>
            </div>
          )
          : <ElementCard key={item.element.id} item={item} chevron={sec.kind === 'stream'} life={life} />)}
      </div>
    </section>
  );
}

function Diagram2D({ sections }: { sections: ArchSection[] }) {
  return <>{sections.map((sec) => <SectionBlock key={sec.title} sec={sec} />)}</>;
}

function ArchitectureScreen() {
  const t = useT();
  const s = useStyles();
  const { select } = useSelection();
  const state = usePackStore((st) => st.state);
  const editEnabled = useEditStore((st) => st.editMode);
  const [view, setView] = useState<ArchView>('tobe');
  // 2D/3D は見出しの「ビュー」と同じ状態（FR-217。この画面の「表示」の切替も同じ状態を変える）
  const cv = useComponentView(ORIGIN);
  const dim = cv.mode;
  const [scope, setScope] = useState<'all' | 'business' | 'app'>('all');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const arch = state.status === 'ready' ? state.pack.data.architecture : undefined;
  const variants = useMemo(() => (arch ? archVariants(arch) : undefined), [arch]);
  const model = useMemo(() => (variants ? modelFor(view, variants) : undefined), [variants, view]);
  const sections = useMemo(() => {
    if (!model) return [];
    const all = sectionsOf(model);
    return scope === 'all' ? all : all.filter((x) => (scope === 'business') === (x.kind !== 'layer'));
  }, [model, scope]);
  // 表示中の項目（t.view.state。2D と 3D で同じ要素を描く）
  const shownIds = useMemo(() => sections.flatMap((x) => x.items.map((e) => e.element.id)), [sections]);
  usePublishViewItems(ORIGIN, shownIds);
  const names = useMemo(() => new Map((model?.elements ?? []).map((e) => [e.element.id, e.element.name])), [model]);

  useEffect(() => { if (jsonOpen && variants) { setJsonText(archToJson(variants)); setJsonError(null); } }, [jsonOpen, variants]);
  // ダイアログの操作部は、モーダルの背景の隠し（aria-hidden）が済んでから出す（背景の「保存」などと同時に操作対象にならないように）。
  // 隠しが効かない環境でも固定の待ちで止まらないよう、最大 1 秒で出す。
  const [dlgReady, setDlgReady] = useState(false);
  useEffect(() => {
    if (!jsonOpen) { setDlgReady(false); return; }
    let id = 0;
    const t0 = performance.now();
    const tick = () => {
      const hidden = document.querySelector('[data-testid="workspace"]')?.closest('[aria-hidden="true"]') != null;
      if (hidden || performance.now() - t0 > 1000) setDlgReady(true);
      else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [jsonOpen]);

  if (state.status !== 'ready' || !model || !variants) return <LoadingView label={t('アーキテクチャ図を読み込み中')} />;
  const { customer } = state.pack.data;

  const title = t('{name} {project} アーキテクチャ（{view}）', { name: customer.name, project: customer.projectName, view: view === 'asis' ? 'AsIs' : 'ToBe' });
  const base = (ext: string) => exportFileName(customer.name, customer.projectName, `architecture-${view}`, ext);
  const doExport = async (fmt: 'Mermaid' | 'SVG' | 'PNG') => {
    setExportError(null);
    try {
      if (fmt === 'Mermaid') downloadText(base('mmd'), toMermaid(model, title), 'text/vnd.mermaid;charset=utf-8');
      else {
        const r = toSvg(model, title);
        if (fmt === 'SVG') downloadText(base('svg'), r.svg, 'image/svg+xml;charset=utf-8');
        else downloadBlob(base('png'), await svgToPng(r.svg, r.width, r.height));
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  };
  const applyJson = () => {
    const r = parseArchitectureJson(jsonText);
    if (!r.ok) { setJsonError(r.reason); return; }
    // パック全体の検証（ID の一意・参照先・スキーマ）を通してから適用する。既存の ID（課題など）と衝突する要素は適用しない
    const problems = validateArchitectureChange(state.pack.data, r.value);
    if (problems.length > 0) {
      setJsonError(`${t('パック全体の検証に通りません（適用しませんでした）:')}\n${problems.slice(0, 5).join('\n')}${problems.length > 5 ? `\n${t('ほか {n} 件', { n: problems.length - 5 })}` : ''}`);
      return;
    }
    const next = {
      ...state.pack.data,
      architecture: { ...state.pack.data.architecture, asis: { elements: r.value.asis.elements as never, links: r.value.asis.links as never }, tobe: { elements: r.value.tobe.elements as never, links: r.value.tobe.links as never } },
    };
    const c = useEditStore.getState().commit({
      ok: true,
      data: next,
      changes: [{ op: 'update', entityLabel: t('アーキテクチャ図'), fieldLabel: t('JSON（asis・tobe）'), before: t('AsIs {a} 要素・ToBe {b} 要素', { a: variants.asis.elements.length, b: variants.tobe.elements.length }), after: t('AsIs {a} 要素・ToBe {b} 要素', { a: r.value.asis.elements.length, b: r.value.tobe.elements.length }) }],
    });
    if (!c.ok) { setJsonError(c.message); return; }
    setJsonOpen(false);
  };

  return (
    <Panel
      testId="component-architecture"
      title={t('アーキテクチャ図')}
      description={t('ビジネスアーキテクチャ（Capability Map・バリューストリーム）と、アプリ/システムの層を見ます。AsIs と ToBe を切り替えると、差分を色とラベルで示します。')}
      maxWidth="1200px"
    >
      <ExecutiveSummary scope="architecture" />

      <div className={s.toolbar} role="toolbar" aria-label={t('アーキテクチャ図の操作')}>
        <Field label={t('版')}>
          <RadioGroup layout="horizontal" value={view} onChange={(_, d) => setView(d.value as ArchView)}>
            <Radio value="asis" label="AsIs" />
            <Radio value="tobe" label="ToBe" />
          </RadioGroup>
        </Field>
        {/* 見出しの「ビュー」と同じ 1 つの切替（FR-217 AC-500・AC-507） */}
        <ModeRadio viewKey={ORIGIN} />
        <Field label={t('範囲')}>
          <RadioGroup layout="horizontal" value={scope} onChange={(_, d) => setScope(d.value as typeof scope)}>
            <Radio value="all" label={t('すべて')} />
            <Radio value="business" label={t('ビジネス')} />
            <Radio value="app" label={t('アプリ/システム')} />
          </RadioGroup>
        </Field>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button icon={<ArrowDownload24Regular aria-hidden />}>{t('図を出力')}</Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem onClick={() => void doExport('Mermaid')}>Mermaid</MenuItem>
              <MenuItem onClick={() => void doExport('SVG')}>SVG</MenuItem>
              <MenuItem onClick={() => void doExport('PNG')}>PNG</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
        <Button icon={<Code24Regular aria-hidden />} disabled={!editEnabled} onClick={() => setJsonOpen(true)}>{t('JSON 編集')}</Button>
        {!editEnabled ? <Text size={200}>{t('編集モードを ON にすると、JSON で要素を編集できます。')}</Text> : null}
      </div>
      {exportError ? <Text role="alert" style={{ color: tokens.colorPaletteRedForeground1 }}>{exportError}</Text> : null}

      <div role="group" aria-label={t('差分の凡例')} style={{ display: 'flex', columnGap: tokens.spacingHorizontalM, flexWrap: 'wrap' }}>
        <Text size={200}>{view === 'tobe' ? t('AsIs との差分:') : t('AsIs（現状）の図です。ToBe に切り替えると差分を示します。')}</Text>
        {view === 'tobe' ? (['added', 'removed', 'changed'] as const).map((k) => <DiffBadge key={k} diff={k} />) : null}
      </div>

      {sections.length === 0 ? (
        <EmptyView message={t('表示する要素がありません。')} />
      ) : dim === '2d' ? (
        <Diagram2D sections={sections} />
      ) : (
        <ArchitectureStack sections={sections} model={model} onSelect={(id) => select(id, { origin: ORIGIN })} />
      )}

      <section aria-label={t('接続')}>
        <Text as="h3" size={400} weight="semibold" block>{t('接続')}</Text>
        {model.links.length === 0 ? <Text size={200}>{t('接続はありません。')}</Text> : (
          <ul className={s.links}>
            {model.links.map((l, i) => (
              <li key={i}>
                <Text size={200}>{names.get(l.from) ?? l.from} → {names.get(l.to) ?? l.to}{l.label ? `（${l.label}）` : ''}{l.diff !== 'same' ? `［${t(DIFF_LABEL[l.diff])}］` : ''}</Text>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RelatedMini origin={ORIGIN} />

      <Dialog open={jsonOpen} onOpenChange={(_, d) => { if (!d.open) setJsonOpen(false); }}>
        <DialogSurface style={{ maxWidth: '720px' }}>
          <DialogBody>
            <DialogTitle>{t('アーキテクチャの JSON 編集')}</DialogTitle>
            <DialogContent style={{ display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS }}>
              <Text size={200}>{t('asis・tobe の elements（id・name・kind・layer など）と links（from・to・label）を編集できます。同じ ID を両方に置くと同じ要素の変更になります。')}</Text>
              {dlgReady ? <Textarea className={s.json} resize="vertical" aria-label={t('アーキテクチャの JSON')} value={jsonText} onChange={(_, d) => setJsonText(d.value)} rows={16} /> : null}
              {jsonError ? <Text role="alert" style={{ color: tokens.colorPaletteRedForeground1, whiteSpace: 'pre-wrap' }}>{jsonError}</Text> : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setJsonOpen(false)}>{t('キャンセル')}</Button>
              {dlgReady ? <Button appearance="primary" onClick={applyJson}>{t('適用')}</Button> : null}
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Panel>
  );
}

export { ArchitectureScreen };
