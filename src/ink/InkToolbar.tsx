// インクの道具のツールバー。FR-088（ペン・蛍光ペン・消しゴム・投げ縄・図形・テキスト・付箋・画像・元に戻す/やり直し）
import { useState } from 'react';
import { Button, Divider, Slider, Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import {
  ArrowRedo24Regular, ArrowUndo24Regular, ArrowUpRight24Regular, ChatBubblesQuestion24Regular, Circle24Regular, Edit24Regular,
  Eraser24Regular, EraserSegment24Regular, Flow24Regular, Highlight24Regular, ImageAdd24Regular, Lasso24Regular, Line24Regular, Note24Regular,
  RectangleLandscape24Regular, TextT24Regular,
} from '@fluentui/react-icons';
import type { FluentIcon } from '@fluentui/react-icons';
import { newId, type ToolId } from './model';
import { selectCanRedo, selectCanUndo, selectBoard, useInk } from './store';

interface ToolDef { id: ToolId; label: string; icon: FluentIcon; whiteboardOnly?: boolean }
const TOOLS: ReadonlyArray<ToolDef> = [
  { id: 'pen', label: 'ペン', icon: Edit24Regular },
  { id: 'highlighter', label: '蛍光ペン', icon: Highlight24Regular },
  { id: 'eraser-stroke', label: '消しゴム（ストローク単位）', icon: Eraser24Regular },
  { id: 'eraser-pixel', label: '消しゴム（ピクセル単位）', icon: EraserSegment24Regular },
  { id: 'lasso', label: '投げ縄', icon: Lasso24Regular },
  { id: 'line', label: '直線', icon: Line24Regular },
  { id: 'arrow', label: '矢印', icon: ArrowUpRight24Regular },
  { id: 'rect', label: '矩形', icon: RectangleLandscape24Regular },
  { id: 'ellipse', label: '円', icon: Circle24Regular },
  { id: 'callout', label: '吹き出し', icon: ChatBubblesQuestion24Regular },
  { id: 'text', label: 'テキスト', icon: TextT24Regular },
  { id: 'sticky', label: '付箋', icon: Note24Regular },
  { id: 'connector', label: 'コネクター', icon: Flow24Regular, whiteboardOnly: true },
];

export const INK_COLORS: ReadonlyArray<{ value: string; label: string; swatch: string }> = [
  { value: 'auto', label: '自動（文字色）', swatch: 'currentColor' },
  { value: '#d13438', label: '赤', swatch: '#d13438' },
  { value: '#0f6cbd', label: '青', swatch: '#0f6cbd' },
  { value: '#107c10', label: '緑', swatch: '#107c10' },
  { value: '#ca5010', label: '橙', swatch: '#ca5010' },
];

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  swatch: { width: '16px', height: '16px', borderRadius: '50%', border: `1px solid ${tokens.colorNeutralStroke1}`, display: 'inline-block' },
  size: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, minWidth: '140px' },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

export interface InkToolbarProps {
  boardId: string;
  /** ツールバーのアクセシブルな名前（同じ画面に 2 つ出るときは区別する） */
  label?: string;
  /** ホワイトボード（付箋をつなぐコネクターの道具を出す） */
  whiteboard?: boolean;
}

/** クリップボードの画像を、ボードの表示範囲の中央に貼る。 */
async function pasteClipboardImage(boardId: string): Promise<void> {
  const items = await navigator.clipboard.read();
  for (const it of items) {
    const type = it.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await it.getType(type);
    const src: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('画像を読み込めません')); img.src = src; });
    const st = useInk.getState();
    const b = selectBoard(boardId)(st);
    if (!b) return;
    const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(8, img.naturalWidth * scale), h = Math.max(8, img.naturalHeight * scale);
    const cx = b.view.x + b.size.w / b.view.zoom / 2, cy = b.view.y + b.size.h / b.view.zoom / 2;
    st.addItem(boardId, { id: newId('image'), type: 'image', x: cx - w / 2, y: cy - h / 2, w, h, src });
    return;
  }
  throw new Error('クリップボードに画像がありません');
}

export function InkToolbar({ boardId, label = 'インクの道具', whiteboard = false }: InkToolbarProps) {
  const s = useStyles();
  const tool = useInk((st) => st.tool);
  const color = useInk((st) => st.color);
  const size = useInk((st) => st.size);
  const canUndo = useInk(selectCanUndo(boardId));
  const canRedo = useInk(selectCanRedo(boardId));
  const [message, setMessage] = useState<string | null>(null);
  const st = useInk.getState;

  const button = (id: string, text: string, Icon: FluentIcon, onClick: () => void, opts: { pressed?: boolean; disabled?: boolean } = {}) => (
    <Tooltip key={id} content={text} relationship="label" withArrow>
      <Button
        className={s.forcedAuto}
        size="small"
        data-testid={`ink-tool-${id}`}
        appearance={opts.pressed ? 'primary' : 'subtle'}
        aria-pressed={opts.pressed === undefined ? undefined : opts.pressed}
        disabled={opts.disabled}
        icon={<Icon aria-hidden />}
        onClick={onClick}
      />
    </Tooltip>
  );

  return (
    <div>
      {/* ツールバーの印は付けるが、Fluent の Toolbar（矢印キーだけで項目を移り、Tab は 1 か所）は使わない。すべての道具に Tab で届くようにする（NFR-A11Y-001 AC-170） */}
      <div role="toolbar" aria-label={label} className={s.bar}>
        {TOOLS.filter((t) => whiteboard || !t.whiteboardOnly).map((t) => button(t.id, t.label, t.icon, () => st().setTool(t.id), { pressed: tool === t.id }))}
        {button('image', '画像を貼り付け', ImageAdd24Regular, () => {
          setMessage(null);
          pasteClipboardImage(boardId).catch((e: unknown) => setMessage(e instanceof Error ? e.message : '画像を貼り付けられませんでした'));
        })}
        <Divider vertical style={{ height: 24 }} />
        {button('undo', '元に戻す', ArrowUndo24Regular, () => st().undo(boardId), { disabled: !canUndo })}
        {button('redo', 'やり直し', ArrowRedo24Regular, () => st().redo(boardId), { disabled: !canRedo })}
        <Divider vertical style={{ height: 24 }} />
        {INK_COLORS.map((c) => (
          <Tooltip key={c.value} content={`色: ${c.label}`} relationship="label" withArrow>
            <Button
              className={s.forcedAuto}
              size="small"
              appearance={color === c.value ? 'primary' : 'subtle'}
              aria-pressed={color === c.value}
              icon={<span className={s.swatch} style={{ backgroundColor: c.swatch }} aria-hidden />}
              onClick={() => st().setColor(c.value)}
            />
          </Tooltip>
        ))}
        <span className={s.size}>
          <Text size={200}>太さ</Text>
          <Slider aria-label="線の太さ" min={1} max={12} step={1} value={size} onChange={(_, d) => st().setSize(d.value)} />
        </span>
      </div>
      {message && <Text role="status" size={200}>{message}</Text>}
    </div>
  );
}
