// ボードの PDF 出力のダイアログ（FR-096）。範囲・用紙・向きを選び、出力の前にプレビューで範囲を確かめる。
// キーボードだけで開いて（ボタンに Enter）、選んで、出力できる。
import { useMemo, useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { useInk, selectBoard } from '../ink/store';
import { usePackStore } from '../store/pack';
import { downloadBlob } from './deliver';
import {
  buildBoardPdf, countContents, pageSize, pdfSections, pdfSource, type Orientation, type PaperSize, type PdfRange,
} from './pdf';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  options: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalS },
  frame: {
    boxSizing: 'border-box',
    maxWidth: '100%',
    maxHeight: '320px',
    margin: '0 auto',
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow8,
    overflow: 'hidden',
    '& svg': { display: 'block', width: '100%', height: '100%' },
  },
  empty: { color: tokens.colorNeutralForeground3 },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

const safeName = (s: string): string => (s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'ボード');

export interface BoardPdfDialogProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 出力の結果を知らせる（画面のステータス用） */
  onResult?: (message: string) => void;
}

export function BoardPdfDialog({ boardId, open, onOpenChange, onResult }: BoardPdfDialogProps) {
  const s = useStyles();
  const board = useInk((st) => selectBoard(boardId)(st));
  const boards = useInk((st) => st.boards);
  const selection = useInk((st) => st.selection);
  const pack = usePackStore((st) => st.state);
  const selectedIds = useMemo(() => (selection && selection.boardId === boardId ? selection.ids : []), [selection, boardId]);
  const [range, setRange] = useState<PdfRange>('board');
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svg = useMemo(() => (open && board ? pdfSource(board, range, selectedIds) : null), [open, board, range, selectedIds]);
  const counts = useMemo(() => (board ? countContents(board, range, selectedIds) : null), [board, range, selectedIds]);
  const hasOutput = useMemo(() => pdfSections(boards, boardId, range, selectedIds).length > 0, [boards, boardId, range, selectedIds]);
  const page = pageSize(paper, orientation);

  const run = async () => {
    if (!board || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cu = pack.status === 'ready' ? pack.pack.data.customer : null;
      const bytes = await buildBoardPdf(boards, boardId, {
        paper, orientation, range, selectedIds,
        ...(cu ? { subtitle: `${cu.name} ${cu.projectName}` } : {}),
      });
      if (!bytes) { setError('出力する範囲に何もありません。範囲を変えるか、ボードに書き込んでください。'); return; }
      const name = `${safeName(range === 'all' ? 'ホワイトボード' : board.name)}.pdf`;
      downloadBlob(name, new Blob([bytes.slice().buffer], { type: 'application/pdf' }));
      onResult?.(`${name} を出力しました（${paper}・${orientation === 'landscape' ? '横' : '縦'}）。`);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF を出力できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)} modalType="modal">
      <DialogSurface aria-label="PDF 出力">
        <DialogBody>
          <DialogTitle>PDF 出力</DialogTitle>
          <DialogContent className={s.body}>
            <div className={s.options}>
              <Field label="範囲">
                <RadioGroup layout="horizontal" value={range} onChange={(_, d) => setRange(d.value as PdfRange)}>
                  <Radio value="all" label="全体" />
                  <Radio value="board" label="ボード" />
                  <Radio value="selection" label="選択範囲" disabled={selectedIds.length === 0} />
                  <Radio value="view" label="表示中の範囲" />
                </RadioGroup>
              </Field>
              <Field label="用紙">
                <RadioGroup layout="horizontal" value={paper} onChange={(_, d) => setPaper(d.value as PaperSize)}>
                  <Radio value="A4" label="A4" />
                  <Radio value="A3" label="A3" />
                  <Radio value="16:9" label="16:9" />
                </RadioGroup>
              </Field>
              <Field label="向き">
                <RadioGroup layout="horizontal" value={orientation} onChange={(_, d) => setOrientation(d.value as Orientation)}>
                  <Radio value="landscape" label="横" />
                  <Radio value="portrait" label="縦" />
                </RadioGroup>
              </Field>
            </div>
            <div
              className={s.frame}
              data-testid="pdf-preview"
              role="img"
              aria-label={`出力のプレビュー（${paper}・${orientation === 'landscape' ? '横' : '縦'}）。${board?.name ?? ''}`}
              style={{ aspectRatio: `${page.w} / ${page.h}`, width: orientation === 'landscape' ? '100%' : 'auto', height: orientation === 'landscape' ? 'auto' : '320px' }}
            >
              {svg ? <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} /> : <Text className={s.empty}>この範囲には、出力するものがありません。</Text>}
            </div>
            {counts && (
              <Text size={200} role="status">
                出力に入るもの: 付箋 {counts.stickies}・テキスト {counts.texts}・図形 {counts.shapes}・手書き {counts.strokes} 本
              </Text>
            )}
            {error && <Text role="alert" size={200}>{error}</Text>}
          </DialogContent>
          <DialogActions>
            <Button className={s.forcedAuto} appearance="primary" disabled={busy || !hasOutput} onClick={() => { void run(); }}>出力</Button>
            <Button onClick={() => onOpenChange(false)}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
