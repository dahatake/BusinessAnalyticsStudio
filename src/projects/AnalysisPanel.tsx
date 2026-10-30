// 分析手法の選択と開始・パラメーター編集・ビュアー切替（FR-133〜135、NFR-A11Y-005）。
// 結果の項目は 3 つのビュアー（表・マトリクス・グラフ）で同じ値を表示し、選択と絞り込みを共有する。
// 図・グラフ・マトリクスでも、同じ値を表で確認できる（AC-216）。状態は文字でも示す（色だけにしない）。
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { registerCommands } from '../commands/registry';
import { useAi } from '../ai/useAi';
import { useProjects } from '../store/projects';
import { ANALYSIS_SCREEN, DEFAULT_LAYOUT, MOVE_STEP, useAnalysisLayout } from '../store/analysisLayout';
import { requestDraft, type DraftOutcome } from './aiDraft';
import { analysisResult, useAnalyses, type Analysis } from '../store/analyses';
import { useStepper } from '../store/stepper';
import { STEPS } from '../stepper/model';
import { METHODS, VIEWERS, filterItems, getMethod, type ResultItem, type ViewerId } from '../methods/model';
import { tr, useT } from '../i18n';
import { useTweenedValue } from '../motion';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  option: { padding: tokens.spacingHorizontalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, cursor: 'pointer' },
  params: { display: 'grid', gridTemplateColumns: 'minmax(8em, 1fr) auto auto', gap: tokens.spacingHorizontalS, alignItems: 'center' },
  item: { padding: tokens.spacingHorizontalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, cursor: 'pointer' },
  selected: { borderTopWidth: tokens.strokeWidthThicker, borderRightWidth: tokens.strokeWidthThicker, borderBottomWidth: tokens.strokeWidthThicker, borderLeftWidth: tokens.strokeWidthThicker, borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1, fontWeight: tokens.fontWeightSemibold },
  matrix: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14em, 1fr))', gap: tokens.spacingHorizontalS },
  cell: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  bar: { height: '0.75em', backgroundColor: tokens.colorBrandBackground, borderRadius: tokens.borderRadiusSmall },
  panel: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, boxSizing: 'border-box' },
  handle: { cursor: 'move', touchAction: 'none', userSelect: 'none', padding: tokens.spacingHorizontalXS, backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall },
  table: { borderCollapse: 'collapse', width: '100%' },
});

/** 遷移中の数値の表示（FR-070 AC-086・FR-134 AC-197）。遷移が終われば、正確な値（最新値）だけを表示する。最新値は代替表・表のビュアーでいつでも読める */
function useShown(target: number): string {
  const v = useTweenedValue(target);
  return v === target ? String(target) : (Math.round(v * 10) / 10).toFixed(1);
}

/** 表のセル用。遷移中は中間値、完了後は最新値。最新値は data-value（セル）で常に読める */
function Shown({ value }: { value: number }) {
  return <>{useShown(value)}</>;
}

function ItemBody({ item, selected }: { item: ResultItem; selected: boolean }) {
  const t = useT();
  const score = useShown(item.score);
  const weight = useShown(item.weight);
  const value = useShown(item.value);
  return (
    <>
      {selected ? <span aria-hidden="true">✓ </span> : null}
      <span>{t(item.label)}</span>
      <span>{t('（{category}）値 {score} × 重み {weight} = ', { category: t(item.category), score, weight })}</span>
      <strong>{value}</strong>
      {selected ? <span>{t('（選択中）')}</span> : null}
    </>
  );
}

function ChartBar({ value, max }: { value: number; max: number }) {
  const s = useStyles();
  const v = useTweenedValue(value);
  return <div className={s.bar} aria-hidden="true" style={{ width: `${(v / max) * 100}%` }} />;
}

/** 結果の項目を、選択・キーボード操作つきで表示する。ビュアーはこの表現を並べ方だけ変える。 */
function Viewer({ a, items, onSelect }: { a: Analysis; items: ResultItem[]; onSelect: (id: string) => void }) {
  const s = useStyles();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const m = getMethod(a.methodId);
  const tabId = items.some((i) => i.id === a.selectedId) ? a.selectedId : items[0]?.id;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-testid="result-item"]') ?? []);
    const idx = els.indexOf(document.activeElement as HTMLElement);
    if (idx < 0) return;
    const go = (n: number) => { e.preventDefault(); els[Math.max(0, Math.min(els.length - 1, n))]?.focus(); };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(idx + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(els.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(els[idx]?.getAttribute('data-entity-id') ?? ''); }
  };
  const common = (i: ResultItem) => ({
    'data-testid': 'result-item', 'data-entity-id': i.id, 'data-value': String(i.value),
    'aria-selected': a.selectedId === i.id, tabIndex: tabId === i.id ? 0 : -1, onClick: () => onSelect(i.id),
  });
  const cls = (i: ResultItem) => `${s.item} ${a.selectedId === i.id ? s.selected : ''}`;
  if (items.length === 0) return <Text role="status">{t('条件に合う項目がありません。絞り込みを変更してください。')}</Text>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div ref={ref} onKeyDown={onKey}>
      {a.viewer === 'table' ? (
        <table className={s.table} role="grid" aria-label={t('結果の表')}>
          <thead><tr role="row"><th>{t('項目')}</th><th>{t('分類')}</th><th>{t('値')}</th><th>{t('重み')}</th><th>{t('結果（値×重み）')}</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} role="row" {...common(i)} className={cls(i)}>
                <td>{a.selectedId === i.id ? '✓ ' : ''}{t(i.label)}</td><td>{t(i.category)}</td><td data-value={i.score}><Shown value={i.score} /></td><td data-value={i.weight}><Shown value={i.weight} /></td><td data-value={i.value}><Shown value={i.value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {a.viewer === 'matrix' ? (
        <div className={s.matrix} role="listbox" aria-label={t('結果のマトリクス')}>
          {m.categories.map((c) => (
            <section key={c} className={s.cell} aria-label={t(c)}>
              <Text weight="semibold">{t(c)}</Text>
              {items.filter((i) => i.category === c).map((i) => (
                <div key={i.id} role="option" {...common(i)} className={cls(i)}><ItemBody item={i} selected={a.selectedId === i.id} /></div>
              ))}
            </section>
          ))}
        </div>
      ) : null}
      {a.viewer === 'chart' ? (
        <div role="listbox" aria-label={t('結果のグラフ')} className={s.list}>
          {items.map((i) => (
            <div key={i.id} role="option" {...common(i)} className={cls(i)}>
              <ItemBody item={i} selected={a.selectedId === i.id} />
              <ChartBar value={i.value} max={max} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const NO_DRAFTS: Record<string, string> = {};

function AnalysisView({ projectId, a, onReturn }: { projectId: string; a: Analysis; onReturn?: (from: string) => void }) {
  const s = useStyles();
  const t = useT();
  const st = useAnalyses();
  const m = getMethod(a.methodId);
  const result = analysisResult(a);
  const visible = filterItems(result.items, a.filter);
  const drafts = useAnalyses((x) => x.drafts[projectId]) ?? NO_DRAFTS;
  const [error, setError] = useState<string | null>(null);
  // 結果を表示した分析は「結果確認済み」になる（AC-201）
  useEffect(() => { st.confirm(projectId); }, [a.params, a.methodId]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (factorId: string, field: 'score' | 'weight', raw: string) => {
    const r = st.setParam(projectId, factorId, field, raw);
    // 無効な入力だけ下書きとして残す（有効な値は保存済みの値を表示する）。下書きは Project の切替でも失わない（FR-138 AC-210）
    st.setDraft(projectId, `${factorId}:${field}`, r.ok ? null : raw);
    setError(r.ok ? null : r.reason);
  };
  // NFR-UX-006: 結果パネルの位置・大きさ（端末内に保存）。ドラッグなしの手段はボタン・矢印キー・コマンドパレット（AC-215）
  const layout = useAnalysisLayout();
  const pl = layout.screens[ANALYSIS_SCREEN] ?? DEFAULT_LAYOUT;
  useEffect(() => registerCommands(() => [
    { id: 'analysis.layout.reset', label: tr('分析画面のレイアウトを既定に戻す'), keywords: [tr('レイアウト'), tr('分析')], run: () => useAnalysisLayout.getState().reset(ANALYSIS_SCREEN) },
    { id: 'analysis.layout.left', label: tr('分析結果パネルを左へ移動'), keywords: [tr('レイアウト'), tr('分析')], run: () => useAnalysisLayout.getState().moveBy(ANALYSIS_SCREEN, -MOVE_STEP, 0) },
    { id: 'analysis.layout.right', label: tr('分析結果パネルを右へ移動'), keywords: [tr('レイアウト'), tr('分析')], run: () => useAnalysisLayout.getState().moveBy(ANALYSIS_SCREEN, MOVE_STEP, 0) },
    { id: 'analysis.layout.up', label: tr('分析結果パネルを上へ移動'), keywords: [tr('レイアウト'), tr('分析')], run: () => useAnalysisLayout.getState().moveBy(ANALYSIS_SCREEN, 0, -MOVE_STEP) },
    { id: 'analysis.layout.down', label: tr('分析結果パネルを下へ移動'), keywords: [tr('レイアウト'), tr('分析')], run: () => useAnalysisLayout.getState().moveBy(ANALYSIS_SCREEN, 0, MOVE_STEP) },
    { id: 'analysis.layout.wider', label: tr('分析結果パネルを広げる'), keywords: [tr('レイアウト'), tr('分析'), tr('大きさ')], run: () => useAnalysisLayout.getState().resizeBy(ANALYSIS_SCREEN, MOVE_STEP) },
    { id: 'analysis.layout.narrower', label: tr('分析結果パネルを狭める'), keywords: [tr('レイアウト'), tr('分析'), tr('大きさ')], run: () => useAnalysisLayout.getState().resizeBy(ANALYSIS_SCREEN, -MOVE_STEP) },
  ]), []);
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const base = useAnalysisLayout.getState().get(ANALYSIS_SCREEN);
    const move = (ev: PointerEvent) => useAnalysisLayout.getState().set(ANALYSIS_SCREEN, { ...base, dx: base.dx + ev.clientX - sx, dy: base.dy + ev.clientY - sy });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const L = useAnalysisLayout.getState();
    const d: [number, number] | null = e.key === 'ArrowLeft' ? [-1, 0] : e.key === 'ArrowRight' ? [1, 0] : e.key === 'ArrowUp' ? [0, -1] : e.key === 'ArrowDown' ? [0, 1] : null;
    if (e.key === 'Escape') { e.preventDefault(); L.reset(ANALYSIS_SCREEN); return; }
    if (!d) return;
    e.preventDefault();
    if (e.shiftKey) L.resizeBy(ANALYSIS_SCREEN, d[0] * MOVE_STEP);
    else L.moveBy(ANALYSIS_SCREEN, d[0] * MOVE_STEP, d[1] * MOVE_STEP);
  };
  // FR-140: 企業ごとの許可を尊重した AI 下書き
  const project = useProjects((x) => x.projects.find((p) => p.id === projectId));
  const company = useProjects((x) => x.companies.find((c) => c.id === project?.companyId));
  const { ask } = useAi();
  const [outcome, setOutcome] = useState<DraftOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const askDraft = async () => {
    setBusy(true);
    try { setOutcome(await requestDraft(company?.aiAllowed, a, (prompt) => ask('recommend', prompt))); } finally { setBusy(false); }
  };
  return (
    <div data-testid="analysis" className={s.root} role="region" aria-label={t('分析 {name}', { name: m.name })}>
      <div className={s.row}>
        <Text weight="semibold">{m.name}</Text>
        <Text>{t('状態: {status}', { status: t(a.status) })}</Text>
        {a.from && onReturn ? <Button size="small" onClick={() => onReturn(a.from!)}>{t('元の作業に戻る（{from}）', { from: t(a.from) })}</Button> : null}
        <Button size="small" onClick={() => { st.resetParams(projectId); st.clearDrafts(projectId); setError(null); }}>{t('既定値に戻す')}</Button>
        {/* 結果の位置は本文のスクロールに従う。この操作のフォーカス・スクロール要求で本文を送らない（scroll-margin。位置が変わらないようにする） */}
        <Button size="small" style={{ scrollMarginTop: '100vh', scrollMarginBottom: '100vh' }} onClick={() => layout.reset(ANALYSIS_SCREEN)}>{t('レイアウトを既定に戻す')}</Button>
      </div>
      <Text>{m.summary}</Text>
      <div className={s.row}>
        <div role="radiogroup" aria-label={t('ビュアー')} className={s.row}>
          {VIEWERS.map((v) => (
            <label key={v.id}>
              <input type="radio" name={`viewer-${projectId}`} checked={a.viewer === v.id} onChange={() => st.setViewer(projectId, v.id as ViewerId)} /> {t(v.name)}
            </label>
          ))}
        </div>
        <Input type="search" aria-label={t('絞り込み')} role="searchbox" placeholder={t('項目・分類で絞り込み')} value={a.filter} onChange={(_, d) => st.setFilter(projectId, d.value)} />
      </div>
      <div data-testid="analysis-result" role="region" aria-label={t('分析結果')} className={s.panel}
        style={{ transform: `translate(${pl.dx}px, ${pl.dy}px)`, width: pl.dw === 0 ? undefined : `calc(100% + ${pl.dw}px)` }}>
        <div data-testid="panel-handle" className={s.handle} tabIndex={0} role="group"
          aria-label={t('結果パネルの見出し（ドラッグ、または矢印キーで移動、Shift＋左右矢印で大きさ、Esc で既定に戻す）')}
          onPointerDown={onHandleDown} onKeyDown={onHandleKey}>
          <Text weight="semibold">{t('分析結果')}</Text>
        </div>
        <Text block>{t('採用した手法: {name}／パラメーター: {params}', { name: m.name, params: result.items.map((i) => `${t(i.label)} ${i.score}×${i.weight}`).join(t('、')) })}</Text>
        <Text block>{t('分類ごとの合計: {totals}', { totals: result.totals.map((tot) => `${t(tot.category)} ${tot.total}`).join(t('、')) })}</Text>
        <Viewer a={a} items={visible} onSelect={(id) => st.select(projectId, id)} />
      </div>
      <div data-testid="analysis-params" role="group" aria-label={t('パラメーター')}>
        <div className={s.params}>
          {m.factors.map((fc) => (
            <div key={fc.id} style={{ display: 'contents' }}>
              <Text>{t(fc.label)}（{t(fc.category)}）</Text>
              {(['score', 'weight'] as const).map((field) => {
                const key = `${fc.id}:${field}`;
                const stored = String(a.params[fc.id]?.[field] ?? '');
                const shown = drafts[key] ?? stored;
                return (
                  <Input key={field} type="number" value={shown} aria-label={field === 'score' ? t('{label} の値（0〜10）', { label: t(fc.label) }) : t('{label} の重み（1〜5）', { label: t(fc.label) })}
                    aria-invalid={drafts[key] !== undefined && stored !== drafts[key] ? true : undefined}
                    onChange={(_, d) => edit(fc.id, field, d.value)} />
                );
              })}
            </div>
          ))}
        </div>
        {error ? <MessageBar intent="error" role="alert"><MessageBarBody>{t('{error}（結果は直前の有効な値のままです）', { error: t(error) })}</MessageBarBody></MessageBar> : null}
      </div>
      <div role="group" aria-label={t('結果パネルの移動と大きさ')} className={s.row}>
        <Button size="small" onClick={() => layout.moveBy(ANALYSIS_SCREEN, -MOVE_STEP, 0)}>{t('結果を左へ移動')}</Button>
        <Button size="small" onClick={() => layout.moveBy(ANALYSIS_SCREEN, MOVE_STEP, 0)}>{t('結果を右へ移動')}</Button>
        <Button size="small" onClick={() => layout.moveBy(ANALYSIS_SCREEN, 0, -MOVE_STEP)}>{t('結果を上へ移動')}</Button>
        <Button size="small" onClick={() => layout.moveBy(ANALYSIS_SCREEN, 0, MOVE_STEP)}>{t('結果を下へ移動')}</Button>
        <Button size="small" onClick={() => layout.resizeBy(ANALYSIS_SCREEN, MOVE_STEP)}>{t('結果を広げる')}</Button>
        <Button size="small" onClick={() => layout.resizeBy(ANALYSIS_SCREEN, -MOVE_STEP)}>{t('結果を狭める')}</Button>
      </div>
      <div data-testid="ai-draft" role="group" aria-label={t('AI 下書き')} className={s.row}>
        <Button size="small" disabled={busy} onClick={() => void askDraft()}>{t('AI 下書きを依頼')}</Button>
        {outcome?.status === 'not-allowed' ? <MessageBar intent="warning" role="status"><MessageBarBody>{t(outcome.message)}</MessageBarBody></MessageBar> : null}
        {outcome?.status === 'error' ? <MessageBar intent="error" role="alert"><MessageBarBody>{t(outcome.message)}</MessageBarBody></MessageBar> : null}
        {outcome?.status === 'draft' ? (
          <div role="group" aria-label={t('AI の下書き')}>
            <Text block>{outcome.mock ? t('AI 生成（モック）の下書き（採用するまで分析には反映されません）:') : t('AI 生成の下書き（採用するまで分析には反映されません）:')}</Text>
            <Text block data-testid="ai-draft-text">{outcome.text}</Text>
            <Button size="small" appearance="primary" onClick={() => { st.setAiNote(projectId, outcome.text); setOutcome(null); }}>{t('採用')}</Button>
            <Button size="small" onClick={() => setOutcome(null)}>{t('却下')}</Button>
          </div>
        ) : null}
        {a.aiNote ? <Text block data-testid="ai-note">{t('採用した AI 下書き: {note}', { note: a.aiNote })}</Text> : null}
      </div>
      {a.viewer !== 'table' ? (
        <details open>
          <summary>{t('同じ値の表（代替表示）')}</summary>
          <table className={s.table} aria-label={t('結果の代替表')}>
            <thead><tr><th>{t('項目')}</th><th>{t('分類')}</th><th>{t('値')}</th><th>{t('重み')}</th><th>{t('結果（値×重み）')}</th></tr></thead>
            <tbody>{visible.map((i) => <tr key={i.id}><td>{t(i.label)}</td><td>{t(i.category)}</td><td data-value={i.score}><Shown value={i.score} /></td><td data-value={i.weight}><Shown value={i.weight} /></td><td data-value={i.value}><Shown value={i.value} /></td></tr>)}</tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

/** 分析の開始（手法の一覧）。ビジネスシナリオ・KPI 測定・ユースケース作成の各画面からも `from` つきで使える。 */
export function AnalysisStart({ projectId, from = null }: { projectId: string; from?: string | null }) {
  const s = useStyles();
  const t = useT();
  const start = useAnalyses((x) => x.start);
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLLIElement>(null);
  useEffect(() => { if (open) first.current?.focus(); }, [open]);
  const choose = (id: (typeof METHODS)[number]['id']) => { start(projectId, id, from); setOpen(false); };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
    const idx = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[Math.min(els.length - 1, idx + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[Math.max(0, idx - 1)]?.focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && idx >= 0) { e.preventDefault(); els[idx]?.click(); }
  };
  return (
    <div>
      <Button size="small" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{t('分析を開始')}</Button>
      {open ? (
        <ul role="listbox" aria-label={t('分析手法')} className={s.list} onKeyDown={onKey}>
          {METHODS.map((m, i) => (
            <li key={m.id} role="option" aria-selected={false} tabIndex={i === 0 ? 0 : -1} ref={i === 0 ? first : undefined} className={s.option} onClick={() => choose(m.id)}>
              <strong>{t(m.name)}</strong> — {t(m.summary)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** ビジネスシナリオ（課題定義）・KPI 測定・ユースケース作成の作業（FR-133 AC-196）。この作業の途中で開始した分析は、元の作業へ戻れる。 */
const WORK_STEP_KEYS = ['issue', 'kpi', 'usecase'];

/** 開いている Project の分析（開始操作と、開始済みの分析） */
export function AnalysisPanel({ projectId, onNavigate }: { projectId: string; onNavigate?: (screenKey: string) => void }) {
  const s = useStyles();
  const a = useAnalyses((x) => x.byProject[projectId]);
  const current = useStepper((x) => x.current);
  const setCurrent = useStepper((x) => x.setCurrent);
  const step = STEPS[current];
  const from = step && WORK_STEP_KEYS.includes(step.key) ? step.label : null;
  const onReturn = (label: string) => {
    const i = STEPS.findIndex((x) => x.label === label);
    const target = STEPS[i];
    if (!target) return;
    setCurrent(i);
    onNavigate?.(target.screen);
  };
  return (
    <div className={s.root} data-testid="analysis-panel">
      <AnalysisStart projectId={projectId} from={from} />
      {a ? <AnalysisView key={`${projectId}:${a.methodId}`} projectId={projectId} a={a} onReturn={onReturn} /> : null}
    </div>
  );
}
