// コンポーネントごとの「Copilot の案」の表示・編集・破棄（FR-279）。Panel が、コンポーネントの本体の下に置く。
// 案は現在のデータ（component-data）とは別の欄。AI 生成であることを文字のラベルで示す（FR-050）。
// 「反映」（FR-280）を押すまで、画面コンポーネントの表示とアプリが管理するデータは変わらない。案の内容は store に持ち、レイアウトの変更で失われない。
import { useId } from 'react';
import { Button, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { useT } from '../i18n';
import { reflectorOf, useReviewStore } from './reviewStore';

/** 「反映」（FR-280）: そのコンポーネントの部品に案の内容を渡し、成功したらそのコンポーネントの案だけを「反映済み」にして取り除く。失敗したら案を残す */
export async function reflectProposal(componentKey: string, text: string): Promise<boolean> {
  const reflect = reflectorOf(componentKey);
  if (!reflect) return false;
  try {
    await reflect(text);
  } catch (e) {
    void e;
    return false;
  }
  useReviewStore.getState().reflected(componentKey);
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
      <div className={s.actions}>
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
