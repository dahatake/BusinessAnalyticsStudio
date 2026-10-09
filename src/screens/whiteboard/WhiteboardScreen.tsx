// ホワイトボード画面（無限キャンバスと複数ボード）。FR-086 / FR-088
// 議題（議論テーマ）ごとに複数のボードを持つ。背景（無地/方眼/ドット/罫線）・全体表示・拡大縮小・ミニマップ・インクの道具を備える。
// 付箋の整理・データのカード・タイマーなど（FR-097〜FR-099）は、この画面にほかの項目が足す。
import { useLayoutEffect } from 'react';
import { Button, Dropdown, Field, Option, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components';
import { Add20Regular, ZoomFit20Regular, ZoomIn20Regular, ZoomOut20Regular } from '@fluentui/react-icons';
import { Panel } from '../../components/Panel';
import { usePackTarget } from '../../discussion/usePackTarget';
import { BoardSurface } from '../../ink/BoardSurface';
import { InkToolbar } from '../../ink/InkToolbar';
import { BACKGROUNDS, type Background } from '../../ink/model';
import { useInk } from '../../ink/store';
import { zoomView } from '../../ink/viewport';
import { useDiscussionStore } from '../../store/discussion';

const useStyles = makeStyles({
  controls: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
  stage: { height: 'clamp(420px, 62vh, 900px)', minHeight: 0 },
});

export function WhiteboardScreen() {
  const s = useStyles();
  const target = usePackTarget();
  const topicId = useDiscussionStore((st) => (target ? (st.byPack[target.key]?.selectedId ?? null) : null));
  const boards = useInk((st) => st.boards);
  const activeId = useInk((st) => st.activeBoardId);
  const ensureTopicBoard = useInk((st) => st.ensureTopicBoard);
  const addBoard = useInk((st) => st.addBoard);
  const setActive = useInk((st) => st.setActiveBoard);
  const setBackground = useInk((st) => st.setBackground);
  const fitBoard = useInk((st) => st.fitBoard);
  const setView = useInk((st) => st.setView);

  // 議題が変わったら、その議題のボードに切り替える（なければ 1 枚作る）。描画の前に済ませる
  useLayoutEffect(() => { ensureTopicBoard(topicId); }, [topicId, ensureTopicBoard]);

  const mine = boards.filter((b) => b.kind === 'board' && b.topicId === topicId);
  const active = boards.find((b) => b.id === activeId && b.kind === 'board');
  const bg = BACKGROUNDS.find((b) => b.value === active?.background) ?? BACKGROUNDS[0]!;

  const zoomBy = (factor: number) => {
    if (!active) return;
    setView(active.id, zoomView(active.view, factor, active.size.w / 2, active.size.h / 2));
  };

  return (
    <Panel
      testId="component-whiteboard"
      title="ホワイトボード"
      description="議題ごとに複数のボードを持てる無限キャンバスです。ペンで描き、2 本指またはホイールでパン、Ctrl+ホイールで拡大縮小します。"
      maxWidth="1280px"
    >
      <div className={s.controls}>
        <Button className={s.forcedAuto} appearance="primary" icon={<Add20Regular aria-hidden />} onClick={() => addBoard(topicId)}>ボードを追加</Button>
        <Field label="背景" size="small">
          <Dropdown
            value={bg.label}
            selectedOptions={[bg.value]}
            onOptionSelect={(_, d) => { if (active && d.optionValue) setBackground(active.id, d.optionValue as Background); }}
          >
            {BACKGROUNDS.map((b) => <Option key={b.value} value={b.value}>{b.label}</Option>)}
          </Dropdown>
        </Field>
        <Button icon={<ZoomFit20Regular aria-hidden />} onClick={() => active && fitBoard(active.id)}>全体表示</Button>
        <Button icon={<ZoomOut20Regular aria-hidden />} aria-label="縮小" onClick={() => zoomBy(1 / 1.25)} />
        <Button icon={<ZoomIn20Regular aria-hidden />} aria-label="拡大" onClick={() => zoomBy(1.25)} />
      </div>
      <TabList
        size="small"
        aria-label="ボードの一覧"
        selectedValue={active?.id ?? ''}
        onTabSelect={(_, d) => setActive(String(d.value))}
      >
        {mine.map((b) => <Tab key={b.id} value={b.id}>{b.name}</Tab>)}
      </TabList>
      {active && <InkToolbar boardId={active.id} />}
      {active && (
        <div className={s.stage}>
          <BoardSurface key={active.id} boardId={active.id} ariaLabel={`${active.name}の描画面`} minimap />
        </div>
      )}
    </Panel>
  );
}
