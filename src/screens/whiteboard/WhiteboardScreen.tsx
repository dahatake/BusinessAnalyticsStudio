// ホワイトボード画面（無限キャンバスと複数ボード）。FR-086 / FR-088 / FR-097 / FR-098 / FR-099
// 論点（議論テーマ）ごとに複数のボードを持つ。背景（無地/方眼/ドット/罫線）・全体表示・拡大縮小・ミニマップ・インクの道具を備える。
// 付箋・コネクター・フレーム・グループ・整列（FR-097）、アプリのデータのカード（FR-098）、
// 付箋のクラスタリング・ドット投票・タイマー（FR-099）をこの画面が受け持つ。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Badge, Button, DialogActions, DialogBody, DialogContent, DialogTitle, DialogTrigger, Dropdown, Field, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Option, SpinButton, Tab, TabList, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../../components/Dialog';
import {
  Add20Regular, AlignTop20Regular, DocumentMarkdown20Regular, DocumentPdf20Regular, Frame20Regular, Group20Regular, GroupDismiss20Regular, Link20Regular, Sparkle20Regular,
  TaskListSquareLtr20Regular, Timer20Regular, Vote20Regular, ZoomFit20Regular, ZoomIn20Regular, ZoomOut20Regular,
} from '@fluentui/react-icons';
import { useAi } from '../../ai/useAi';
import { Panel } from '../../components/Panel';
import { usePackTarget } from '../../discussion/usePackTarget';
import { BoardMarkdownDialog } from '../../export/BoardMarkdownDialog';
import { BoardPdfDialog } from '../../export/BoardPdfDialog';
import { usePane } from '../../workspace/PaneContext';
import { BoardSurface } from '../../ink/BoardSurface';
import { RECOGNIZED_LABEL, recognizeHandwriting } from '../../ink/handwriting';
import { useVisionRecognizer } from '../../ink/useVisionRecognizer';
import { BACKGROUNDS, type Background, type BoardItem } from '../../ink/model';
import { KIND_LABEL, useRecognized, type RecognizedKind } from '../../ink/recognized';
import { useInk } from '../../ink/store';
import { zoomView } from '../../ink/viewport';
import { useDiscussionStore } from '../../store/discussion';
import { useSelectionStore } from '../../store/selection';
import { useCardEdit } from '../../whiteboard/cardEdit';
import { dropEntity } from '../../whiteboard/entityActions';
import { ItemOverlay } from '../../whiteboard/ItemOverlay';
import {
  ALIGN_MODES, alignItems, alignTargets, applyClusters, clusterPrompt, clusterTexts, connect, frameSelection, groupSelection, isNode,
  parseClusterJson, resetVotes, totalVotes, ungroupSelection, type AlignMode, type Cluster,
} from '../../whiteboard/ops';
import { MAX_TIMER_SEC, formatClock, isRunning, remainingMs, useTimer } from '../../whiteboard/timer';
import { tr, useT } from '../../i18n';

const useStyles = makeStyles({
  controls: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  organize: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
  stage: { position: 'relative', height: 'clamp(420px, 62vh, 900px)', minHeight: 0, flexShrink: 0 },
  recognized: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  recognizedItem: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  status: { height: '1.4em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  statusOverlay: {
    position: 'absolute', top: tokens.spacingVerticalXS, left: tokens.spacingHorizontalS, right: tokens.spacingHorizontalS, zIndex: 1,
    pointerEvents: 'none', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: tokens.colorNeutralForeground2,
  },
  clock: { fontVariantNumeric: 'tabular-nums', fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700, fontWeight: tokens.fontWeightSemibold },
  timerBody: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, alignItems: 'flex-start' },
});

/** 動いている間だけ、少しずつ現在時刻を進める（タイマーの表示用）。 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useLayoutEffect(() => {
    if (!active) { setNow(Date.now()); return; }
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

function TimerReadout({ className }: { className?: string }) {
  const endsAt = useTimer((s) => s.endsAt);
  const pausedMs = useTimer((s) => s.pausedMs);
  const running = endsAt !== null;
  const now = useNow(running);
  const left = remainingMs({ endsAt, pausedMs }, now);
  const tx = useT();
  return (
    <span className={className} data-testid="timer-remaining" role="timer" aria-label={tx('タイマーの残り時間')}>
      {formatClock(left)}
    </span>
  );
}

function TimerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useStyles();
  const t = useTimer();
  const tx = useT();
  const now = useNow(t.endsAt !== null);
  const running = isRunning(t, now);
  const finished = t.endsAt !== null && !running;
  // モーダルの間は、背景（アプリ本体）を支援技術から隠し、操作もできなくする
  useLayoutEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    if (!root) return;
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('inert', '');
    return () => { root.removeAttribute('aria-hidden'); root.removeAttribute('inert'); };
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button icon={<Timer20Regular aria-hidden />}>{tx('タイマー')}</Button>
      </DialogTrigger>
      <DialogSurface aria-label={tx('タイマー')}>
        <DialogBody>
          <DialogTitle>{tx('タイマー')}</DialogTitle>
          <DialogContent className={s.timerBody}>
            <TimerReadout className={s.clock} />
            {finished ? <Text role="status">{tx('時間になりました。')}</Text> : null}
            <Field label={tx('長さ（分）')}>
              <SpinButton
                min={1}
                max={Math.floor(MAX_TIMER_SEC / 60)}
                step={1}
                value={Math.round(t.durationSec / 60)}
                disabled={running}
                onChange={(_, d) => { const v = d.value ?? Number(d.displayValue); if (Number.isFinite(v) && v >= 1) t.setDuration(v * 60); }}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            {running ? <Button appearance="primary" onClick={() => t.pause()}>{tx('一時停止')}</Button> : <Button appearance="primary" onClick={() => t.start()}>{tx('開始')}</Button>}
            <Button onClick={() => t.reset()}>{tx('リセット')}</Button>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">{tx('閉じる')}</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function WhiteboardScreen() {
  const s = useStyles();
  const pane = usePane();
  const target = usePackTarget();
  const ai = useAi();
  const topicId = useDiscussionStore((st) => (target ? (st.byPack[target.key]?.selectedId ?? null) : null));
  const boards = useInk((st) => st.boards);
  const activeId = useInk((st) => st.activeBoardId);
  const selection = useInk((st) => st.selection);
  const voteMode = useInk((st) => st.voteMode);
  const connectFrom = useInk((st) => st.connectFrom);
  const ensureTopicBoard = useInk((st) => st.ensureTopicBoard);
  const addBoard = useInk((st) => st.addBoard);
  const setActive = useInk((st) => st.setActiveBoard);
  const setBackground = useInk((st) => st.setBackground);
  const fitBoard = useInk((st) => st.fitBoard);
  const setView = useInk((st) => st.setView);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [mdOpen, setMdOpen] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  useVisionRecognizer();
  const recognized = useRecognized((st) => st.items);
  const timerEndsAt = useTimer((st) => st.endsAt);
  const timerPaused = useTimer((st) => st.pausedMs);
  const timerDuration = useTimer((st) => st.durationSec);
  const tx = useT();
  const boardName = (name: string): string => { const m = /^ボード (\d+)$/.exec(name); return m ? tx('ボード {n}', { n: m[1]! }) : tx(name); };

  // 論点が変わったら、その論点のボードに切り替える（なければ 1 枚作る）。描画の前に済ませる
  useLayoutEffect(() => { ensureTopicBoard(topicId); }, [topicId, ensureTopicBoard]);

  const mine = boards.filter((b) => b.kind === 'board' && b.topicId === topicId);
  const active = boards.find((b) => b.id === activeId && b.kind === 'board');
  const bg = BACKGROUNDS.find((b) => b.value === active?.background) ?? BACKGROUNDS[0]!;
  // 開いたとき、描画面を見える位置まで送る（ペインが小さく、面が下に隠れても描ける。FR-088）
  const stageRef = useRef<HTMLDivElement>(null);
  const activeBoardId = active?.id;
  useEffect(() => {
    const go = () => stageRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    go();
    const t = window.setTimeout(go, 0);
    return () => window.clearTimeout(t);
  }, [activeBoardId]);
  const zoomBy = (factor: number) => {
    if (!active) return;
    setView(active.id, zoomView(active.view, factor, active.size.w / 2, active.size.h / 2));
  };

  // ---- 選択（この画面のボードのもの） ----
  const selIds = useMemo(() => (active && selection?.boardId === active.id ? selection.ids : []), [active, selection]);
  const selSet = useMemo(() => new Set(selIds), [selIds]);
  const selItems: BoardItem[] = useMemo(() => (active ? active.items.filter((i) => selSet.has(i.id)) : []), [active, selSet]);
  const framable = selItems.filter((i) => i.type !== 'connector' && i.type !== 'frame').length + (active ? active.strokes.filter((k) => selSet.has(k.id)).length : 0);
  const groupable = selItems.filter((i) => i.type !== 'connector').length;
  const grouped = selItems.some((i) => i.groupId);
  const alignable = active ? alignTargets(active.items, selSet).length : 0;
  const nodes = selItems.filter(isNode);
  const selStrokes = useMemo(() => (active ? active.strokes.filter((k) => selSet.has(k.id) && !k.temporary) : []), [active, selSet]);

  // ---- 手書き文字の認識（FR-090）。選んだ手書きを認識して、決定事項・次のアクションに反映する。元の手書きは残す ----
  const reflect = async (kind: RecognizedKind) => {
    if (!active || selStrokes.length === 0 || recBusy) return;
    setRecBusy(true);
    setStatus(tr('手書きを認識しています…'));
    try {
      const r = await recognizeHandwriting(selStrokes);
      if (!r) { setStatus(tr('認識できる手書きがありません。')); return; }
      useRecognized.getState().add({ kind, text: r.text, boardId: active.id, strokeIds: selStrokes.map((k) => k.id), mock: r.mock });
      // 議論の記録（論点）があれば、そこにもラベルつきで書き足す
      if (target && topicId) {
        const store = useDiscussionStore.getState();
        const theme = store.byPack[target.key]?.themes.find((t) => t.id === topicId);
        const line = `${r.text}（${RECOGNIZED_LABEL}）`;
        if (theme && kind === 'decision') store.update(target.key, topicId, { decisions: theme.decisions.trim() === '' ? line : `${theme.decisions}\n${line}` });
        else if (theme) { const act = store.addAction(target.key, topicId); store.patchAction(target.key, topicId, act.id, { text: line }); }
      }
      setStatus(tr('{kind}に反映しました（{label}{mock}）。元の手書きはボードに残っています。', { kind: tr(KIND_LABEL[kind]), label: tr(RECOGNIZED_LABEL), mock: r.mock ? tr('・モック') : '' }));
    } catch (err) {
      setStatus(err instanceof Error ? tr('手書きを認識できませんでした（{msg}）', { msg: err.message }) : tr('手書きを認識できませんでした。'));
    } finally {
      setRecBusy(false);
    }
  };
  const mineIds = new Set(mine.map((b) => b.id));
  const shownRecognized = recognized.filter((i) => mineIds.has(i.boardId));

  const frameIt = () => {
    if (!active || framable === 0) return;
    const ink = useInk.getState();
    const strokeBounds = active.strokes.filter((k) => selSet.has(k.id)).map((k) => k.bounds);
    let frameId: string | null = null;
    ink.updateItems(active.id, (items) => {
      const r = frameSelection(items, selSet, strokeBounds);
      if (!r) return items;
      frameId = r.frameId;
      return r.items;
    });
    if (frameId) ink.setSelection(active.id, [...selIds, frameId]);
    setStatus(tr('選んだものをフレームで囲みました。'));
  };
  const groupIt = () => {
    if (!active) return;
    let done = false;
    useInk.getState().updateItems(active.id, (items) => { const r = groupSelection(items, selSet); if (!r) return items; done = true; return r.items; });
    setStatus(done ? tr('選んだものをグループにしました。グループは一緒に選び、一緒に動かせます。') : tr('グループにするには、2 つ以上を選んでください。'));
  };
  const ungroupIt = () => {
    if (!active) return;
    useInk.getState().updateItems(active.id, (items) => ungroupSelection(items, selSet));
    setStatus(tr('グループを解除しました。'));
  };
  const alignIt = (mode: AlignMode, label: string) => {
    if (!active) return;
    useInk.getState().updateItems(active.id, (items) => alignItems(items, selSet, mode));
    setStatus(tr('{label}にしました。', { label }));
  };
  const connectIt = () => {
    if (!active || nodes.length !== 2) return;
    useInk.getState().updateItems(active.id, (items) => connect(items, nodes[0]!.id, nodes[1]!.id).items);
    setStatus(tr('選んだ 2 つをコネクターでつなぎました。'));
  };

  // Ctrl+A（⌘+A）: ボードのすべての項目を選ぶ（文字の入力欄の中では、ふつうの全選択）
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!active || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a' || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    useInk.getState().setSelection(active.id, [...active.strokes.map((k) => k.id), ...active.items.map((i) => i.id)]);
  };

  // ---- クラスタリング（FR-099。AI を通す。モックのときは文字の重なりで分ける） ----
  const runCluster = async () => {
    if (!active || busy) return;
    const chosen = selItems.filter((i) => i.type === 'sticky');
    const stickies = chosen.length >= 2 ? chosen : active.items.filter((i) => i.type === 'sticky');
    if (stickies.length < 2) { setStatus(tr('クラスタリングするには、付箋が 2 枚以上必要です。')); return; }
    const texts = stickies.map((i) => i.text ?? '');
    setBusy(true);
    setStatus(tr('AI が付箋を分けています…'));
    let clusters: Cluster[] | null = null;
    let mock = true;
    try {
      const res = await ai.ask('structure', clusterPrompt(texts));
      mock = res.mode === 'mock';
      if (!mock) clusters = parseClusterJson(res.answer, texts.length);
    } catch (err) {
      setStatus(err instanceof Error ? tr('AI を呼び出せなかったため、文字の重なりで分けます（{msg}）', { msg: err.message }) : tr('AI を呼び出せなかったため、文字の重なりで分けます。'));
    }
    const result = clusters ?? clusterTexts(texts);
    useInk.getState().updateItems(active.id, (items) => applyClusters(items, stickies.map((i) => i.id), result));
    // 並べ替えた結果が全部見えるように、全体表示にする
    useInk.getState().fitBoard(active.id);
    setBusy(false);
    setStatus(tr('付箋を {n} つのグループに分けました（AI 生成{mock}）。「元に戻す」で取り消せます。', { n: result.length, mock: mock ? tr('・モック') : '' }));
  };

  const toggleVote = () => {
    const next = !voteMode;
    useInk.getState().setVoteMode(next);
    setStatus(next ? tr('ドット投票: 付箋をクリックすると 1 票入ります（Shift を押しながらで 1 票戻します）。') : tr('ドット投票を終えました。'));
  };
  const votes = active ? totalVotes(active.items) : 0;

  const onItemActivate = useCallback((item: BoardItem, how: 'click' | 'dblclick') => {
    if (how === 'dblclick') useCardEdit.getState().request(item.id);
    else if (item.sourceEntityId) useSelectionStore.getState().select(item.sourceEntityId, { origin: 'whiteboard' });
  }, []);
  const onEntityDrop = useCallback((id: string, at: { x: number; y: number }) => { setStatus(dropEntity(id, at).message); }, []);

  const timerShown = timerEndsAt !== null || timerPaused !== timerDuration * 1000;

  return (
    <Panel
      testId="component-whiteboard"
      title={tx('ホワイトボード')}
      description={pane ? undefined : tx('論点ごとに複数のボードを持てる無限キャンバスです。ペンで描き、2 本指またはホイールでパン、Ctrl+ホイールで拡大縮小します。')}
      maxWidth="1280px"
    >
      <div className={s.controls}>
        <Button className={s.forcedAuto} appearance="primary" icon={<Add20Regular aria-hidden />} onClick={() => addBoard(topicId)}>{tx('ボードを追加')}</Button>
        <Field label={tx('背景')} size="small">
          <Dropdown
            style={{ minWidth: '112px', width: '112px' }}
            button={{ style: { minHeight: '24px' } }}
            value={tx(bg.label)}
            selectedOptions={[bg.value]}
            onOptionSelect={(_, d) => { if (active && d.optionValue) setBackground(active.id, d.optionValue as Background); }}
          >
            {BACKGROUNDS.map((b) => <Option key={b.value} value={b.value}>{tx(b.label)}</Option>)}
          </Dropdown>
        </Field>
        <Button icon={<ZoomFit20Regular aria-hidden />} aria-label={tx('全体表示')} title={tx('全体表示')} onClick={() => active && fitBoard(active.id)} />
        <Button icon={<ZoomOut20Regular aria-hidden />} aria-label={tx('縮小')} onClick={() => zoomBy(1 / 1.25)} />
        <Button icon={<ZoomIn20Regular aria-hidden />} aria-label={tx('拡大')} onClick={() => zoomBy(1.25)} />
        <Button icon={<DocumentPdf20Regular aria-hidden />} disabled={!active} aria-label={tx('PDF 出力')} title={tx('PDF 出力')} onClick={() => setPdfOpen(true)} />
        <Button icon={<DocumentMarkdown20Regular aria-hidden />} disabled={!active} aria-label={tx('Markdown 出力')} title={tx('Markdown 出力')} onClick={() => setMdOpen(true)} />
      </div>
      <TabList
        size="small"
        aria-label={tx('ボードの一覧')}
        selectedValue={active?.id ?? ''}
        onTabSelect={(_, d) => setActive(String(d.value))}
      >
        {mine.map((b) => <Tab key={b.id} value={b.id}>{boardName(b.name)}</Tab>)}
      </TabList>
      <div onKeyDown={onKeyDown} style={{ display: 'contents' }}>
        <div className={s.organize} role="group" aria-label={tx('付箋の整理')}>
          <Button size="small" icon={<Frame20Regular aria-hidden />} disabled={framable === 0} onClick={frameIt}>{tx('フレームで囲む')}</Button>
          <Button size="small" icon={<Group20Regular aria-hidden />} disabled={groupable < 2} onClick={groupIt}>{tx('グループにする')}</Button>
          <Button size="small" icon={<GroupDismiss20Regular aria-hidden />} disabled={!grouped} onClick={ungroupIt}>{tx('グループを解除')}</Button>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button size="small" icon={<AlignTop20Regular aria-hidden />} disabled={alignable < 2}>{tx('整列')}</Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {ALIGN_MODES.map((m) => (
                  <MenuItem key={m.mode} disabled={(m.mode === 'hdistribute' || m.mode === 'vdistribute') && alignable < 3} onClick={() => alignIt(m.mode, m.label)}>{m.label}</MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Button size="small" icon={<Link20Regular aria-hidden />} disabled={nodes.length !== 2} onClick={connectIt}>{tx('つなぐ')}</Button>
          <Button size="small" icon={<Sparkle20Regular aria-hidden />} disabled={busy} onClick={() => { void runCluster(); }}>{tx('クラスタリング')}</Button>
          <Button size="small" icon={<Sparkle20Regular aria-hidden />} disabled={selStrokes.length === 0 || recBusy} onClick={() => { void reflect('decision'); }}>{tx('決定事項に反映')}</Button>
          <Button size="small" icon={<TaskListSquareLtr20Regular aria-hidden />} disabled={selStrokes.length === 0 || recBusy} onClick={() => { void reflect('action'); }}>{tx('次のアクションに反映')}</Button>
          <Button size="small" icon={<Vote20Regular aria-hidden />} appearance={voteMode ? 'primary' : 'secondary'} className={s.forcedAuto} aria-pressed={voteMode} onClick={toggleVote}>{tx('ドット投票')}</Button>
          {voteMode && votes > 0 ? <Button size="small" onClick={() => { if (active) useInk.getState().updateItems(active.id, resetVotes); }}>{tx('票をリセット')}</Button> : null}
          <TimerDialog open={timerOpen} onOpenChange={setTimerOpen} />
          {!timerOpen && timerShown ? <TimerReadout /> : null}
        </div>
        {!active ? (
          <Text role="status" className={s.status} size={200}>
            {status}{connectFrom ? tx(' 接続元を選びました。つなぐ相手の項目をクリックしてください（Esc で取り消し）。') : ''}
            {voteMode ? tx(' 投票数: {n} 票', { n: votes }) : ''}
          </Text>
        ) : null}
        {active && (
          <div ref={stageRef} className={s.stage}>
            {/* 状態の表示は描画面の上端に重ねる（場所を取らず、描画面をできるだけ上に置く。ショーコントロールバーに隠れにくくする） */}
            <Text role="status" className={s.statusOverlay} size={200}>
              {status}{connectFrom ? tx(' 接続元を選びました。つなぐ相手の項目をクリックしてください（Esc で取り消し）。') : ''}
              {voteMode ? tx(' 投票数: {n} 票', { n: votes }) : ''}
            </Text>
            <BoardSurface key={active.id} boardId={active.id} ariaLabel={tx('{name}の描画面', { name: boardName(active.name) })} minimap onEntityDrop={onEntityDrop} onItemActivate={onItemActivate}>
              <ItemOverlay boardId={active.id} />
            </BoardSurface>
          </div>
        )}
        {(['decision', 'action'] as const).map((kind) => {
          const list = shownRecognized.filter((i) => i.kind === kind);
          if (list.length === 0) return null;
          return (
            <section key={kind} aria-label={tx('手書きから反映した{kind}', { kind: tx(KIND_LABEL[kind]) })}>
              <Text as="h3" size={300} weight="semibold">{tx('手書きから反映した{kind}', { kind: tx(KIND_LABEL[kind]) })}</Text>
              <ul className={s.recognized} data-testid={kind === 'decision' ? 'decisions' : 'next-actions'}>
                {list.map((i) => (
                  <li key={i.id} className={s.recognizedItem}>
                    <Text>{i.text}</Text>
                    <Badge appearance="tint" color="informative" size="medium">{tx(i.label)}</Badge>
                    <Button size="small" appearance="subtle" onClick={() => useRecognized.getState().remove(i.id)}>{tx('一覧から外す')}</Button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {active && <BoardPdfDialog boardId={active.id} open={pdfOpen} onOpenChange={setPdfOpen} onResult={setStatus} />}
        {active && <BoardMarkdownDialog boardId={active.id} open={mdOpen} onOpenChange={setMdOpen} onResult={setStatus} />}
      </div>
    </Panel>
  );
}
