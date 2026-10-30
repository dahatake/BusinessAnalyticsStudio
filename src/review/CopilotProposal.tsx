// コンポーネントごとの「Copilot の案」の表示・編集・破棄（FR-279）。Panel が、コンポーネントの本体の下に置く。
// 案は現在のデータ（component-data）とは別の欄。AI 生成であることを文字のラベルで示す（FR-050）。
// 「反映」（FR-280）を押すまで、画面コンポーネントの表示とアプリが管理するデータは変わらない。案の内容は store に持ち、レイアウトの変更で失われない。
import { useId } from 'react';
import { Button, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { useT } from '../i18n';
import { reflectorOf, undoOf, useReviewStore } from './reviewStore';
import { tr } from '../i18n';

/** 反映の直前の内容の退避先（端末内。FR-281）。取り消しの元は同じ内容のメモリ上の写しを優先し、再読み込み後はこの退避から戻す */
export const REFLECT_BACKUP_KEY = 'eabk.reflectBackup.v1';
const backups = new Map<string, unknown>();
function writeBackup(key: string, before: unknown): void {
  backups.set(key, before);
  try {
    const all = JSON.parse(localStorage.getItem(REFLECT_BACKUP_KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(REFLECT_BACKUP_KEY, JSON.stringify({ ...all, [key]: before }));
  } catch { /* 退避の保存に失敗しても反映は止めない（メモリ上の写しで取り消せる） */ }
}
function readBackup(key: string): { found: boolean; value?: unknown } {
  if (backups.has(key)) return { found: true, value: backups.get(key) };
  try {
    const all = JSON.parse(localStorage.getItem(REFLECT_BACKUP_KEY) ?? '{}') as Record<string, unknown>;
    if (key in all) return { found: true, value: all[key] };
  } catch { /* 読めない */ }
  return { found: false };
}
const causeOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));

/** 「反映」（FR-280）: そのコンポーネントの部品に案の内容を渡し、成功したらそのコンポーネントの案だけを「反映済み」にして取り除く。
 *  失敗したら（FR-281）画面もデータも反映前のまま、案と編集内容を残し、原因と次の行動を示す */
export async function reflectProposal(componentKey: string, text: string): Promise<boolean> {
  const reflect = reflectorOf(componentKey);
  if (!reflect) return false;
  const undo = undoOf(componentKey);
  let before: unknown;
  try {
    before = undo?.snapshot();
    await reflect(text);
  } catch (e) {
    useReviewStore.getState().reflectFailed(componentKey, tr('反映に失敗しました。案と編集した内容は残してあります。原因: {cause}。保存先の空き容量や権限を確認してから、もう一度「反映」を押してください。', { cause: causeOf(e) }));
    return false;
  }
  if (undo) writeBackup(componentKey, before);
  useReviewStore.getState().reflected(componentKey);
  return true;
}

/** 「反映の取り消し」（FR-281）: 退避した反映前の内容に、表示と保存データを戻す */
export async function undoReflect(componentKey: string): Promise<boolean> {
  const undo = undoOf(componentKey);
  const b = readBackup(componentKey);
  if (!undo || !b.found) return false;
  try {
    await undo.restore(b.value);
  } catch (e) {
    useReviewStore.getState().reflectFailed(componentKey, tr('反映の取り消しに失敗しました。原因: {cause}', { cause: causeOf(e) }));
    return false;
  }
  useReviewStore.getState().undone(componentKey);
  return true;
}

const useStyles = makeStyles({
  box: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM, borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actions: { display: 'flex', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  none: { color: tokens.colorNeutralForeground2 },
});

export function CopilotProposal({ componentKey, title }: { componentKey: string; title: string }) {
  const s = useStyles();
  const t = useT();
  const labelId = useId();
  const text = useReviewStore((st) => st.proposals[componentKey]);
  const none = useReviewStore((st) => st.none[componentKey] === true);
  const isDone = useReviewStore((st) => st.done[componentKey] === true);
  const canUndo = useReviewStore((st) => st.undoable[componentKey] === true);
  const failure = useReviewStore((st) => st.failure[componentKey]);
  const edit = useReviewStore((st) => st.edit);
  const discard = useReviewStore((st) => st.discard);
  if (text === undefined) {
    return none ? <Text size={300} className={s.none} data-testid="copilot-none">{t('案なし')}</Text> : null;
  }
  const reflect = reflectorOf(componentKey);
  return (
    <section className={s.box} data-testid="copilot-proposal" aria-labelledby={labelId}>
      <Text id={labelId} weight="semibold">{t('Copilot の案（AI 生成）')}</Text>
      <Textarea
        aria-label={t('{title}の Copilot の案を編集', { title })}
        value={text}
        resize="vertical"
        onChange={(_, d) => edit(componentKey, d.value)}
      />
      {isDone ? <Text size={200} data-testid="copilot-reflected">{t('反映済み')}</Text> : null}
      {failure ? <Text size={200} role="alert" data-testid="copilot-reflect-error">{failure}</Text> : null}
      <div className={s.actions}>
        {isDone && canUndo ? <Button data-testid="copilot-undo" onClick={() => { void undoReflect(componentKey); }}>{t('反映の取り消し')}</Button> : null}
        <Button
          appearance="primary"
          disabledFocusable={!reflect}
          title={reflect ? undefined : t('このコンポーネントは、案の反映にまだ対応していません')}
          onClick={() => { void reflectProposal(componentKey, text); }}
        >
          {t('反映')}
        </Button>
        <Button onClick={() => discard(componentKey)}>{t('破棄')}</Button>
      </div>
    </section>
  );
}
