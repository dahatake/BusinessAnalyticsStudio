// 「データカタログ」コンポーネント（FR-159 一覧・詳細、FR-160 エンティティ×ユースケースの対応表と明示の紐づけ、NFR-UX-011）。
// データエンティティと「導出」の対応は、顧客パックと登録済みのユースケースから開くたびに導出し、保存しない。保存するのは「明示」の紐づけだけ。
// 選択中のエンティティは store に持ち、レイアウトの変更でコンポーネントが作り直されても失われない。端末内だけで動き、AI には接続しない。
import { useMemo, useState } from 'react';
import { Button, MessageBar, MessageBarBody, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { EmptyView } from '../components/StateViews';
import {
  KIND_LABELS, ORIGIN_LABELS, buildMatrix, deriveEntities, deriveLinks, relatedUseCases, toRecords, type PackEntity,
} from '../datacatalog/model';
import { usePackStore } from '../store/pack';
import { useDataCatalog, useExplicitLinks } from '../store/datacatalog';
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
  const matrix = useMemo(() => buildMatrix(entities, useCases, model.derived, links), [entities, useCases, model.derived, links]);
  const selected = entities.find((e) => e.key === selectedKey);

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
                    onClick={() => select(e.key)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(e.key); } }}
                  >
                    <Text weight="semibold">{e.name}{on ? '（選択中）' : ''}</Text>
                    <Text size={200}>{e.description}</Text>
                  </li>
                );
              })}
            </ul>
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
        </div>
      )}
    </Panel>
  );
}

export { DataCatalogScreen };
