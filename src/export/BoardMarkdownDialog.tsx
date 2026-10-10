// インクの Markdown 出力のダイアログ（FR-093）。このボード／すべてのボードを選び、ボードごとの `.md` と `assets/` の画像を ZIP にして出力する。
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { useInk } from '../ink/store';
import { downloadBlob } from './deliver';
import { inkMarkdownEntries, inkMarkdownZipName } from './inkMarkdown';
import { createZip } from './zip';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

type Target = 'this' | 'all';

export interface BoardMarkdownDialogProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult?: (message: string) => void;
}

export function BoardMarkdownDialog({ boardId, open, onOpenChange, onResult }: BoardMarkdownDialogProps) {
  const s = useStyles();
  const boards = useInk((st) => st.boards);
  const [target, setTarget] = useState<Target>('all');
  const [error, setError] = useState<string | null>(null);

  const chosen = boards.filter((b) => b.kind === 'board' && (target === 'all' || b.id === boardId));

  const run = () => {
    if (chosen.length === 0) { setError('出力するボードがありません。'); return; }
    const now = new Date();
    try {
      const name = inkMarkdownZipName(now);
      downloadBlob(name, new Blob([createZip(inkMarkdownEntries(chosen, now), now).slice().buffer], { type: 'application/zip' }));
      onResult?.(`${name} を出力しました（${chosen.length} 枚）。`);
      setError(null);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Markdown を出力できませんでした。');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)} modalType="modal">
      <DialogSurface aria-label="Markdown 出力">
        <DialogBody>
          <DialogTitle>Markdown 出力</DialogTitle>
          <DialogContent className={s.body}>
            <Field label="範囲">
              <RadioGroup layout="horizontal" value={target} onChange={(_, d) => setTarget(d.value as Target)}>
                <Radio value="this" label="このボードだけ" />
                <Radio value="all" label="すべてのボード" />
              </RadioGroup>
            </Field>
            <Text size={200}>ボードごとに .md（front matter とチェックリスト）を作り、画像は assets/ に置いて相対リンクで参照する ZIP にします（{chosen.length} 枚）。</Text>
            {error && <Text role="alert" size={200}>{error}</Text>}
          </DialogContent>
          <DialogActions>
            <Button className={s.forcedAuto} appearance="primary" disabled={chosen.length === 0} onClick={run}>出力</Button>
            <Button onClick={() => onOpenChange(false)}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
