// アプリのデータのカードをボードに置く操作（FR-098）。
//  ・ドラッグ&ドロップ: データ項目（data-entity-id を持つ要素）をホワイトボードへドラッグすると、カードとして置く
//  ・メニュー: データ項目を右クリック（Shift+F10）→「ボードに配置」
// どの画面の項目にも効くよう、画面ごとの実装ではなく、ここで文書全体の操作を受ける。
import { useEffect, useRef, useState } from 'react';
import { Menu, MenuItem, MenuList, MenuPopover } from '@fluentui/react-components';
import { ENTITY_DRAG_MIME } from '../ink/model';
import { useInk } from '../ink/store';
import { packKeyOf } from '../discussion/model';
import { KIND_LABELS } from '../selection/graph';
import { getEntityGraph } from '../selection/hooks';
import { useDiscussionStore } from '../store/discussion';
import { usePackStore } from '../store/pack';
import { CARD_H, placeCard } from './ops';
import { tr, useT } from '../i18n';

/** いま開いている論点の ID（なければ null）。ホワイトボードは論点ごとにボードを持つ。 */
export function currentTopicId(): string | null {
  const st = usePackStore.getState().state;
  if (st.status !== 'ready') return null;
  const { customer } = st.pack.data;
  return useDiscussionStore.getState().byPack[packKeyOf(customer.name, customer.projectName)]?.selectedId ?? null;
}

export interface PlaceResult { ok: boolean; message: string }

/**
 * 元データ entityId のカードを、いまの論点のボードに置く。at はカードの中心（ワールド座標）。なければ表示範囲の中央。
 * すでに同じ元データのカードがあれば、増やさずにそのことを返す。
 */
export function placeEntityOnBoard(entityId: string, at?: { x: number; y: number }): PlaceResult {
  const node = getEntityGraph()?.node(entityId);
  if (!node) return { ok: false, message: tr('データが見つからないため、ボードに置けません。') };
  const ink = useInk.getState();
  ink.ensureTopicBoard(currentTopicId());
  const boardId = useInk.getState().activeBoardId;
  const board = useInk.getState().boards.find((b) => b.id === boardId);
  if (!board) return { ok: false, message: tr('ボードがありません。') };
  const existing = board.items.some((i) => i.type === 'card' && i.sourceEntityId === entityId);
  if (existing) return { ok: true, message: tr('「{name}」はすでにボードに置かれています。', { name: node.label }) };
  // 表示範囲の中央に置くときは、重ならないように、置いた数だけずらす
  const n = board.items.filter((i) => i.type === 'card').length;
  const c = at ?? {
    x: board.view.x + board.size.w / board.view.zoom / 2 + (n % 6) * 24,
    y: board.view.y + board.size.h / board.view.zoom / 2 + (n % 6) * (CARD_H / 3),
  };
  useInk.getState().updateItems(boardId, (items) => placeCard(items, { entityId, label: node.label, sub: KIND_LABELS[node.kind] }, c).items);
  return { ok: true, message: tr('{kind}「{name}」をボードに置きました。', { kind: tr(KIND_LABELS[node.kind]), name: node.label }) };
}

const insideBoard = (el: Element): boolean => !!el.closest('[data-testid="board-surface"]');

/** メニューの位置（クリックした場所。キーボードの操作では要素の左下）。 */
interface MenuState { id: string; x: number; y: number }

const HIDDEN: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

export function EntityBoardActions() {
  const t = useT();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [message, setMessage] = useState('');
  const frame = useRef(0);

  useEffect(() => {
    // データ項目をドラッグできるようにする（描画のたびに増える要素にも付ける）
    const mark = () => {
      frame.current = 0;
      const g = getEntityGraph();
      if (!g) return;
      for (const el of document.querySelectorAll<HTMLElement>('[data-entity-id]:not([draggable])')) {
        const id = el.getAttribute('data-entity-id');
        if (id && g.has(id) && !insideBoard(el)) el.setAttribute('draggable', 'true');
      }
    };
    const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(mark); };
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-entity-id'] });

    const onDragStart = (e: DragEvent) => {
      const el = e.target instanceof Element ? e.target.closest('[data-entity-id]') : null;
      const id = el?.getAttribute('data-entity-id');
      const node = id ? getEntityGraph()?.node(id) : undefined;
      if (!el || !id || !node || insideBoard(el) || !e.dataTransfer) return;
      e.dataTransfer.setData(ENTITY_DRAG_MIME, id);
      e.dataTransfer.setData('text/plain', node.label);
      e.dataTransfer.effectAllowed = 'copy';
    };
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest('[data-entity-id]') : null;
      const id = el?.getAttribute('data-entity-id');
      if (!el || !id || insideBoard(el) || !getEntityGraph()?.has(id)) return;
      e.preventDefault();
      // キーボード（Shift+F10 / メニューキー）では座標が 0 になるので、要素の左下に出す
      const r = el.getBoundingClientRect();
      const kb = e.clientX === 0 && e.clientY === 0;
      setMenu({ id, x: kb ? r.left : e.clientX, y: kb ? r.bottom : e.clientY });
    };
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      mo.disconnect();
      cancelAnimationFrame(frame.current);
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return (
    <>
      <Menu
        open={menu !== null}
        onOpenChange={(_, d) => { if (!d.open) setMenu(null); }}
        positioning={{
          position: 'below',
          align: 'start',
          target: menu ? { getBoundingClientRect: () => new DOMRect(menu.x, menu.y, 0, 0) } : undefined,
        }}
      >
        <MenuPopover>
          <MenuList>
            <MenuItem onClick={() => { if (menu) setMessage(placeEntityOnBoard(menu.id).message); setMenu(null); }}>{t('ボードに配置')}</MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
      <div role="status" aria-live="polite" style={HIDDEN} data-testid="board-place-status">{message}</div>
    </>
  );
}

/** ホワイトボードへのドロップ（BoardSurface の onEntityDrop）。結果の文は、画面の読み上げ用の領域に出す。 */
export function dropEntity(entityId: string, at: { x: number; y: number }): PlaceResult {
  return placeEntityOnBoard(entityId, at);
}
