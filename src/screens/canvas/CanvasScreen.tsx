// キャンバス: パン/ズームで議題間を移動する広い面（FR-012）。
// マウスのドラッグ・ホイール・キーボード（矢印キーと +/-）で動かし、議題の一覧から選ぶとその議題の位置へ移動する。
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, Listbox, Option, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../../components/Panel';
import { EmptyView } from '../../components/StateViews';
import { CoreObjectPanel } from '../../coreobject/CoreObjectPanel';
import { LensView } from '../../lens/LensView';
import { useCoreObject } from '../../store/coreObject';
import { usePackStore } from '../../store/pack';
import { currentTopic, usePresentationStore } from '../../store/presentation';
import { useRetainedState } from '../../store/retained';
import { registerTestHook } from '../../testing/hook';
import {
  CARD_H, CARD_W, GAP_X, GAP_Y, cardOrigin, centerOn, isCenteredOn, keyViewport, panBy, zoomAt, type Viewport,
} from '../../workspace/viewport';

const useStyles = makeStyles({
  tools: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  core: {
    position: 'absolute',
    boxSizing: 'border-box',
    width: `${CARD_W}px`,
    height: `${CARD_H}px`,
    padding: tokens.spacingHorizontalM,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    rowGap: tokens.spacingVerticalXS,
    backgroundColor: tokens.colorBrandBackground2,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow8,
  },
  body: { display: 'flex', flex: '1 1 0', minHeight: '240px', columnGap: tokens.spacingHorizontalM, '@media (max-width: 720px)': { flexDirection: 'column', rowGap: tokens.spacingVerticalM } },
  list: { flex: '0 0 220px', maxHeight: '100%', overflowY: 'auto', '@media (max-width: 720px)': { flex: '0 0 auto', maxHeight: '160px' } },
  surface: {
    position: 'relative',
    flex: '1 1 0',
    minWidth: 0,
    minHeight: '200px',
    overflow: 'hidden',
    cursor: 'grab',
    touchAction: 'none',
    backgroundColor: tokens.colorNeutralBackground3,
    backgroundImage: `radial-gradient(${tokens.colorNeutralStroke2} 1px, transparent 1px)`,
    backgroundSize: '24px 24px',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  dragging: { cursor: 'grabbing' },
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' },
  card: {
    position: 'absolute',
    boxSizing: 'border-box',
    width: `${CARD_W}px`,
    height: `${CARD_H}px`,
    padding: tokens.spacingHorizontalM,
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4,
  },
  zoomInfo: { position: 'absolute', right: tokens.spacingHorizontalS, bottom: tokens.spacingVerticalS, pointerEvents: 'none' },
});

interface TopicCard { id: string; title: string; chapter: string; x: number; y: number }

export function CanvasScreen() {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const chapters = state.status === 'ready' ? state.pack.data.show?.chapters ?? [] : [];
  const cards = useMemo<TopicCard[]>(
    () => chapters.flatMap((c, ci) => (c.topics ?? []).map((t, ti) => ({ id: t.id, title: t.title, chapter: c.title, ...cardOrigin(ci, ti) }))),
    [chapters],
  );

  const surface = useRef<HTMLDivElement>(null);
  // 議題の格子の上に、中核オブジェクトを中央に置く（FR-018）。初期の視点は、それが見える位置から始める
  const columns = Math.max(1, ...chapters.map((c) => (c.topics ?? []).length));
  const coreX = (columns * (CARD_W + GAP_X) - GAP_X) / 2 - CARD_W / 2;
  const coreY = -(CARD_H + GAP_Y);
  const { selected: core } = useCoreObject();
  const [showReason, setShowReason] = useState(false);
  // 視点と選択は、ペルソナの切替などで画面が作り直されても保つ（NFR-UX-001）
  const [view, setViewState] = useRetainedState<Viewport>('canvas.view', { x: 40, y: 40 + CARD_H + GAP_Y, zoom: 1 });  const viewRef = useRef(view);
  const setView = useCallback((v: Viewport) => { viewRef.current = v; setViewState(v); }, [setViewState]);
  const [selected, setSelected] = useRetainedState<string | null>('canvas.selected', null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const size = () => {
    const r = surface.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  };

  // ホイールでズーム（ページのスクロールを止めるため passive にしない）
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView(zoomAt(viewRef.current, e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView, cards.length]);

  const goTo = useCallback((id: string) => {
    const c = cards.find((k) => k.id === id);
    if (!c) return;
    setSelected(id);
    const { w, h } = size();
    setView(centerOn(viewRef.current, c.x + CARD_W / 2, c.y + CARD_H / 2, w, h));
  }, [cards, setView, setSelected]);

  // プレゼンテーション中は、現在の議題の位置へ移動する（FR-016）
  const presenting = usePresentationStore((st) => currentTopic(st)?.id ?? null);
  useEffect(() => { if (presenting) goTo(presenting); }, [presenting, goTo]);

  useEffect(() => registerTestHook('canvas', {
    viewport: () => ({ ...viewRef.current }),
    isCentered: (id: string) => {
      const c = cards.find((k) => k.id === id);
      if (!c) return false;
      const { w, h } = size();
      return isCenteredOn(viewRef.current, c.x + CARD_W / 2, c.y + CARD_H / 2, w, h);
    },
  }), [cards]);

  // 議題の一覧は、このパネルが操作されるまで（フォーカスが入るまで）は開かない。経営層の既定では、キャンバスは背景の全体図として小さく残るだけなので、
  // ほかのパネルの選択肢（設定の業種プリセットなど）と一覧の項目が混ざらないようにする（§7）。一度開いたら開いたままにする。
  const [topicsActive, setTopicsActive] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = bodyRef.current?.closest('[data-testid="component-canvas"]');
    if (!section) return;
    const on = (e: Event) => { if (e.target instanceof Node && section.contains(e.target)) setTopicsActive(true); };
    document.addEventListener('focusin', on);
    if (section.contains(document.activeElement)) setTopicsActive(true);
    return () => document.removeEventListener('focusin', on);
  }, [cards.length]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setView(panBy(viewRef.current, e.clientX - d.x, e.clientY - d.y));
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const { w, h } = size();
    const next = keyViewport(viewRef.current, e.key, w, h);
    if (next) { e.preventDefault(); setView(next); }
  };

  return (
    <Panel testId="component-canvas" title="キャンバス" description="ドラッグで移動、ホイールまたは +/- で拡大縮小、矢印キーで移動できます。議題を選ぶとその位置へ移動します。">
      <div className={s.tools}>
        <Button
          aria-expanded={showReason}
          aria-controls="core-object-reason"
          onClick={() => setShowReason((v) => !v)}
        >
          選定理由
        </Button>
        <Text size={200}>中核オブジェクト: {core?.name ?? '未設定'}</Text>
      </div>
      <div id="core-object-reason">{showReason ? <CoreObjectPanel /> : null}</div>
      {cards.length === 0 ? (
        <EmptyView message="議題がありません。顧客パックの show.json に議題を追加してください。" />
      ) : (
        <div className={s.body} ref={bodyRef}>
          {topicsActive ? (
            <Listbox
              className={s.list}
              aria-label="議題"
              selectedOptions={selected ? [selected] : []}
            >
              {cards.map((c) => (
                <Option key={c.id} value={c.id} text={c.title} onClick={() => goTo(c.id)}>{c.title}</Option>
              ))}
            </Listbox>
          ) : (
            <Button className={s.list} onClick={() => setTopicsActive(true)}>議題の一覧を開く</Button>
          )}
          <div
            ref={surface}
            data-testid="canvas-surface"
            role="application"
            aria-label="キャンバス（矢印キーで移動、+/- で拡大縮小）"
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + -"
            tabIndex={0}
            className={dragging ? `${s.surface} ${s.dragging}` : s.surface}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          >
            <div className={s.world} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
              {core ? (
                <div
                  data-testid="core-object"
                  data-entity-id={core.id}
                  className={s.core}
                  style={{ left: coreX, top: coreY }}
                  role="group"
                  aria-label={`中核オブジェクト: ${core.name}`}
                >
                  <Text size={200}>中核オブジェクト</Text>
                  <Text weight="semibold" size={500}>{core.name}</Text>
                </div>
              ) : null}
              {cards.map((c) => (
                <div
                  key={c.id}
                  data-entity-id={c.id}
                  data-highlight={selected === c.id ? 'selected' : undefined}
                  className={s.card}
                  style={{ left: c.x, top: c.y, borderColor: selected === c.id ? tokens.colorBrandStroke1 : undefined }}
                >
                  <Text size={200}>{c.chapter}</Text>
                  <Text weight="semibold">{c.title}</Text>
                </div>
              ))}
            </div>
            <Text className={s.zoomInfo} size={200} aria-live="off">{Math.round(view.zoom * 100)}%</Text>
          </div>
        </div>
      )}
      <LensView />
    </Panel>
  );
}
