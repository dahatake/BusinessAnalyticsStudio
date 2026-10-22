// 作業領域の視点（パン。FR-016 AC-192）。画面「キャンバス」の廃止（FR-012）に伴い、作業領域（Workspace の面 `canvas-surface`）が持つ。
// プレゼンテーション中は現在の論点の位置が中央に来る視点へ移る。矢印キー（面にフォーカスがあるとき）で視点をパンする。
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { usePackStore } from '../store/pack';
import { currentTopic, usePresentationStore } from '../store/presentation';
import { registerTestHook } from '../testing/hook';
import { areaPanDelta } from './areaPan';

export interface AreaView { x: number; y: number; zoom: number }
const CARD_W = 260;
const CARD_H = 120;
const GAP = 60;

export function useAreaViewport(surface: RefObject<HTMLElement | null>) {
  const state = usePackStore((st) => st.state);
  const chapters = state.status === 'ready' ? state.pack.data.show?.chapters ?? [] : [];
  const cards = useMemo(
    () => chapters.flatMap((c, ci) => (c.topics ?? []).map((t, ti) => ({ id: t.id, cx: ti * (CARD_W + GAP) + CARD_W / 2, cy: ci * (CARD_H + GAP) + CARD_H / 2 }))),
    [chapters],
  );
  const [view, setViewState] = useState<AreaView>({ x: 40, y: 40, zoom: 1 });
  const viewRef = useRef(view);
  const setView = (v: AreaView): void => { viewRef.current = v; setViewState(v); };
  const size = (): { w: number; h: number } => {
    const r = surface.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  };

  const presenting = usePresentationStore((st) => currentTopic(st)?.id ?? null);
  useEffect(() => {
    const c = cards.find((k) => k.id === presenting);
    if (!c) return;
    const { w, h } = size();
    const z = viewRef.current.zoom;
    setView({ zoom: z, x: w / 2 - c.cx * z, y: h / 2 - c.cy * z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, cards]);

  useEffect(() => registerTestHook('canvas', {
    viewport: () => ({ ...viewRef.current }),
    isCentered: (id: string) => {
      const c = cards.find((k) => k.id === id);
      if (!c) return false;
      const { w, h } = size();
      const v = viewRef.current;
      return Math.abs(v.x + c.cx * v.zoom - w / 2) <= 4 && Math.abs(v.y + c.cy * v.zoom - h / 2) <= 4;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cards]);

  /** 矢印キーでパンする。処理したら true。 */
  const panByKey = (e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean => {
    const d = areaPanDelta(e);
    if (!d) return false;
    const v = viewRef.current;
    setView({ ...v, x: v.x - d.dx, y: v.y - d.dy });
    return true;
  };
  return { view, panByKey };
}
