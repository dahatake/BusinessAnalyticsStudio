// メモ（FR-280）。端末内に保存される文章を持つコンポーネント。「Copilot の案」の「反映」で内容を更新できる（reviewStore の registerReflector）。
import { useEffect, useState } from 'react';
import { Button, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { Edit16Regular } from '@fluentui/react-icons';
import { Panel } from '../components/Panel';
import { LoadingView } from '../components/StateViews';
import { packKeyOf } from '../discussion/model';
import { registerReflector } from '../review/reviewStore';
import { usePackStore } from '../store/pack';
import { MEMO_EMPTY_TEXT, useMemoStore } from '../store/memo';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  text: { whiteSpace: 'pre-wrap' },
});

function MemoScreen() {
  const s = useStyles();
  const data = usePackStore((st) => (st.state.status === 'ready' ? st.state.pack.data : undefined));
  const key = data ? packKeyOf(data.customer.name, data.customer.projectName) : '';
  const stored = useMemoStore((st) => st.byPack[key]);
  const text = stored?.text ?? '';
  const [editing, setEditing] = useState(false);
  // 「反映」の登録。案の内容をこの顧客パックのメモとして保存する（作成者の種別は A-71 の AI 支援）
  useEffect(() => {
    if (!key) return undefined;
    return registerReflector('memo', (proposal) => { useMemoStore.getState().save(key, proposal, 'ai-assisted'); });
  }, [key]);
  if (!data) return <LoadingView label="メモを読み込み中" />;
  return (
    <Panel testId="component-memo" title="メモ" description="検討の論点・前提・次の行動を書き留めます。この端末に保存されます。">
      <div className={s.body}>
        <Text className={s.text} data-testid="memo-text">{text.trim() === '' ? MEMO_EMPTY_TEXT : text}</Text>
        <div>
          <Button size="small" icon={<Edit16Regular aria-hidden />} aria-label={editing ? 'メモの編集を閉じる' : 'メモを編集する'} aria-expanded={editing} onClick={() => setEditing((v) => !v)} />
        </div>
        {editing ? (
          <Textarea
            aria-label="メモを編集"
            value={text}
            resize="vertical"
            onChange={(_, d) => useMemoStore.getState().save(key, d.value, 'human')}
          />
        ) : null}
      </div>
    </Panel>
  );
}

export { MemoScreen };
