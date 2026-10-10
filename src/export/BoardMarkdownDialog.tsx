// ボードの Markdown 出力のダイアログ（FR-093）。出力する範囲（すべてのボード／このボードだけ）を選び、ZIP をダウンロードする。
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { useInk } from '../ink/store';
import type { Board } from '../ink/model';
import { boardsMarkdownZip } from './boardMarkdown';
import { downloadBlob } from './deliver';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

export interface BoardMarkdownDialogProps {
  /** 出力の対象にできるボード（画面に出ているもの） */
  boards: readonly Board[];
  activeBoardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult?: (message: string) => void;
}

export function BoardMarkdownDialog({ boards, activeBoardId, open, onOpenChange, onResult }: BoardMarkdownDialogProps) {
  const s = useStyles();
  const [scope, setScope] = useState<'all' | 'one'>('all');
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    // 出力の直前の最新の中身を使う（ダイアログを開いている間の変更を含める）
    const latest = useInk.getState().boards.filter((b) => boards.some((x) => x.id === b.id));
    const targets = scope === 'all' ? latest : latest.filter((b) => b.id === activeBoardId);
    if (targets.length === 0) { setError('出力するボードがありません。'); return; }
    try {
      const bytes = boardsMarkdownZip(targets);
      downloadBlob('boards-markdown.zip', new Blob([bytes.slice().buffer], { type: 'application/zip' }));
      onResult?.(`boards-markdown.zip を出力しました（${targets.length} 枚）。`);
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
              <RadioGroup value={scope} onChange={(_, d) => setScope(d.value as 'all' | 'one')}>
                <Radio value="all" label={`すべてのボード（${boards.length} 枚）`} />
                <Radio value="one" label="このボードだけ" />
              </RadioGroup>
            </Field>
            <Text size={200}>ボードごとの .md（front matter とチェックリスト付き）と、画像を置く assets/ を ZIP にまとめます。画像は相対リンクで参照します。</Text>
            {error && <Text role="alert" size={200}>{error}</Text>}
          </DialogContent>
          <DialogActions>
            <Button className={s.forcedAuto} appearance="primary" onClick={run}>出力</Button>
            <Button onClick={() => onOpenChange(false)}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
