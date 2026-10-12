// 分析手法の選択と開始・パラメーター編集・ビュアー切替（FR-133〜135、NFR-A11Y-005）。
// 結果の項目は 3 つのビュアー（表・マトリクス・グラフ）で同じ値を表示し、選択と絞り込みを共有する。
// 図・グラフ・マトリクスでも、同じ値を表で確認できる（AC-216）。状態は文字でも示す（色だけにしない）。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { analysisResult, useAnalyses, type Analysis } from '../store/analyses';
import { METHODS, VIEWERS, filterItems, getMethod, type ResultItem, type ViewerId } from '../methods/model';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  option: { padding: tokens.spacingHorizontalS, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, cursor: 'pointer' },
  params: { display: 'grid', gridTemplateColumns: 'minmax(8em, 1fr) auto auto', gap: tokens.spacingHorizontalS, alignItems: 'center' },
  item: { padding: tokens.spacingHorizontalS, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, cursor: 'pointer' },
  selected: { borderTopWidth: '3px', borderRightWidth: '3px', borderBottomWidth: '3px', borderLeftWidth: '3px', borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1, fontWeight: tokens.fontWeightSemibold },
  matrix: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14em, 1fr))', gap: tokens.spacingHorizontalS },
  cell: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  bar: { height: '0.75em', backgroundColor: tokens.colorBrandBackground, borderRadius: tokens.borderRadiusSmall },
  table: { borderCollapse: 'collapse', width: '100%' },
});

function ItemBody({ item, selected }: { item: ResultItem; selected: boolean }) {
  return (
    <>
      {selected ? <span aria-hidden="true">✓ </span> : null}
      <span>{item.label}</span>
      <span>（{item.category}）値 {item.score} × 重み {item.weight} = </span>
      <strong>{item.value}</strong>
      {selected ? <span>（選択中）</span> : null}
    </>
  );
}

/** 結果の項目を、選択・キーボード操作つきで表示する。ビュアーはこの表現を並べ方だけ変える。 */
function Viewer({ a, items, onSelect }: { a: Analysis; items: ResultItem[]; onSelect: (id: string) => void }) {
  const s = useStyles();
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
  if (items.length === 0) return <Text role="status">条件に合う項目がありません。絞り込みを変更してください。</Text>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div ref={ref} onKeyDown={onKey}>
      {a.viewer === 'table' ? (
        <table className={s.table} role="grid" aria-label="結果の表">
          <thead><tr role="row"><th>項目</th><th>分類</th><th>値</th><th>重み</th><th>結果（値×重み）</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} role="row" {...common(i)} className={cls(i)}>
                <td>{a.selectedId === i.id ? '✓ ' : ''}{i.label}</td><td>{i.category}</td><td>{i.score}</td><td>{i.weight}</td><td>{i.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {a.viewer === 'matrix' ? (
        <div className={s.matrix} role="listbox" aria-label="結果のマトリクス">
          {m.categories.map((c) => (
            <section key={c} className={s.cell} aria-label={c}>
              <Text weight="semibold">{c}</Text>
              {items.filter((i) => i.category === c).map((i) => (
                <div key={i.id} role="option" {...common(i)} className={cls(i)}><ItemBody item={i} selected={a.selectedId === i.id} /></div>
              ))}
            </section>
          ))}
        </div>
      ) : null}
      {a.viewer === 'chart' ? (
        <div role="listbox" aria-label="結果のグラフ" className={s.list}>
          {items.map((i) => (
            <div key={i.id} role="option" {...common(i)} className={cls(i)}>
              <ItemBody item={i} selected={a.selectedId === i.id} />
              <div className={s.bar} aria-hidden="true" style={{ width: `${(i.value / max) * 100}%` }} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AnalysisView({ projectId, a, onReturn }: { projectId: string; a: Analysis; onReturn?: (from: string) => void }) {
  const s = useStyles();
  const st = useAnalyses();
  const m = getMethod(a.methodId);
  const result = analysisResult(a);
  const visible = filterItems(result.items, a.filter);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // 結果を表示した分析は「結果確認済み」になる（AC-201）
  useEffect(() => { st.confirm(projectId); }, [a.params, a.methodId]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (factorId: string, field: 'score' | 'weight', raw: string) => {
    const r = st.setParam(projectId, factorId, field, raw);
    const key = `${factorId}:${field}`;
    // 無効な入力だけ下書きとして残す（有効な値は保存済みの値を表示する）
    setDrafts((d) => {
      const { [key]: _drop, ...rest } = d;
      return r.ok ? rest : { ...rest, [key]: raw };
    });
    setError(r.ok ? null : r.reason);
  };
  return (
    <div data-testid="analysis" className={s.root} role="region" aria-label={`分析 ${m.name}`}>
      <div className={s.row}>
        <Text weight="semibold">{m.name}</Text>
        <Text>状態: {a.status}</Text>
        {a.from && onReturn ? <Button size="small" onClick={() => onReturn(a.from!)}>元の作業に戻る（{a.from}）</Button> : null}
        <Button size="small" onClick={() => { st.resetParams(projectId); setDrafts({}); setError(null); }}>既定値に戻す</Button>
      </div>
      <Text>{m.summary}</Text>
      <div data-testid="analysis-params" role="group" aria-label="パラメーター">
        <div className={s.params}>
          {m.factors.map((fc) => (
            <div key={fc.id} style={{ display: 'contents' }}>
              <Text>{fc.label}（{fc.category}）</Text>
              {(['score', 'weight'] as const).map((field) => {
                const key = `${fc.id}:${field}`;
                const stored = String(a.params[fc.id]?.[field] ?? '');
                const shown = drafts[key] ?? stored;
                return (
                  <Input key={field} type="number" value={shown} aria-label={`${fc.label} の${field === 'score' ? '値（0〜10）' : '重み（1〜5）'}`}
                    aria-invalid={drafts[key] !== undefined && stored !== drafts[key] ? true : undefined}
                    onChange={(_, d) => edit(fc.id, field, d.value)} />
                );
              })}
            </div>
          ))}
        </div>
        {error ? <MessageBar intent="error" role="alert"><MessageBarBody>{error}（結果は直前の有効な値のままです）</MessageBarBody></MessageBar> : null}
      </div>
      <div className={s.row}>
        <div role="radiogroup" aria-label="ビュアー" className={s.row}>
          {VIEWERS.map((v) => (
            <label key={v.id}>
              <input type="radio" name={`viewer-${projectId}`} checked={a.viewer === v.id} onChange={() => st.setViewer(projectId, v.id as ViewerId)} /> {v.name}
            </label>
          ))}
        </div>
        <Input type="search" aria-label="絞り込み" role="searchbox" placeholder="項目・分類で絞り込み" value={a.filter} onChange={(_, d) => st.setFilter(projectId, d.value)} />
      </div>
      <div data-testid="analysis-result" role="region" aria-label="分析結果">
        <Text block>採用した手法: {m.name}／パラメーター: {result.items.map((i) => `${i.label} ${i.score}×${i.weight}`).join('、')}</Text>
        <Text block>分類ごとの合計: {result.totals.map((t) => `${t.category} ${t.total}`).join('、')}</Text>
        <Viewer a={a} items={visible} onSelect={(id) => st.select(projectId, id)} />
      </div>
      {a.viewer !== 'table' ? (
        <details open>
          <summary>同じ値の表（代替表示）</summary>
          <table className={s.table} aria-label="結果の代替表">
            <thead><tr><th>項目</th><th>分類</th><th>値</th><th>重み</th><th>結果（値×重み）</th></tr></thead>
            <tbody>{visible.map((i) => <tr key={i.id}><td>{i.label}</td><td>{i.category}</td><td>{i.score}</td><td>{i.weight}</td><td>{i.value}</td></tr>)}</tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

/** 分析の開始（手法の一覧）。ビジネスシナリオ・KPI 測定・ユースケース作成の各画面からも `from` つきで使える。 */
export function AnalysisStart({ projectId, from = null }: { projectId: string; from?: string | null }) {
  const s = useStyles();
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
      <Button size="small" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>分析を開始</Button>
      {open ? (
        <ul role="listbox" aria-label="分析手法" className={s.list} onKeyDown={onKey}>
          {METHODS.map((m, i) => (
            <li key={m.id} role="option" aria-selected={false} tabIndex={i === 0 ? 0 : -1} ref={i === 0 ? first : undefined} className={s.option} onClick={() => choose(m.id)}>
              <strong>{m.name}</strong> — {m.summary}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 開いている Project の分析（開始操作と、開始済みの分析） */
export function AnalysisPanel({ projectId, onReturn }: { projectId: string; onReturn?: (from: string) => void }) {
  const s = useStyles();
  const a = useAnalyses((x) => x.byProject[projectId]);
  return (
    <div className={s.root} data-testid="analysis-panel">
      <AnalysisStart projectId={projectId} />
      {a ? <AnalysisView key={`${projectId}:${a.methodId}`} projectId={projectId} a={a} onReturn={onReturn} /> : null}
    </div>
  );
}
