// ホワイトボードの項目の「読み上げ・操作用の層」（FR-097・FR-098・FR-099）。
// 描画は Canvas が行うので、この層の文字は見えない（opacity: 0）。同じ位置に、付箋・データのカード・フレームの見出しを
// DOM として重ね、支援技術が文字を読めるようにし、カードの編集とリンク（元データの選択）、票数の表示を受け持つ。
// 付箋・カードはポインター入力を受け取り、そのまま描画面（BoardSurface）の入力処理へ伝える。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { selectBoard, useInk } from '../ink/store';
import type { BoardItem } from '../ink/model';
import { KIND_LABELS } from '../selection/graph';
import { onEntityKey, useEntityBinding, useEntityGraph } from '../selection/hooks';
import { useEditStore } from '../store/edit';
import { useCardEdit } from './cardEdit';
import { FRAME_TITLE } from './ops';

const useStyles = makeStyles({
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformOrigin: '0 0', pointerEvents: 'none' },
  item: {
    position: 'absolute',
    boxSizing: 'border-box',
    overflow: 'hidden',
    opacity: 0,
    forcedColorAdjust: 'none',
    font: '16px/1.4 sans-serif',
    padding: '8px',
    userSelect: 'none',
  },
  vote: { position: 'absolute', top: 0, right: 0, padding: '2px 8px' },
  editor: {
    position: 'absolute',
    boxSizing: 'border-box',
    resize: 'none',
    margin: 0,
    padding: '8px',
    font: '16px/1.4 sans-serif',
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `2px solid ${tokens.colorBrandStroke1}`,
    borderRadius: '8px',
    outline: 'none',
  },
  error: { position: 'absolute', color: tokens.colorPaletteRedForeground1, fontSize: '12px', pointerEvents: 'none' },
});

const ORIGIN = 'whiteboard';

export function ItemOverlay({ boardId }: { boardId: string }) {
  const s = useStyles();
  const board = useInk(useMemo(() => selectBoard(boardId), [boardId]));
  const graph = useEntityGraph();
  const bind = useEntityBinding(ORIGIN);
  const editMode = useEditStore((st) => st.editMode);
  const [editing, setEditing] = useState<{ id: string; text: string; error?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 描画面のダブルクリックや Enter からの、カードの編集の依頼
  const editSeq = useCardEdit((st) => st.seq);
  const itemsNow = board?.items;
  useEffect(() => {
    const id = useCardEdit.getState().itemId;
    if (!id) return;
    useCardEdit.getState().clear();
    const it = itemsNow?.find((x) => x.id === id);
    if (it?.type === 'card') startEditRef.current(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSeq]);
  const startEditRef = useRef<(it: BoardItem) => void>(() => undefined);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // カードの表示名・種類を、元データの最新の値に合わせる（元データを編集すると、カードの絵にも反映される）
  const items = board?.items;
  useEffect(() => {
    if (!graph || !items) return;
    for (const it of items) {
      if (it.type !== 'card' || !it.sourceEntityId) continue;
      const node = graph.node(it.sourceEntityId);
      if (!node) continue;
      const sub = KIND_LABELS[node.kind];
      if (node.label !== it.label || sub !== it.sub) useInk.getState().patchItem(boardId, it.id, { label: node.label, sub }, false);
    }
  }, [graph, items, boardId]);

  if (!board) return null;
  const v = board.view;
  const frames = board.items.filter((i) => i.type === 'frame');
  const nodes = board.items.filter((i) => i.type === 'sticky' || i.type === 'card');

  const startEdit = (it: BoardItem) => {
    if (!it.sourceEntityId || !graph?.has(it.sourceEntityId)) { setNotice('元のデータが削除されているため、名前は変えられません。'); return; }
    if (!editMode) { setNotice('編集モードが OFF です。ヘッダーの「編集モード」を ON にしてください。'); return; }
    setNotice(null);
    setEditing({ id: it.id, text: graph.node(it.sourceEntityId)?.label ?? it.label ?? '' });
  };
  startEditRef.current = startEdit;
  const commit = () => {
    if (!editing) return;
    const it = board.items.find((x) => x.id === editing.id);
    if (!it?.sourceEntityId) { setEditing(null); return; }
    const r = useEditStore.getState().rename(it.sourceEntityId, editing.text);
    if (r.ok) setEditing(null);
    else setEditing({ ...editing, error: r.message });
  };

  const editingItem = editing ? board.items.find((x) => x.id === editing.id) : undefined;

  return (
    <div
      className={s.layer}
      role="list"
      aria-label="ボードの付箋・カード・フレーム"
      style={{ transform: `translate(${-v.x * v.zoom}px, ${-v.y * v.zoom}px) scale(${v.zoom})` }}
    >
      {frames.map((f) => (
        <div
          key={f.id}
          role="listitem"
          className={s.item}
          data-wb-type="frame"
          data-wb-id={f.id}
          style={{ left: f.x, top: f.y, width: f.w, height: FRAME_TITLE, pointerEvents: 'none' }}
        >
          フレーム: {f.label}{f.author === 'ai' ? '（AI 生成）' : ''}
        </div>
      ))}
      {nodes.map((it) => {
        const base = { left: it.x, top: it.y, width: it.w, height: it.h, pointerEvents: 'auto' as const };
        if (it.type === 'sticky') {
          return (
            <div key={it.id} role="listitem" className={s.item} data-wb-type="sticky" data-wb-id={it.id} style={base}>
              {it.text}
              {it.votes ? <span className={s.vote} data-testid="vote-count">{it.votes} 票</span> : null}
            </div>
          );
        }
        const linked = !!it.sourceEntityId && !!graph?.has(it.sourceEntityId);
        const props = linked ? bind(it.sourceEntityId!, { interactive: false }) : { 'data-entity-id': it.sourceEntityId ?? '' };
        return (
          <div
            key={it.id}
            role="listitem"
            className={s.item}
            data-wb-type="card"
            data-wb-id={it.id}
            tabIndex={0}
            aria-label={`${it.sub ?? 'データ'}のカード: ${it.label ?? ''}${linked ? '' : '（元のデータは削除されました）'}。Enter で名前を編集`}
            style={base}
            {...props}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); startEdit(it); }
              else if (it.sourceEntityId && linked) onEntityKey(e, it.sourceEntityId, ORIGIN);
            }}
          >
            {it.sub}: {it.label}{linked ? '' : '（元のデータは削除されました）'}
          </div>
        );
      })}
      {editing && editingItem && (
        <>
          <textarea
            className={s.editor}
            aria-label={`${editingItem.sub ?? 'データ'}の名前`}
            autoFocus
            ref={(el) => { if (el && document.activeElement !== el) { el.focus({ preventScroll: true }); el.select(); } }}
            value={editing.text}
            style={{ left: editingItem.x, top: editingItem.y, width: editingItem.w, height: editingItem.h }}
            onChange={(e) => setEditing({ ...editing, text: e.target.value, error: undefined })}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
              else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
            }}
          />
          {editing.error && <Text role="alert" className={s.error} style={{ left: editingItem.x, top: editingItem.y + editingItem.h + 4 }}>{editing.error}</Text>}
        </>
      )}
      {notice && (
        <Text
          role="status"
          className={s.error}
          style={{ left: v.x, top: v.y + 8, pointerEvents: 'none' }}
        >
          {notice}
        </Text>
      )}
    </div>
  );
}
