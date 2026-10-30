// 議論ツリー（系統ツリー。FR-042）。ルート=議題、枝=論点・課題・原因・解決策・決定事項・次のアクション。
// ノードの展開/折りたたみ、階層ごとの色・記号、ズーム/パン、共通の選択との連動、手動の編集（追加・移動・削除・分解のやり直し）、
// AI 生成と人が編集したノードの区別、根拠のリンク、PNG・SVG・Mermaid・JSON の出力を備える。
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { tr, useT } from '../i18n';
import {
  Badge, Button, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Spinner, Text, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import {
  Add24Regular, ArrowDownload24Regular, ArrowMove24Regular, ArrowRedo24Regular, ArrowUndo24Regular, ChevronDown16Regular, ChevronRight16Regular,
  Delete24Regular, Edit24Regular, SplitVertical24Regular, ZoomIn24Regular, ZoomOut24Regular,
} from '@fluentui/react-icons';
import { downloadBlob, downloadText, exportFileName, svgToPng } from '../analysis/exportFile';
import {
  KIND_MARK, buildPackTree, flattenTree, moveTargets, treeToJson, treeToMermaid, treeToSvg, type Rationale, type TreeDoc, type TreeKind, type TreeNode,
} from '../analysis/tree';
import { MOCK_LABEL, REAL_LABEL } from '../ai/client';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { useHighlightClass } from '../components/highlight';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { packKeyOf } from '../discussion/model';
import { onEntityKey, useEntityBinding, useSelection } from '../selection/hooks';
import { useDiscussionStore } from '../store/discussion';
import { useEditStore } from '../store/edit';
import { useLayout } from '../store/layout';
import { usePackStore } from '../store/pack';
import { useTreeDoc, useTreeStore } from '../store/tree';
import { useSelectionStore } from '../store/selection';
import { ViewAsTableButton, ViewTable } from '../components/ViewTable';
import { Items3DSurface } from '../three/Items3DSurface';
import { treeLayout3D } from '../view/items3d';
import { useComponentView, usePublishViewItems } from '../view/useView';

const ORIGIN = 'discussion-tree';

/** 階層（種別）ごとの色。デザイントークンのパレットで指定する */
const KIND_TOKEN: Record<TreeKind, string> = {
  議題: tokens.colorBrandStroke1,
  論点: tokens.colorPalettePurpleBorderActive,
  課題: tokens.colorPaletteRedBorderActive,
  原因: tokens.colorPaletteDarkOrangeBorderActive,
  解決策: tokens.colorPaletteGreenBorderActive,
  決定事項: tokens.colorPaletteTealBorderActive,
  次のアクション: tokens.colorPaletteYellowBorderActive,
};

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS },
  viewport: { overflow: 'auto', flexShrink: 0, minHeight: '240px', border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, cursor: 'grab', touchAction: 'pan-x pan-y' },
  tree: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalM, transformOrigin: 'top left', boxSizing: 'border-box', width: '100%' },
  row: {
    display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, minHeight: '32px',
    borderRadius: tokens.borderRadiusMedium, borderLeft: `${tokens.strokeWidthThickest} solid transparent`,
    backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  picked: { outline: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
  chevron: { display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { overflowWrap: 'anywhere' },
  status: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
});

function RationaleLink({ r }: { r: Rationale }) {
  const t = useT();
  const { select } = useSelection();
  const target = usePackStore((st) => st.state);
  const open = (e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault();
    if (r.kind === 'source') select(r.refId, { origin: ORIGIN });
    else if (target.status === 'ready') {
      const key = packKeyOf(target.pack.data.customer.name, target.pack.data.customer.projectName);
      useDiscussionStore.getState().select(key, r.refId);
      useLayout.getState().showComponent('themes');
    }
  };
  return <a href="#rationale" onClick={open} style={{ color: tokens.colorBrandForegroundLink }}>{t('根拠:')} {t(r.label)}</a>;
}

function DiscussionTreeScreen() {
  const t = useT();
  const s = useStyles();
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const state = usePackStore((st) => st.state);
  const editEnabled = useEditStore((st) => st.editMode);
  const data = state.status === 'ready' ? state.pack.data : undefined;
  const key = data ? packKeyOf(data.customer.name, data.customer.projectName) : '';
  const doc = useTreeDoc(key, data);
  const job = useTreeStore((st) => (st.job?.key === key ? st.job : null));
  const error = useTreeStore((st) => st.error);
  const canUndo = useTreeStore((st) => (st.past[key]?.length ?? 0) > 0);
  const canRedo = useTreeStore((st) => (st.future[key]?.length ?? 0) > 0);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<string | undefined>();
  const [adding, setAdding] = useState<{ parentId: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const treeRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const baseline = useMemo(() => (data ? buildPackTree(data) : []), [data]);
  // 生成前は、パックの章・議題から作った全体像（読み取り専用）を見せる
  const shownRaw: TreeDoc | undefined = doc ?? (data && baseline.length > 0 ? { themeId: 'pack', themeTitle: data.customer.projectName, nodes: baseline, mode: 'mock' } : undefined);
  // 課題・解決策のノードは、人が木の上で名前を変えていない限り、いまの課題・解決策の名称を出す（詳細で名前を変えると木にも反映される。FR-070 AC-086）
  const shown: TreeDoc | undefined = useMemo(() => {
    if (!shownRaw || !data) return shownRaw;
    const live = new Map<string, string>([...data.issues.issues.map((i) => [i.id, i.title] as const), ...data.issues.solutions.map((x) => [x.id, x.title] as const)]);
    return { ...shownRaw, nodes: shownRaw.nodes.map((n) => { const lt = n.entityId !== undefined && n.origin !== 'human' ? live.get(n.entityId) : undefined; return lt !== undefined && lt !== n.title ? { ...n, title: lt } : n; }) };
  }, [shownRaw, data]);
  const rows = useMemo(() => (shown ? flattenTree(shown.nodes, collapsed) : []), [shown, collapsed]);
  const node = shown?.nodes.find((n) => n.id === picked);
  // 3D（FR-217 AC-501）: 表示中のノード（2D の木の行と同じ ID・件数）を、深さ=高さ・枝分かれ=横の位置に置き、親→子をつなぐ
  const { mode: viewMode } = useComponentView(ORIGIN);
  const [asTable, setAsTable] = useState(false);
  const shownNodes = useMemo(() => rows.map((r) => r.node), [rows]);
  // 3D の項目 ID は、課題・解決策のノードでは 2D の行・表と同じ実体の ID（重複するときは最初の 1 つだけ。残りはノード ID）
  const itemIdOf = useMemo(() => {
    const m = new Map<string, string>();
    const used = new Set<string>();
    for (const n of shownNodes) {
      const id = n.entityId !== undefined && !used.has(n.entityId) ? n.entityId : n.id;
      used.add(id);
      m.set(n.id, id);
    }
    return m;
  }, [shownNodes]);
  const layout3d = useMemo(() => treeLayout3D(shownNodes, (n) => itemIdOf.get(n.id) ?? n.id, (n) => n.title, (n) => (n.parentId === null ? null : itemIdOf.get(n.parentId) ?? n.parentId), (n) => n.kind), [shownNodes, itemIdOf]);
  usePublishViewItems(ORIGIN, useMemo(() => shownNodes.map((n) => itemIdOf.get(n.id) ?? n.id), [shownNodes, itemIdOf]));
  const selectedNow = useSelectionStore((st) => st.selectedIds);

  useEffect(() => { if (picked && shown && !shown.nodes.some((n) => n.id === picked)) setPicked(undefined); }, [shown, picked]);

  if (!data) return <LoadingView label={t('議論ツリーを読み込み中')} />;

  const store = useTreeStore.getState();
  const report = (r: { ok: boolean; reason?: string }): void => setMessage(r.ok ? null : (r.reason ?? null));

  const pick = (n: TreeNode, additive = false) => {
    setPicked(n.id);
    // 共通の選択ストア。他のビューの関連項目がハイライトされる
    if (n.entityId) useSelectionStore.getState().select(n.entityId, { origin: ORIGIN, additive });
  };

  const commitAdd = () => {
    if (!adding) return;
    const r = store.add(key, adding.parentId, draft);
    report(r);
    if (r.ok) { setAdding(null); setDraft(''); if (r.id) setPicked(r.id); }
  };
  const commitRename = () => {
    if (!node) return;
    const r = store.rename(key, node.id, draft);
    report(r);
    if (r.ok) { setRenaming(false); setDraft(''); }
  };
  const del = () => { if (node) report(store.remove(key, node.id)); };

  const exportAs = async (fmt: 'PNG' | 'SVG' | 'Mermaid' | 'JSON') => {
    if (!shown) return;
    const doc = shown;
    const name = (ext: string) => exportFileName(data.customer.name, data.customer.projectName, 'discussion-tree', ext);
    try {
      if (fmt === 'Mermaid') downloadText(name('mmd'), treeToMermaid(doc), 'text/vnd.mermaid;charset=utf-8');
      else if (fmt === 'JSON') downloadText(name('json'), treeToJson(doc), 'application/json;charset=utf-8');
      else {
        const r = treeToSvg(doc);
        if (fmt === 'SVG') downloadText(name('svg'), r.svg, 'image/svg+xml;charset=utf-8');
        else downloadBlob(name('png'), await svgToPng(r.svg, r.width, r.height));
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, n: TreeNode, hasChildren: boolean) => {
    const items = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
    const at = items.indexOf(e.currentTarget);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(n, e.ctrlKey || e.metaKey || e.shiftKey); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[at + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[at - 1]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && hasChildren) { e.preventDefault(); setCollapsed((c) => { const x = new Set(c); x.delete(n.id); return x; }); }
    else if (e.key === 'ArrowLeft' && hasChildren) { e.preventDefault(); setCollapsed((c) => new Set(c).add(n.id)); }
    else if (e.key === 'Delete' && editEnabled && n.parentId !== null) { e.preventDefault(); report(store.remove(key, n.id)); }
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && e.target !== treeRef.current) return;
    const v = viewportRef.current;
    if (!v) return;
    drag.current = { x: e.clientX, y: e.clientY, left: v.scrollLeft, top: v.scrollTop };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const v = viewportRef.current;
    if (!d || !v) return;
    v.scrollLeft = d.left - (e.clientX - d.x);
    v.scrollTop = d.top - (e.clientY - d.y);
  };

  const targets = node && doc ? moveTargets(doc.nodes, node.id) : [];
  const modeLabel = doc?.mode === 'connected' ? REAL_LABEL : MOCK_LABEL;
  const canEdit = editEnabled && doc !== undefined && node !== undefined;

  return (
    <Panel
      testId="component-discussion-tree"
      title={t('議論ツリー')}
      description={t('議論の全体像を、議題を根にした系統ツリーで見ます。ノードを選ぶと他のビューの関連項目がハイライトされます。')}
      maxWidth="1200px"
    >
      <ExecutiveSummary scope="discussion-tree" />

      {job ? (
        <div className={s.status} role="status" aria-live="polite" aria-busy="true">
          <Spinner size="tiny" aria-hidden />
          <Text>{t('議題「{title}」のツリーを生成中…', { title: job.themeTitle })}</Text>
          <Button size="small" onClick={() => useTreeStore.getState().cancel()}>{t('取り消し')}</Button>
        </div>
      ) : null}
      {error ? <Text role="alert" style={{ color: tokens.colorPaletteRedForeground1 }}>{t('ツリーを生成できませんでした:')} {error}</Text> : null}

      {shown ? (
        <>
          <div className={s.toolbar} role="toolbar" aria-label={t('議論ツリーの操作')}>
            <Button icon={<Add24Regular aria-hidden />} disabled={!canEdit} onClick={() => { setAdding({ parentId: (node as TreeNode).id }); setRenaming(false); setDraft(''); }}>{t('ノードを追加')}</Button>
            <Button icon={<Edit24Regular aria-hidden />} disabled={!canEdit} onClick={() => { setRenaming(true); setAdding(null); setDraft(node?.title ?? ''); }}>{t('名前を変更')}</Button>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button icon={<ArrowMove24Regular aria-hidden />} disabled={!canEdit || targets.length === 0}>{t('移動')}</Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {targets.map((t) => (
                    <MenuItem key={t.id} onClick={() => node && report(store.move(key, node.id, t.id))}>{tr('{kind}: {title} の下へ', { kind: tr(t.kind), title: t.title })}</MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
            <Button icon={<Delete24Regular aria-hidden />} disabled={!canEdit || node?.parentId === null} onClick={del}>{t('削除')}</Button>
            <Button icon={<SplitVertical24Regular aria-hidden />} disabled={!canEdit} onClick={() => node && report(store.redecompose(key, node.id))}>{t('分解をやり直す')}</Button>
            <Button icon={<ArrowUndo24Regular aria-hidden />} disabled={!canUndo} onClick={() => store.undo(key)}>{t('元に戻す')}</Button>
            <Button icon={<ArrowRedo24Regular aria-hidden />} disabled={!canRedo} onClick={() => store.redo(key)}>{t('やり直し')}</Button>
            <Button icon={<ZoomOut24Regular aria-hidden />} aria-label={t('縮小')} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} />
            <Text aria-live="polite">{Math.round(zoom * 100)}%</Text>
            <Button icon={<ZoomIn24Regular aria-hidden />} aria-label={t('拡大')} onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} />
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button icon={<ArrowDownload24Regular aria-hidden />}>{t('ツリーを出力')}</Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {(['PNG', 'SVG', 'Mermaid', 'JSON'] as const).map((f) => <MenuItem key={f} onClick={() => void exportAs(f)}>{f}</MenuItem>)}
                </MenuList>
              </MenuPopover>
            </Menu>
            {!editEnabled ? <Text size={200}>{t('編集モードを ON にすると、ノードを追加・移動・削除できます。')}</Text> : !doc ? <Text size={200}>{t('議論テーマから「ツリーを生成」すると、編集できます。')}</Text> : null}
          </div>

          {adding || renaming ? (
            <div className={s.toolbar}>
              <Input
                autoFocus aria-label={renaming ? t('ノードの新しい名前') : t('追加するノードの名前')} value={draft} onChange={(_, d) => setDraft(d.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); if (renaming) commitRename(); else commitAdd(); }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAdding(null); setRenaming(false); }
                }}
              />
              <Text size={200}>{t('Enter で確定、Esc で取り消し')}</Text>
            </div>
          ) : null}
          {message ? <Text role="alert" style={{ color: tokens.colorPaletteRedForeground1 }}>{message}</Text> : null}

          <div className={s.status}>
            <Text weight="semibold">{t('議題:')} {shown.themeTitle}</Text>
            <Badge appearance="tint" color="informative">{doc ? t(modeLabel) : t('パックの章・議題から作成（未生成）')}</Badge>
            <Text size={200}>{t('ノード {n} 件', { n: shown.nodes.length })}</Text>
          </div>

          {viewMode === '3d' ? (
            <>
              <div><ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} /></div>
              {asTable ? (
                <ViewTable
                  label={t('議論ツリーのノード')}
                  origin={ORIGIN}
                  columns={[t('階層'), t('種別'), t('名称'), t('親')]}
                  rows={rows.map((r) => ({ id: r.node.entityId ?? r.node.id, cells: [r.level + 1, t(r.node.kind), r.node.title, shown.nodes.find((x) => x.id === r.node.parentId)?.title ?? t('（根）')] }))}
                />
              ) : (
                <Items3DSurface
                  viewKey={ORIGIN} origin={ORIGIN} label={t('議論ツリー')} items={layout3d.items} links={layout3d.links} axes={{ y: t('階層（上が根）') }}
                  selected={new Set(shownNodes.filter((n) => picked === n.id || (n.entityId !== undefined && selectedNow.includes(n.entityId))).map((n) => itemIdOf.get(n.id) ?? n.id))}
                  onSelect={(id, additive) => { const n = shownNodes.find((x) => (itemIdOf.get(x.id) ?? x.id) === id); if (n) pick(n, additive); }}
                />
              )}
            </>
          ) : (
          <div
            ref={viewportRef} className={s.viewport}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }}
            onWheel={(e) => { if (e.ctrlKey) setZoom((z) => Math.min(2, Math.max(0.5, Math.round((z - Math.sign(e.deltaY) * 0.1) * 10) / 10))); }}
          >
            <div ref={treeRef} role="tree" aria-label={t('議論ツリー')} className={s.tree} style={{ transform: `scale(${zoom})` }}>
              {rows.map((r, i) => {
                const n = r.node;
                const props = n.entityId ? bind(n.entityId) : { 'data-entity-id': undefined, 'data-highlight': undefined };
                const words = (props['data-highlight'] ?? '').split(' ');
                const { onClick: _unused, onMouseEnter, onMouseLeave, ...rest } = props as ReturnType<typeof bind>;
                return (
                  <div
                    key={n.id} {...rest}
                    role="treeitem" aria-level={r.level + 1} aria-posinset={i + 1} aria-setsize={rows.length}
                    aria-expanded={r.hasChildren ? r.expanded : undefined} aria-selected={picked === n.id || words.includes('selected')}
                    data-node-kind={n.kind} data-origin={n.origin}
                    tabIndex={i === 0 ? 0 : -1}
                    className={mergeClasses(s.row, picked === n.id && s.picked, hl(props['data-highlight']))}
                    style={{ marginInlineStart: `calc(${r.level} * ${tokens.spacingHorizontalXXL})`, borderLeftColor: KIND_TOKEN[n.kind] }}
                    onClick={(e) => { pick(n, e.ctrlKey || e.metaKey || e.shiftKey); }}
                    onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
                    onKeyDown={(e) => { if (n.entityId && onEntityKey(e, n.entityId, ORIGIN)) { setPicked(n.id); return; } onRowKey(e, n, r.hasChildren); }}
                  >
                    <span
                      className={s.chevron} aria-hidden
                      onClick={r.hasChildren ? (e) => { e.stopPropagation(); setCollapsed((c) => { const x = new Set(c); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; }); } : undefined}
                    >
                      {r.hasChildren ? (r.expanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />) : null}
                    </span>
                    <Badge appearance="outline" style={{ borderColor: KIND_TOKEN[n.kind] }}>{KIND_MARK[n.kind]} {t(n.kind)}</Badge>
                    <Text weight={n.parentId === null ? 'semibold' : 'regular'} className={s.title}>{n.title}</Text>
                    <Badge appearance={n.origin === 'human' ? 'filled' : 'tint'} color={n.origin === 'human' ? 'brand' : 'informative'} size="medium">
                      {n.origin === 'ai' ? t('AI 生成') : n.origin === 'human' ? t('人が編集') : t('パックの議題')}
                    </Badge>
                    {n.rationale ? <RationaleLink r={n.rationale} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </>
      ) : job ? null : (
        <EmptyView message={t('議論ツリーはまだありません。議論テーマの画面で、記録から「ツリーを生成」してください。')} />
      )}
    </Panel>
  );
}

export { DiscussionTreeScreen };
