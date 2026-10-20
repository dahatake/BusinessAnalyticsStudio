// 「データカタログ」コンポーネント（FR-159 一覧・詳細、FR-160 エンティティ×ユースケースの対応表と明示の紐づけ、NFR-UX-011）。
// データエンティティと「導出」の対応は、顧客パックと登録済みのユースケースから開くたびに導出し、保存しない。保存するのは「明示」の紐づけだけ。
// 選択中のエンティティは store に持ち、レイアウトの変更でコンポーネントが作り直されても失われない。端末内だけで動き、AI には接続しない。
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, MessageBar, MessageBarBody, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { EmptyView } from '../components/StateViews';
import {
  KIND_LABELS, ORIGIN_LABELS, buildMatrix, deriveEntities, deriveLinks, normalizeKey, relatedUseCases, toRecords, type PackEntity,
} from '../datacatalog/model';
import {
  CATEGORIES, NO_BAS_ONLY_REASON, NO_CATALOG_REASON, buildTodos, countByCategory, reconcile,
} from '../datacatalog/reconcile';
import { DataViewer } from '../components/DataViewer';
import { usePublishViewItems } from '../view/useView';
import { toViewerEntities } from '../datacatalog/viewer';
import { deriveViewerRelations } from '../datacatalog/relations';
import { usePackStore } from '../store/pack';
import { useDataCatalog, useExplicitLinks, useImportedCatalog } from '../store/datacatalog';
import { useSelectionStore } from '../store/selection';
import { useProjects } from '../store/projects';
import { useUseCaseSet } from '../store/usecases';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL },
  section: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, minWidth: 0 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  item: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS, padding: tokens.spacingHorizontalM, cursor: 'pointer',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  selected: { border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  detail: { display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalXS, margin: 0 },
  dt: { fontWeight: tokens.fontWeightSemibold, margin: 0 },
  dd: { margin: 0, minWidth: 0, overflowWrap: 'anywhere' },
  plain: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  scroll: { overflowX: 'auto', maxWidth: '100%' },
  table: { borderCollapse: 'collapse', minWidth: '100%' },
  cell: { border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, padding: tokens.spacingHorizontalS, textAlign: 'left', verticalAlign: 'top' },
  forced: { forcedColorAdjust: 'auto' },
});

function DataCatalogScreen() {
  const s = useStyles();
  const projectId = useProjects((x) => x.openId);
  const packState = usePackStore((x) => x.state);
  const useCases = useUseCaseSet(projectId).items; // 登録済みだけ。導出の候補（未登録）は元にしない（FR-159 AC-312）
  const links = useExplicitLinks(projectId);
  const selectedKey = useDataCatalog((x) => x.selectedKey);
  const select = useDataCatalog((x) => x.select);
  const add = useDataCatalog((x) => x.add);
  const remove = useDataCatalog((x) => x.remove);
  const [errors, setErrors] = useState<string[]>([]);
  const imported = useImportedCatalog(projectId);
  const importCatalog = useDataCatalog((x) => x.importCatalog);
  const setSourceUrl = useDataCatalog((x) => x.setSourceUrl);
  const addTodos = useDataCatalog((x) => x.addTodos);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importedMsg, setImportedMsg] = useState('');
  const [todoResult, setTodoResult] = useState('');
  const [importing, setImporting] = useState(false);
  const [wantTodos, setWantTodos] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState('');
  const savedUrl = imported?.sourceUrl ?? '';
  useEffect(() => { setUrlDraft(savedUrl); }, [savedUrl, projectId]);
  useEffect(() => { setImportErrors([]); setImportedMsg(''); setTodoResult(''); setUrlError(''); }, [projectId]);

  // 顧客パックがない = 読み込めていない、またはお手本パックへの代替（isExample。FR-104）。お手本の代替は Project の顧客パックではない
  const data = packState.status === 'ready' && !packState.pack.isExample ? packState.pack.data : undefined;
  const model = useMemo(() => {
    const packEntities = ((data?.entities.entities ?? []) as unknown as (PackEntity & Record<string, unknown>)[]).map((e) => ({
      id: e.id, name: e.name, type: typeof e.type === 'string' ? e.type : undefined,
      description: typeof e.description === 'string' ? e.description : typeof e.summary === 'string' ? e.summary : undefined,
    }));
    const records = toRecords(data ? { issues: data.issues.issues, solutions: data.issues.solutions, flows: data.entities.flows } : undefined);
    const derivation = deriveEntities(packEntities, records, !!data);
    const derived = deriveLinks(derivation.entities, packEntities, records, useCases);
    return { derivation, derived };
  }, [data, useCases]);

  const entities = model.derivation.entities;
  // FR-170: 共通の選択状態（FR-024）との連動。データカタログの選択（鍵）と、全ビュー共通の選択（顧客パックのエンティティ ID）を相互に反映する
  const globalIds = useSelectionStore((x) => x.selectedIds);
  const globalKey = useMemo(() => {
    const last = globalIds[globalIds.length - 1];
    return last ? entities.find((e) => e.id === last)?.key ?? null : null;
  }, [globalIds, entities]);
  useEffect(() => { if (globalKey && globalKey !== useDataCatalog.getState().selectedKey) useDataCatalog.getState().select(globalKey); }, [globalKey]);
  const selectShared = (key: string | null): void => {
    select(key);
    const id = key ? entities.find((e) => e.key === key)?.id : undefined;
    if (id) useSelectionStore.getState().select(id, { origin: 'データカタログ' });
    else if (!key) useSelectionStore.getState().clear({ origin: 'データカタログ' });
  };
  const matrix = useMemo(() => buildMatrix(entities, useCases, model.derived, links), [entities, useCases, model.derived, links]);
  const selected = entities.find((e) => e.key === selectedKey);

  const rows = useMemo(() => (imported && imported.items.length > 0 ? reconcile(entities, imported.items) : []), [entities, imported]);
  const viewerEntities = useMemo(
    () => toViewerEntities(
      entities, imported?.items ?? [], (e) => relatedUseCases(e, useCases, model.derived, links).map((r) => ({ name: r.name, kind: r.kind })), normalizeKey,
      (e) => rows.find((r) => r.entity?.key === e.key)?.category ?? '',
    ),
    [entities, imported, useCases, model.derived, links, rows],
  );
  // 表示中の項目（t.view.state。データビュアーの 2D と 3D で同じエンティティを描く。FR-217）
  const viewerKeys = useMemo(() => viewerEntities.map((e) => e.key), [viewerEntities]);
  // 項目 ID は名称キー（CONTRACT §21）。選択も名称キーで知らせる（共通の選択の ID は顧客パックの ID なので、画面の選択の鍵から出す）
  const viewerSelected = useMemo(() => (selectedKey ? [selectedKey] : []), [selectedKey]);
  usePublishViewItems('data-catalog', viewerKeys, undefined, viewerSelected);
  const counts = countByCategory(rows);
  // FR-170: ①エンティティ間の関係は顧客パックのフロー（from・to）。端点（顧客パックのエンティティ ID）を鍵に直す
  const viewerRelations = useMemo(() => {
    const idToKey = new Map(((data?.entities.entities ?? []) as unknown as PackEntity[]).map((e) => [e.id, normalizeKey(e.name)]));
    const entityLinks = (data?.entities.flows ?? []).flatMap((f) => {
      const a = idToKey.get(f.from); const b = idToKey.get(f.to);
      return a && b ? [{ from: a, to: b, label: f.label }] : [];
    });
    return deriveViewerRelations({ entities: viewerEntities, entityLinks, catalogItems: imported?.items ?? [], normalize: normalizeKey });
  }, [data, viewerEntities, imported]);
  const hasCatalog = !!imported && imported.fileName !== '';
  // 追加できない理由は、操作の前から表示する（FR-162 AC-308）
  const todoPrecondition = !hasCatalog ? NO_CATALOG_REASON : counts['BASのみ'] === 0 ? NO_BAS_ONLY_REASON : '';

  // 取り込みはブラウザーの中だけで読む（File.text）。ネットワークには送らない（NFR-SEC-004）。拒否したときは既存の内容を変えない
  const onFile = async (file: File | undefined): Promise<void> => {
    if (!projectId || !file) return;
    setImporting(true);
    try {
      let text = '';
      try { text = file.size > 5 * 1024 * 1024 ? '' : await file.text(); } catch { setImportErrors(['ファイルを読み込めませんでした。ファイルを確認して、選び直してください。']); setImportedMsg(''); return; }
      const r = importCatalog(projectId, text, file.name, file.size);
      if (r.ok) { setImportErrors([]); setImportedMsg(`${file.name} から ${r.count} 件の項目を取り込みました。`); setTodoResult(''); } else { setImportErrors(r.errors); setImportedMsg(''); }
    } finally {
      setImporting(false);
    }
  };
  const onSaveUrl = (): void => {
    if (!projectId) return;
    const r = setSourceUrl(projectId, urlDraft);
    setUrlError(r.ok ? '' : r.error);
  };
  const onAddTodos = (): void => {
    if (!projectId) return;
    // 取り込みの読み込み中に押されたときは、取り込みが終わってから追加する（取り込み前の状態で「カタログなし」と判断して、結果を失わない）
    if (importing) { setWantTodos(true); return; }
    if (!hasCatalog) { setTodoResult(NO_CATALOG_REASON); return; }
    if (counts['BASのみ'] === 0) { setTodoResult(NO_BAS_ONLY_REASON); return; }
    const todos = buildTodos(rows, (e) => relatedUseCases(e, useCases, model.derived, links).map((u) => u.name));
    const n = addTodos(projectId, todos);
    setTodoResult(n > 0 ? `${n} 件の ToDo を plan の tasks に追加しました。` : '追加済みのため、新しく追加した ToDo は 0 件です。');
  };
  // 取り込み中に押された「未掲載を ToDo に追加」を、取り込みの完了後に 1 回だけ実行する
  useEffect(() => {
    if (wantTodos && !importing) { setWantTodos(false); onAddTodos(); }
  });

  const onAdd = (entityName: string, useCaseId: string) => {
    if (!projectId) return;
    const r = add(projectId, entities, useCases, entityName, useCaseId);
    setErrors(r.ok ? [] : r.errors);
  };
  const onRemove = (entityName: string, useCaseId: string) => {
    if (!projectId) return;
    remove(projectId, entityName, useCaseId);
    setErrors([]);
  };

  return (
    <Panel testId="component-data-catalog" title="データカタログ" description="Project で扱うデータエンティティを、課題・解決策・フローと登録済みのユースケースから導出して一覧します。">
      {!projectId ? (
        <EmptyView message="Project を開くと、データカタログを確認できます。" />
      ) : (
        <div className={s.root}>
          {errors.length > 0 ? (
            <MessageBar intent="error" layout="multiline" role="alert">
              <MessageBarBody><ul className={s.plain}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></MessageBarBody>
            </MessageBar>
          ) : null}

          <section className={s.section} aria-label="データエンティティの一覧">
            <Text as="h3" weight="semibold">データエンティティの一覧</Text>
            {model.derivation.emptyReason ? <Text data-testid="entity-list-empty-reason" role="status">{model.derivation.emptyReason}</Text> : null}
            <ul className={s.list} data-testid="entity-list" aria-label="データエンティティ">
              {entities.map((e) => {
                const on = e.key === selectedKey;
                return (
                  <li
                    key={e.key}
                    className={mergeClasses(s.item, on && s.selected)}
                    data-entity-name={e.name}
                    data-entity-description={e.description}
                    tabIndex={0}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => selectShared(e.key)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectShared(e.key); } }}
                  >
                    <Text weight="semibold">{e.name}{on ? '（選択中）' : ''}</Text>
                    <Text size={200}>{e.description}</Text>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={s.section} aria-label="データビュアー">
            <Text as="h3" weight="semibold">データビュアー</Text>
            <DataViewer entities={viewerEntities} selectedKey={selectedKey} onSelect={selectShared} relations={viewerRelations} />
          </section>

          <section className={s.section} aria-label="データエンティティの詳細" data-testid="entity-detail">
            <Text as="h3" weight="semibold">詳細</Text>
            {!selected ? (
              <Text>一覧の行を選ぶと、詳細が表示されます。</Text>
            ) : (
              <dl className={s.detail}>
                <dt className={s.dt}>名称</dt><dd className={s.dd}>{selected.name}</dd>
                <dt className={s.dt}>説明</dt><dd className={s.dd}>{selected.description}</dd>
                <dt className={s.dt}>導出元</dt>
                <dd className={s.dd}>
                  <ul className={s.plain}>{selected.origins.map((o) => <li key={`${o.kind}:${o.id}`}>{`${ORIGIN_LABELS[o.kind]}: ${o.title}`}</li>)}</ul>
                </dd>
                <dt className={s.dt}>関連するユースケース</dt>
                <dd className={s.dd}>
                  {(() => {
                    const rel = relatedUseCases(selected, useCases, model.derived, links);
                    return rel.length === 0
                      ? '（なし）'
                      : <ul className={s.plain}>{rel.map((r) => <li key={r.id}>{`${r.name}（${KIND_LABELS[r.kind]}）`}</li>)}</ul>;
                  })()}
                </dd>
              </dl>
            )}
          </section>

          <section className={s.section} aria-label="エンティティとユースケースの対応表">
            <Text as="h3" weight="semibold">エンティティ×ユースケースの対応表</Text>
            {matrix.emptyReason ? <Text data-testid="matrix-empty-reason" role="status">{matrix.emptyReason}</Text> : null}
            {entities.length === 0 ? (
              <Text size={200}>データエンティティがないため、対応表の行は空です。</Text>
            ) : (
              <div className={s.scroll}>
                <table className={s.table} data-testid="entity-usecase-matrix" aria-label="エンティティ×ユースケースの対応表">
                  <thead>
                    <tr>
                      <th scope="col" className={s.cell}>データエンティティ</th>
                      {matrix.useCases.map((u) => <th key={u.id} scope="col" className={s.cell}>{u.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.entity.key}>
                        <th scope="row" className={s.cell}>{row.entity.name}</th>
                        {row.cells.map((c) => {
                          const uc = matrix.useCases.find((u) => u.id === c.useCaseId)!;
                          return (
                            <td key={c.useCaseId} className={s.cell} data-kind={c.kind} data-entity-name={row.entity.name} data-usecase-name={uc.name}>
                              {c.kind === 'derived' ? <Text>導出</Text> : null}
                              {c.kind === 'explicit' ? (
                                <>
                                  <Text>明示</Text>{' '}
                                  <Button className={s.forced} size="small" aria-label={`削除: ${row.entity.name} × ${uc.name} の明示の紐づけ`} onClick={() => onRemove(row.entity.name, c.useCaseId)}>削除</Button>
                                </>
                              ) : null}
                              {c.kind === 'none' ? (
                                <Button className={s.forced} size="small" aria-label={`紐づけを追加: ${row.entity.name} × ${uc.name}`} onClick={() => onAdd(row.entity.name, c.useCaseId)}>紐づけを追加</Button>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className={s.section} aria-label="企業データカタログの取り込みと突合">
            <Text as="h3" weight="semibold">企業データカタログとの突合</Text>
            <Text size={200}>JSON または CSV のファイルを取り込みます。ファイルの内容はこの端末の中だけで読み込み、外部へは送信しません。</Text>
            <div>
              <label htmlFor="dc-file">企業データカタログのファイル</label>{' '}
              <input id="dc-file" type="file" accept=".json,.csv,application/json,text/csv" onChange={(ev) => { void onFile(ev.target.files?.[0]); ev.target.value = ''; }} />
            </div>
            {importedMsg ? <Text role="status">{importedMsg}</Text> : null}
            {importErrors.length > 0 ? (
              <MessageBar intent="error" layout="multiline" role="alert">
                <MessageBarBody><ul className={s.plain}>{importErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>取り込み済みの内容は変わっていません。</MessageBarBody>
              </MessageBar>
            ) : null}
            <div>
              <label htmlFor="dc-url">出典の URL（任意。記録するだけで、アクセスしません）</label>{' '}
              <Input id="dc-url" value={urlDraft} onChange={(_, d) => setUrlDraft(d.value)} />{' '}
              <Button size="small" onClick={onSaveUrl}>出典を保存</Button>
              {urlError ? <Text role="alert">{urlError}</Text> : null}
              {savedUrl ? <Text data-testid="catalog-source-url" as="p">出典: {savedUrl}</Text> : null}
            </div>
            {hasCatalog ? (
              <>
                <Text data-testid="reconcile-counts" role="status">{CATEGORIES.map((c) => `${c} ${counts[c]} 件`).join('、')}</Text>
                <div className={s.scroll}>
                  <table className={s.table} data-testid="reconcile-table" aria-label="突合の結果">
                    <thead><tr><th scope="col" className={s.cell}>区分</th><th scope="col" className={s.cell}>名称</th><th scope="col" className={s.cell}>BAS の説明</th><th scope="col" className={s.cell}>カタログの説明</th></tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} data-entity-name={r.name} data-category={r.category}>
                          <td className={s.cell}>{r.category}</td>
                          <td className={s.cell}>{r.name}</td>
                          <td className={s.cell}>{r.entity?.description ?? '—'}</td>
                          <td className={s.cell}>{r.item ? r.item.description || '（説明なし）' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <Text size={200}>企業データカタログを取り込むと、「一致」「差異」「BASのみ」「カタログのみ」の突合の結果が表示されます。</Text>}
            <div>
              <Button appearance="primary" className={s.forced} onClick={onAddTodos}>未掲載を ToDo に追加</Button>
            </div>
            <Text data-testid="todo-add-result" role="status">{todoResult || todoPrecondition}</Text>
          </section>
        </div>
      )}
    </Panel>
  );
}

export { DataCatalogScreen };
