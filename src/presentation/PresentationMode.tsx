// プレゼンテーションモードの操作と進行バー（FR-016）。
// - 開始/終了のボタン（ヘッダー）。`internal` の項目を含むパックでは、開始の前に件数と確認の画面を出す（NFR-SEC-003）
// - 進行バー: チャプターを順に並べ、現在のチャプターを文字（「現在」）でも示す。現在の議題と、前/次のボタン
// - `←`/`→` で前/次の議題へ。キャンバスにフォーカスがあっても、パンではなく議題の移動にする（`↑`/`↓`・`Shift`+矢印はパンのまま）
import { useEffect, useMemo, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Text, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { ChevronLeft20Regular, ChevronRight20Regular, Play20Regular, Stop20Regular } from '@fluentui/react-icons';
import { countInternal } from '../schema';
import { usePackStore } from '../store/pack';
import { currentTopic, usePresentationStore } from '../store/presentation';
import { flattenTopics, presentationKeyAction, type PresentationTopic } from './model';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  chapters: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXS, rowGap: tokens.spacingVerticalXS, listStyleType: 'none', margin: 0, padding: 0 },
  chapter: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
  },
  chapterDone: { color: tokens.colorNeutralForeground3 },
  chapterCurrent: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  now: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  topic: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, marginLeft: 'auto', minWidth: 0 },
  topicTitle: { overflowWrap: 'anywhere' },
});

/** 顧客パックの show.json から、プレゼンテーションで巡る議題の一覧を作る（パックが読めていなければ空）。 */
function usePackTopics(): PresentationTopic[] {
  const state = usePackStore((s) => s.state);
  return state.status === 'ready' ? flattenTopics(state.pack.data.show?.chapters ?? []) : [];
}

/** 顧客パックの中の、機密区分が `internal` の項目の件数（パックが読めていなければ 0）。 */
function useInternalCount(): number {
  const state = usePackStore((s) => s.state);
  return useMemo(() => (state.status === 'ready' ? countInternal(state.pack.data) : 0), [state]);
}

/** ヘッダーの開始/終了ボタン。`internal` の項目を含むパックでは、開始の前に機密の確認（件数と確認の画面）を行う（NFR-SEC-003）。 */
export function PresentationButton() {
  const topics = usePackTopics();
  const internalCount = useInternalCount();
  const active = usePresentationStore((s) => s.active);
  const start = usePresentationStore((s) => s.start);
  const end = usePresentationStore((s) => s.end);
  const [confirming, setConfirming] = useState(false);
  if (active) return <Button icon={<Stop20Regular aria-hidden />} onClick={end}>プレゼンテーションを終了</Button>;
  return (
    <>
      <Button
        icon={<Play20Regular aria-hidden />}
        disabled={topics.length === 0}
        onClick={() => (internalCount > 0 ? setConfirming(true) : start(topics))}
      >
        プレゼンテーションを開始
      </Button>
      <Dialog open={confirming} modalType="alert" onOpenChange={(_, d) => setConfirming(d.open)}>
        <DialogSurface aria-label="機密情報の確認">
          <DialogBody>
            <DialogTitle>機密情報の確認</DialogTitle>
            <DialogContent>
              <Text as="p" block data-testid="confidential-count">
                このデータには、機密区分が「社内向け（internal）」の項目が {internalCount} 件含まれています。
              </Text>
              <Text as="p" block>顧客に見せてよい内容かを確認してから、プレゼンテーションを開始してください。</Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>キャンセル</Button>
              <Button
                appearance="primary"
                onClick={() => { setConfirming(false); start(topics); }}
              >
                確認して開始
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

/** プレゼンテーション中だけ、`←`/`→` を議題の移動として受ける（キャンバスなどより先に捕まえる）。 */
function usePresentationKeys(): void {
  const active = usePresentationStore((s) => s.active);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const action = presentationKeyAction(e, el ? { tagName: el.tagName, role: el.getAttribute('role'), isContentEditable: el.isContentEditable } : null);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation(); // フォーカス中のキャンバスのパンへ渡さない
      const st = usePresentationStore.getState();
      if (action === 'next') st.next(); else st.prev();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
}

/** 進行バー。プレゼンテーション中だけ表示する。 */
export function PresentationBar() {
  const s = useStyles();
  usePresentationKeys();
  const st = usePresentationStore();
  const cur = currentTopic(st);
  if (!st.active || !cur) return null;
  const chapters = [...new Map(st.topics.map((t) => [t.chapterId, t] as const)).values()];
  return (
    <section className={s.bar} data-testid="progress-bar" aria-label="プレゼンテーションの進行">
      <ol className={s.chapters}>
        {chapters.map((c) => {
          const isCur = c.chapterId === cur.chapterId;
          return (
            <li
              key={c.chapterId}
              data-testid="chapter"
              aria-current={isCur ? 'step' : undefined}
              className={mergeClasses(s.chapter, isCur && s.chapterCurrent, c.chapterIndex < cur.chapterIndex && s.chapterDone)}
            >
              <span>{c.chapterTitle}</span>
              {isCur ? <span className={s.now}>（現在）</span> : null}
            </li>
          );
        })}
      </ol>
      <div className={s.topic}>
        <Button size="small" icon={<ChevronLeft20Regular aria-hidden />} aria-label="前の議題" disabled={st.index === 0} onClick={st.prev} />
        <Text size={200}>議題 {st.index + 1} / {st.topics.length}</Text>
        <Text weight="semibold" className={s.topicTitle} data-testid="current-topic" role="status" aria-live="polite">{cur.title}</Text>
        <Button size="small" icon={<ChevronRight20Regular aria-hidden />} aria-label="次の議題" disabled={st.index >= st.topics.length - 1} onClick={st.next} />
      </div>
    </section>
  );
}
