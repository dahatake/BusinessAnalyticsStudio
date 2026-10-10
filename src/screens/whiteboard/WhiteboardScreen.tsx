// ホワイトボード画面（無限キャンバスと複数ボード）。FR-086 / FR-088 / FR-097 / FR-098 / FR-099
// 議題（議論テーマ）ごとに複数のボードを持つ。背景（無地/方眼/ドット/罫線）・全体表示・拡大縮小・ミニマップ・インクの道具を備える。
// 付箋・コネクター・フレーム・グループ・整列（FR-097）、アプリのデータのカード（FR-098）、
// 付箋のクラスタリング・ドット投票・タイマー（FR-099）をこの画面が受け持つ。
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Dropdown, Field, Menu, MenuItem, MenuList,
  MenuPopover, MenuTrigger, Option, SpinButton, Tab, TabList, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Add20Regular, AlignTop20Regular, DocumentMarkdown20Regular, DocumentPdf20Regular, Frame20Regular, Group20Regular, GroupDismiss20Regular, Link20Regular, Sparkle20Regular,
  TaskListSquareLtr20Regular, Timer20Regular, VoteRegular, ZoomFit20Regular, ZoomIn20Regular, ZoomOut20Regular,
} from '@fluentui/react-icons';
import { useAi } from '../../ai/useAi';
import { Panel } from '../../components/Panel';
import { usePackTarget } from '../../discussion/usePackTarget';
import { BoardMarkdownDialog } from '../../export/BoardMarkdownDialog';
import { BoardPdfDialog } from '../../export/BoardPdfDialog';
import { usePane } from '../../workspace/PaneContext';
import { BoardSurface } from '../../ink/BoardSurface';
import { RECOGNIZED_LABEL, recognizeHandwriting } from '../../ink/handwriting';
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

const useStyles = makeStyles({
  controls: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  organize: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
  stage: { position: 'relative', height: 'clamp(420px, 62vh, 900px)', minHeight: 0 },
  recognized: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  recognizedItem: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  status: { height: '1.4em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  statusOverlay: {
    position: 'absolute', top: tokens.spacingVerticalXS, left: tokens.spacingHorizontalS, right: tokens.spacingHorizontalS, zIndex: 1,
    pointerEvents: 'none', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: tokens.colorNeutralForeground2,
  },
  clock: { fontVariantNumeric: 'tabular-nums', fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
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
  return (
    <span className={className} data-testid="timer-remaining" role="timer" aria-label="タイマーの残り時間">
      {formatClock(left)}
    </span>
  );
}

function TimerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useStyles();
  const t = useTimer();
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
        <Button icon={<Timer20Regular aria-hidden />}>タイマー</Button>
      </DialogTrigger>
      <DialogSurface aria-label="タイマー">
        <DialogBody>
          <DialogTitle>タイマー</DialogTitle>
          <DialogContent className={s.timerBody}>
            <TimerReadout className={s.clock} />
            {finished ? <Text role="status">時間になりました。</Text> : null}
            <Field label="長さ（分）">
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
            {running ? <Button appearance="primary" onClick={() => t.pause()}>一時停止</Button> : <Button appearance="primary" onClick={() => t.start()}>開始</Button>}
            <Button onClick={() => t.reset()}>リセット</Button>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">閉じる</Button>
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
  const recognized = useRecognized((st) => st.items);
  const timerEndsAt = useTimer((st) => st.endsAt);
  const timerPaused = useTimer((st) => st.pausedMs);
  const timerDuration = useTimer((st) => st.durationSec);

  // 議題が変わったら、その議題のボードに切り替える（なければ 1 枚作る）。描画の前に済ませる
  useLayoutEffect(() => { ensureTopicBoard(topicId); }, [topicId, ensureTopicBoard]);

  const mine = boards.filter((b) => b.kind === 'board' && b.topicId === topicId);
  const active = boards.find((b) => b.id === activeId && b.kind === 'board');
  const bg = BACKGROUNDS.find((b) => b.value === active?.background) ?? BACKGROUNDS[0]!;

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
    setStatus('手書きを認識しています…');
    try {
      const r = await recognizeHandwriting(selStrokes);
      if (!r) { setStatus('認識できる手書きがありません。'); return; }
      useRecognized.getState().add({ kind, text: r.text, boardId: active.id, strokeIds: selStrokes.map((k) => k.id), mock: r.mock });
      // 議論の記録（議題）があれば、そこにもラベルつきで書き足す
      if (target && topicId) {
        const store = useDiscussionStore.getState();
        const theme = store.byPack[target.key]?.themes.find((t) => t.id === topicId);
        const line = `${r.text}（${RECOGNIZED_LABEL}）`;
        if (theme && kind === 'decision') store.update(target.key, topicId, { decisions: theme.decisions.trim() === '' ? line : `${theme.decisions}\n${line}` });
        else if (theme) { const act = store.addAction(target.key, topicId); store.patchAction(target.key, topicId, act.id, { text: line }); }
      }
      setStatus(`${KIND_LABEL[kind]}に反映しました（${RECOGNIZED_LABEL}${r.mock ? '・モック' : ''}）。元の手書きはボードに残っています。`);
    } catch (err) {
      setStatus(err instanceof Error ? `手書きを認識できませんでした（${err.message}）` : '手書きを認識できませんでした。');
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
    setStatus('選んだものをフレームで囲みました。');
  };
  const groupIt = () => {
    if (!active) return;
    let done = false;
    useInk.getState().updateItems(active.id, (items) => { const r = groupSelection(items, selSet); if (!r) return items; done = true; return r.items; });
    setStatus(done ? '選んだものをグループにしました。グループは一緒に選び、一緒に動かせます。' : 'グループにするには、2 つ以上を選んでください。');
  };
  const ungroupIt = () => {
    if (!active) return;
    useInk.getState().updateItems(active.id, (items) => ungroupSelection(items, selSet));
    setStatus('グループを解除しました。');
  };
  const alignIt = (mode: AlignMode, label: string) => {
    if (!active) return;
    useInk.getState().updateItems(active.id, (items) => alignItems(items, selSet, mode));
    setStatus(`${label}にしました。`);
  };
  const connectIt = () => {
    if (!active || nodes.length !== 2) return;
    useInk.getState().updateItems(active.id, (items) => connect(items, nodes[0]!.id, nodes[1]!.id).items);
    setStatus('選んだ 2 つをコネクターでつなぎました。');
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
    if (stickies.length < 2) { setStatus('クラスタリングするには、付箋が 2 枚以上必要です。'); return; }
    const texts = stickies.map((i) => i.text ?? '');
    setBusy(true);
    setStatus('AI が付箋を分けています…');
    let clusters: Cluster[] | null = null;
    let mock = true;
    try {
      const res = await ai.ask('structure', clusterPrompt(texts));
      mock = res.mode === 'mock';
      if (!mock) clusters = parseClusterJson(res.answer, texts.length);
    } catch (err) {
      setStatus(err instanceof Error ? `AI を呼び出せなかったため、文字の重なりで分けます（${err.message}）` : 'AI を呼び出せなかったため、文字の重なりで分けます。');
    }
    const result = clusters ?? clusterTexts(texts);
    useInk.getState().updateItems(active.id, (items) => applyClusters(items, stickies.map((i) => i.id), result));
    // 並べ替えた結果が全部見えるように、全体表示にする
    useInk.getState().fitBoard(active.id);
    setBusy(false);
    setStatus(`付箋を ${result.length} つのグループに分けました（AI 生成${mock ? '・モック' : ''}）。「元に戻す」で取り消せます。`);
  };

  const toggleVote = () => {
    const next = !voteMode;
    useInk.getState().setVoteMode(next);
    setStatus(next ? 'ドット投票: 付箋をクリックすると 1 票入ります（Shift を押しながらで 1 票戻します）。' : 'ドット投票を終えました。');
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
      title="ホワイトボード"
      description={pane ? undefined : '議題ごとに複数のボードを持てる無限キャンバスです。ペンで描き、2 本指またはホイールでパン、Ctrl+ホイールで拡大縮小します。'}
      maxWidth="1280px"
    >
      <div className={s.controls}>
        <Button className={s.forcedAuto} appearance="primary" icon={<Add20Regular aria-hidden />} onClick={() => addBoard(topicId)}>ボードを追加</Button>
        <Field label="背景" size="small">
          <Dropdown
            style={{ minWidth: '112px', width: '112px' }}
            value={bg.label}
            selectedOptions={[bg.value]}
            onOptionSelect={(_, d) => { if (active && d.optionValue) setBackground(active.id, d.optionValue as Background); }}
          >
            {BACKGROUNDS.map((b) => <Option key={b.value} value={b.value}>{b.label}</Option>)}
          </Dropdown>
        </Field>
        <Button icon={<ZoomFit20Regular aria-hidden />} aria-label="全体表示" title="全体表示" onClick={() => active && fitBoard(active.id)} />
        <Button icon={<ZoomOut20Regular aria-hidden />} aria-label="縮小" onClick={() => zoomBy(1 / 1.25)} />
        <Button icon={<ZoomIn20Regular aria-hidden />} aria-label="拡大" onClick={() => zoomBy(1.25)} />
        <Button icon={<DocumentPdf20Regular aria-hidden />} disabled={!active} aria-label="PDF 出力" title="PDF 出力" onClick={() => setPdfOpen(true)} />
        <Button icon={<DocumentMarkdown20Regular aria-hidden />} disabled={!active} aria-label="Markdown 出力" title="Markdown 出力" onClick={() => setMdOpen(true)} />
      </div>
      <TabList
        size="small"
        aria-label="ボードの一覧"
        selectedValue={active?.id ?? ''}
        onTabSelect={(_, d) => setActive(String(d.value))}
      >
        {mine.map((b) => <Tab key={b.id} value={b.id}>{b.name}</Tab>)}
      </TabList>
      <div onKeyDown={onKeyDown} style={{ display: 'contents' }}>
        <div className={s.organize} role="group" aria-label="付箋の整理">
          <Button size="small" icon={<Frame20Regular aria-hidden />} disabled={framable === 0} onClick={frameIt}>フレームで囲む</Button>
          <Button size="small" icon={<Group20Regular aria-hidden />} disabled={groupable < 2} onClick={groupIt}>グループにする</Button>
          <Button size="small" icon={<GroupDismiss20Regular aria-hidden />} disabled={!grouped} onClick={ungroupIt}>グループを解除</Button>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button size="small" icon={<AlignTop20Regular aria-hidden />} disabled={alignable < 2}>整列</Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {ALIGN_MODES.map((m) => (
                  <MenuItem key={m.mode} disabled={(m.mode === 'hdistribute' || m.mode === 'vdistribute') && alignable < 3} onClick={() => alignIt(m.mode, m.label)}>{m.label}</MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Button size="small" icon={<Link20Regular aria-hidden />} disabled={nodes.length !== 2} onClick={connectIt}>つなぐ</Button>
          <Button size="small" icon={<Sparkle20Regular aria-hidden />} disabled={busy} onClick={() => { void runCluster(); }}>クラスタリング</Button>
          <Button size="small" icon={<Sparkle20Regular aria-hidden />} disabled={selStrokes.length === 0 || recBusy} onClick={() => { void reflect('decision'); }}>決定事項に反映</Button>
          <Button size="small" icon={<TaskListSquareLtr20Regular aria-hidden />} disabled={selStrokes.length === 0 || recBusy} onClick={() => { void reflect('action'); }}>次のアクションに反映</Button>
          <Button size="small" icon={<VoteRegular aria-hidden />} appearance={voteMode ? 'primary' : 'secondary'} className={s.forcedAuto} aria-pressed={voteMode} onClick={toggleVote}>ドット投票</Button>
          {voteMode && votes > 0 ? <Button size="small" onClick={() => { if (active) useInk.getState().updateItems(active.id, resetVotes); }}>票をリセット</Button> : null}
          <TimerDialog open={timerOpen} onOpenChange={setTimerOpen} />
          {!timerOpen && timerShown ? <TimerReadout /> : null}
        </div>
        {!active ? (
          <Text role="status" className={s.status} size={200}>
            {status}{connectFrom ? ' 接続元を選びました。つなぐ相手の項目をクリックしてください（Esc で取り消し）。' : ''}
            {voteMode ? ` 投票数: ${votes} 票` : ''}
          </Text>
        ) : null}
        {active && (
          <div className={s.stage}>
            {/* 状態の表示は描画面の上端に重ねる（場所を取らず、描画面をできるだけ上に置く。ショーコントロールバーに隠れにくくする） */}
            <Text role="status" className={s.statusOverlay} size={200}>
              {status}{connectFrom ? ' 接続元を選びました。つなぐ相手の項目をクリックしてください（Esc で取り消し）。' : ''}
              {voteMode ? ` 投票数: ${votes} 票` : ''}
            </Text>
            <BoardSurface key={active.id} boardId={active.id} ariaLabel={`${active.name}の描画面`} minimap onEntityDrop={onEntityDrop} onItemActivate={onItemActivate}>
              <ItemOverlay boardId={active.id} />
            </BoardSurface>
          </div>
        )}
        {(['decision', 'action'] as const).map((kind) => {
          const list = shownRecognized.filter((i) => i.kind === kind);
          if (list.length === 0) return null;
          return (
            <section key={kind} aria-label={`手書きから反映した${KIND_LABEL[kind]}`}>
              <Text as="h3" size={300} weight="semibold">手書きから反映した{KIND_LABEL[kind]}</Text>
              <ul className={s.recognized} data-testid={kind === 'decision' ? 'decisions' : 'next-actions'}>
                {list.map((i) => (
                  <li key={i.id} className={s.recognizedItem}>
                    <Text>{i.text}</Text>
                    <Badge appearance="tint" color="informative" size="small">{i.label}</Badge>
                    <Button size="small" appearance="subtle" onClick={() => useRecognized.getState().remove(i.id)}>一覧から外す</Button>
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
