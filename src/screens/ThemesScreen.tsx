// 議論テーマの画面（FR-048〜FR-050）。テーマの一覧と、選んだテーマの議論の記録・決定ステータス・次のアクション。
// 顧客の決定と AI の提案は、文字のラベル（「顧客決定」「AI 提案」）と別の欄で区別する（色だけに頼らない）。
import { useEffect, useRef, useState } from 'react';
import {
  Badge, Button, DialogActions, DialogBody, DialogContent, DialogTitle, Dropdown, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Option, Spinner, Text, Textarea, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import {
  Add24Regular, ArrowRedo24Regular, ArrowUndo24Regular, Delete24Regular, Edit24Regular, Sparkle24Regular,
} from '@fluentui/react-icons';
import { Panel } from '../components/Panel';
import { EmptyView, ErrorView, LoadingView } from '../components/StateViews';
import { MOCK_LABEL, REAL_LABEL } from '../ai/client';
import { useAi } from '../ai/useAi';
import {
  DECISION_STATUSES, RECORD_FIELDS, STATUS_DISPLAY_LABEL, STATUS_OPTION_LABEL, parseDueDate, statusOrigin,
  type DecisionStatus, type NextAction, type Theme,
} from '../discussion/model';
import { hasThemeFor, usePackTarget } from '../discussion/usePackTarget';
import { selectCanRedo, selectCanUndo, selectSelectedId, selectThemes, useDiscussionStore } from '../store/discussion';
import { useLayout } from '../store/layout';
import { usePackStore } from '../store/pack';
import { useTreeStore } from '../store/tree';

const useStyles = makeStyles({
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 300px) 1fr',
    columnGap: tokens.spacingHorizontalXL,
    rowGap: tokens.spacingVerticalL,
    alignItems: 'start',
    '@media (max-width: 720px)': { gridTemplateColumns: '1fr' },
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  item: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemSelected: {
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  itemHead: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  title: { flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' },
  itemActions: { display: 'flex', columnGap: tokens.spacingHorizontalXS, flexShrink: 0 },
  detail: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL, minWidth: 0 },
  statusRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  proposal: {
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground3,
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS,
  },
  proposalBody: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  proposalText: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  action: {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 2fr) minmax(100px, 1fr) minmax(140px, 1fr) auto',
    columnGap: tokens.spacingHorizontalS,
    alignItems: 'start',
    padding: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 720px)': { gridTemplateColumns: '1fr' },
  },
  actions: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
});

function StatusBadge({ status }: { status: DecisionStatus }) {
  const ai = statusOrigin(status) === 'ai';
  return (
    <Badge
      appearance={status === 'decided' ? 'filled' : 'tint'}
      color={status === 'decided' ? 'success' : ai ? 'informative' : status === 'on-hold' ? 'warning' : 'brand'}
      shape="rounded"
    >
      {STATUS_DISPLAY_LABEL[status]}
    </Badge>
  );
}

function ThemeListItem({ theme, selected, onSelect, onDelete, rename }: {
  theme: Theme;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  rename: (title: string) => boolean;
}) {
  const s = useStyles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme.title);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    if (rename(draft)) { setEditing(false); setError(null); } else setError('テーマの名前を入力してください。');
  };
  const cancel = () => { setEditing(false); setError(null); setDraft(theme.title); };

  return (
    <li
      className={mergeClasses(s.item, selected && s.itemSelected)}
      data-testid="theme-item"
      data-entity-id={theme.id}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <div className={s.itemHead}>
        {editing ? (
          <Field validationState={error ? 'error' : 'none'} validationMessage={error ?? undefined} className={s.title}>
            <Input
              ref={ref}
              aria-label="テーマの名前"
              value={draft}
              onChange={(_, d) => setDraft(d.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
              }}
            />
          </Field>
        ) : (
          <Text weight={selected ? 'semibold' : 'regular'} className={s.title}>{theme.title}</Text>
        )}
        <StatusBadge status={theme.status} />
        <div className={s.itemActions} onClick={(e) => e.stopPropagation()}>
          <Button size="small" appearance="subtle" icon={<Edit24Regular aria-hidden />} aria-label="名前を編集" title="名前を編集"
            onClick={() => { setDraft(theme.title); setEditing(true); onSelect(); }} />
          <Button size="small" appearance="subtle" icon={<Delete24Regular aria-hidden />} aria-label="削除" title="削除" onClick={onDelete} />
        </div>
      </div>
    </li>
  );
}

function NextActionRow({ action, onChange, onRemove }: {
  action: NextAction;
  onChange: (patch: Partial<Omit<NextAction, 'id'>>) => void;
  onRemove: () => void;
}) {
  const s = useStyles();
  const [dueDraft, setDueDraft] = useState(action.due);
  const [dueError, setDueError] = useState<string | null>(null);
  useEffect(() => { setDueDraft(action.due); setDueError(null); }, [action.due]);

  /** 日付として読めるときだけ保存する。読めなければ保存せず、原因を出す。 */
  const commitDue = (value: string) => {
    const r = parseDueDate(value);
    if (r.ok) { setDueError(null); if (r.value !== action.due) onChange({ due: r.value }); } else setDueError(r.reason);
  };

  return (
    <div className={s.action} data-testid="next-action">
      <Field label="内容"><Input value={action.text} onChange={(_, d) => onChange({ text: d.value })} /></Field>
      <Field label="担当"><Input value={action.owner} onChange={(_, d) => onChange({ owner: d.value })} /></Field>
      <Field label="期限" validationState={dueError ? 'error' : 'none'} validationMessage={dueError ?? undefined}>
        <Input
          type="date"
          value={dueDraft}
          onChange={(_, d) => { setDueDraft(d.value); commitDue(d.value); }}
          onBlur={() => commitDue(dueDraft)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDue(dueDraft); } }}
        />
      </Field>
      <Button appearance="subtle" icon={<Delete24Regular aria-hidden />} aria-label="このアクションを削除" onClick={onRemove} />
    </div>
  );
}

function ThemeDetail({ packKey, theme }: { packKey: string; theme: Theme }) {
  const s = useStyles();
  const store = useDiscussionStore;
  const status = theme.status;
  const { ask } = useAi();
  const packData = usePackStore((st) => (st.state.status === 'ready' ? st.state.pack.data : undefined));
  /** 議論の記録から、議論ツリー（系統ツリー）を生成する（FR-042）。議論ツリーの画面を開き、進行表示と「取り消し」はそちらに出る。 */
  const generateTree = () => {
    if (!packData) return;
    void useTreeStore.getState().generate(packKey, theme, packData, (kind, prompt) => ask(kind, prompt));
    useLayout.getState().showComponent('discussion-tree');
  };
  return (
    <div className={s.detail} data-testid="theme-detail" data-entity-id={theme.id}>
      <Text as="h3" size={500} weight="semibold">{theme.title}</Text>
      <div>
        <Button icon={<Sparkle24Regular aria-hidden />} onClick={generateTree}>ツリーを生成</Button>
      </div>

      <div className={s.statusRow}>
        <Text>決定ステータス:</Text>
        <span data-testid="decision-status" style={{ display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS }}>
          <StatusBadge status={status} />
          <Text size={200}>{statusOrigin(status) === 'ai' ? 'AI の提案' : '顧客の選択'}</Text>
        </span>
        <Dropdown
          aria-label="決定ステータス"
          value={STATUS_OPTION_LABEL[status]}
          selectedOptions={[status]}
          onOptionSelect={(_, d) => { if (d.optionValue) store.getState().setStatus(packKey, theme.id, d.optionValue as DecisionStatus); }}
          style={{ minWidth: 160 }}
        >
          {DECISION_STATUSES.map((k) => <Option key={k} value={k}>{STATUS_OPTION_LABEL[k]}</Option>)}
        </Dropdown>
      </div>

      <div className={s.proposal}>
        {/* 見出しの文字のラベルは欄の外に置き、欄（ai-proposal）には AI の提案の本文だけを入れる */}
        <Text weight="semibold">AI の提案（決定しても残ります）</Text>
        <div className={s.proposalBody} data-testid="ai-proposal">
          {theme.aiProposal.trim() !== '' ? (
            <>
              <Text className={s.proposalText}>{theme.aiProposal}</Text>
              <Text size={200}>{theme.aiMode === 'connected' ? REAL_LABEL : MOCK_LABEL}</Text>
            </>
          ) : (
            <Text size={200}>このテーマに AI の提案はありません。</Text>
          )}
        </div>
      </div>

      {RECORD_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <Textarea resize="vertical" rows={3} value={theme[f.key]} onChange={(_, d) => store.getState().update(packKey, theme.id, { [f.key]: d.value })} />
        </Field>
      ))}

      <div className={s.actions}>
        <Text weight="semibold">次のアクション（担当・期限）</Text>
        {theme.actions.length === 0 ? <Text size={200}>次のアクションはまだありません。</Text> : null}
        {theme.actions.map((a) => (
          <NextActionRow
            key={a.id}
            action={a}
            onChange={(p) => store.getState().patchAction(packKey, theme.id, a.id, p)}
            onRemove={() => store.getState().removeAction(packKey, theme.id, a.id)}
          />
        ))}
        <div>
          <Button icon={<Add24Regular aria-hidden />} onClick={() => store.getState().addAction(packKey, theme.id)}>次のアクションを追加</Button>
        </div>
      </div>
    </div>
  );
}

export function ThemesScreen() {
  const s = useStyles();
  const packState = usePackStore((st) => st.state);
  const target = usePackTarget();
  const key = target?.key ?? '';
  const themes = useDiscussionStore(selectThemes(key));
  const selectedId = useDiscussionStore(selectSelectedId(key));
  const canUndo = useDiscussionStore(selectCanUndo(key));
  const canRedo = useDiscussionStore(selectCanRedo(key));
  const { ask } = useAi();
  const [toDelete, setToDelete] = useState<Theme | null>(null);
  const [proposing, setProposing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  if (packState.status === 'loading') return <LoadingView label="議論テーマを読み込み中" />;
  if (!target) return <ErrorView title="議論テーマを表示できません" messages={['顧客パックを読み込めていません。']} />;

  const st = useDiscussionStore.getState();
  const selected = themes.find((t) => t.id === selectedId) ?? null;

  /** AI にテーマを提案させる。まだテーマになっていない課題があればその課題を、なければ汎用のテーマを、「AI 提案」として加える。 */
  const propose = async () => {
    if (proposing) return;
    setProposing(true);
    setAiError(null);
    try {
      const issue = target.issues.find((i) => !hasThemeFor(themes, i.id));
      const prompt = issue
        ? `次の課題を ToBe に向けた議論テーマとして、論点と進め方を提案してください。課題: ${issue.title}`
        : '顧客の ToBe に向けた議論テーマを 1 つ提案してください。';
      const r = await ask('recommend', prompt);
      useDiscussionStore.getState().addTheme(target.key, {
        title: issue ? issue.title : `AI 提案のテーマ ${themes.length + 1}`,
        issueId: issue?.id,
        createdBy: 'ai',
        status: 'ai-proposed',
        aiProposal: r.answer,
        aiMode: r.mode,
      });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setProposing(false);
    }
  };

  return (
    <Panel
      testId="component-themes"
      title="議論テーマ"
      description="ToBe に向けた課題を議論テーマにして、選択肢・提言・根拠・決定事項などを記録します。決定は顧客の選択として、AI の提案と区別して残ります。"
    >
      <div className={s.toolbar} role="toolbar" aria-label="議論テーマの操作">
        <Button icon={<Add24Regular aria-hidden />} onClick={() => st.addTheme(target.key, { title: '新しいテーマ' })}>テーマを追加</Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button>課題からテーマを作る</Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {target.issues.length === 0 ? <MenuItem disabled>課題がありません</MenuItem> : null}
              {target.issues.map((i) => (
                <MenuItem key={i.id} onClick={() => st.createFromIssue(target.key, i)}>
                  {i.title}{hasThemeFor(themes, i.id) ? '（作成済み）' : ''}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
        <Button icon={<Sparkle24Regular aria-hidden />} disabled={proposing} onClick={() => void propose()}>テーマを提案</Button>
        <Button icon={<ArrowUndo24Regular aria-hidden />} disabled={!canUndo} onClick={() => st.undo(target.key)}>元に戻す</Button>
        <Button icon={<ArrowRedo24Regular aria-hidden />} disabled={!canRedo} onClick={() => st.redo(target.key)}>やり直し</Button>
        {proposing ? <span role="status" style={{ display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS }}><Spinner size="tiny" /><Text>提案を生成中…</Text></span> : null}
      </div>
      {aiError ? <ErrorView title="テーマを提案できませんでした" messages={[aiError]} action="接続の設定を確認して、もう一度お試しください。" /> : null}

      {themes.length === 0 ? (
        <EmptyView message="議論テーマはまだありません。「テーマを追加」「課題からテーマを作る」「テーマを提案」から始められます。" />
      ) : (
        <div className={s.layout}>
          <ul className={s.list} aria-label="議論テーマの一覧">
            {themes.map((t) => (
              <ThemeListItem
                key={t.id}
                theme={t}
                selected={t.id === selectedId}
                onSelect={() => st.select(target.key, t.id)}
                onDelete={() => setToDelete(t)}
                rename={(title) => useDiscussionStore.getState().rename(target.key, t.id, title)}
              />
            ))}
          </ul>
          {selected ? <ThemeDetail packKey={target.key} theme={selected} /> : <EmptyView message="左の一覧からテーマを選ぶと、議論の記録を入力できます。" />}
        </div>
      )}

      <Dialog modalType="alert" open={toDelete !== null} onOpenChange={(_, d) => { if (!d.open) setToDelete(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>テーマを削除しますか</DialogTitle>
            <DialogContent>「{toDelete?.title}」を削除します。削除したあとも「元に戻す」で復元できます。</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setToDelete(null)}>キャンセル</Button>
              <Button appearance="primary" onClick={() => { if (toDelete) st.remove(target.key, toDelete.id); setToDelete(null); }}>削除する</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Panel>
  );
}
