// メモ画面（FR-280）。端末内に保存される文章のコンポーネント。「Copilot の案」の「反映」で、表示と保存したデータを案の内容に更新する。
import { Field, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { useT } from '../i18n';
import { registerReflector } from '../review/reviewStore';
import { useMemoStore } from '../store/memo';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  shown: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
});

/** 案の「反映」の部品。メモのデータを案の内容で更新する（作成者の種別は AI 提案の採用） */
export function reflectMemo(text: string): void {
  useMemoStore.getState().setText(text, 'ai-adopted');
}

// 反映の部品は、画面を読み込んだ時点で登録する（案の「反映」の可否が、描画の順序に左右されないように）
registerReflector('memo', reflectMemo);

export function MemoScreen() {
  const s = useStyles();
  const t = useT();
  const text = useMemoStore((st) => st.text);
  const author = useMemoStore((st) => st.author);
  const setText = useMemoStore((st) => st.setText);
  return (
    <Panel testId="component-memo" title={t('メモ')} description={t('この端末にだけ保存される自由なメモです。Copilot の案を「反映」すると、この内容が案の内容に変わります。')} maxWidth="900px">
      <div className={s.body}>
        <Text className={s.shown} data-testid="memo-text">{text === '' ? t('（メモはまだありません）') : text}</Text>
        {author === 'ai-adopted' && text !== '' && <Text size={200}>{t('Copilot の案を採用した内容です。')}</Text>}
        <Field label={t('メモを編集')}>
          <Textarea value={text} resize="vertical" onChange={(_, d) => setText(d.value)} />
        </Field>
      </div>
    </Panel>
  );
}
