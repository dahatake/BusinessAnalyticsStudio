// プレゼンテーション中の「番組」の表示（FR-077〜FR-079）。
// - 次のチャプターの予告カード（FR-077。進行バーは PresentationBar が持つ）
// - テロップ/ローワーサード: 該当する議題のときだけ、出典リンクを併記して出す。リンクで出典の詳細（出典カード）が開く（FR-078）
// - 議題の種類ごとの演出: Before/After スライダー・TOP5 ランキング・ROI 発表（紙吹雪は演出強度が Entertainment のときだけ。FR-079）
// 演出は、演出強度（FR-083）に応じて強さを変える。Executive は動きを足さない。停止中・動きを減らす設定では動かさない。
import { useEffect, useMemo, useState } from 'react';
import { Card, Link, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ArrowRight20Regular } from '@fluentui/react-icons';
import { SourceCard } from '../analysis/DetailPanel';
import { usePriority } from '../analysis/usePriority';
import { KpiValue } from '../components/Brand';
import { NumericValue } from '../components/NumericValue';
import { DURATION, EASING, scaledDuration } from '../motion/fluent';
import { useCountUp } from '../motion/CountUp';
import { useIntensity, useMotionProfile, usePlaying } from '../motion/useMotion';
import { usePackStore } from '../store/pack';
import { currentTopic, usePresentationStore } from '../store/presentation';
import {
  clampSlider, nextChapterOf, readBeforeAfter, readRoi, readTelop, showsConfetti, topFive, topicTypeOf, usesEnterMotion,
  type BeforeAfter, type RoiAnnouncement,
} from './model';

/** 紙吹雪を出している時間（ms） */
const CONFETTI_MS = 6_000;
const CONFETTI_PIECES = 36;

const useStyles = makeStyles({
  stage: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  next: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    alignSelf: 'flex-start',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  enter: {
    animationName: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
    animationFillMode: 'both',
  },
  heading: { margin: 0 },
  // Before/After
  ba: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, maxWidth: '960px' },
  baPanes: {
    position: 'relative',
    display: 'grid',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    minHeight: '120px',
  },
  baPane: {
    gridArea: '1 / 1',
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalL,
  },
  baBefore: { backgroundColor: tokens.colorNeutralBackground3 },
  baAfter: { backgroundColor: tokens.colorBrandBackground2 },
  baDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: tokens.strokeWidthThicker,
    backgroundColor: tokens.colorBrandStroke1,
    pointerEvents: 'none',
  },
  baRange: { width: '100%', height: '28px', accentColor: tokens.colorBrandBackground, cursor: 'pointer', margin: 0 },
  // TOP5
  top5: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, margin: 0, padding: 0, listStyleType: 'none', maxWidth: '720px' },
  top5Item: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  top5Rank: {
    minWidth: '2.5em',
    textAlign: 'center',
    fontWeight: tokens.fontWeightBold,
    color: tokens.colorBrandForeground1,
  },
  top5Title: { flexGrow: 1, overflowWrap: 'anywhere' },
  // ROI
  roi: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, alignItems: 'flex-start' },
  roiValue: { fontSize: '72px', lineHeight: 1.1, fontWeight: tokens.fontWeightBold, color: tokens.colorBrandForeground1 },
  // テロップ/ローワーサード
  telop: {
    position: 'fixed',
    left: tokens.spacingHorizontalXXL,
    bottom: tokens.spacingVerticalXXL,
    maxWidth: 'min(720px, calc(100vw - 48px))',
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    borderLeft: `${tokens.strokeWidthThickest} solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
  },
  telopConcise: { fontWeight: tokens.fontWeightSemibold },
  sources: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalM, alignItems: 'center' },
  sourceCard: {
    position: 'fixed',
    left: tokens.spacingHorizontalXXL,
    bottom: '120px',
    maxWidth: 'min(560px, calc(100vw - 48px))',
    zIndex: 31,
  },
  // 紙吹雪（Entertainment のときだけ）
  confetti: { position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 40 },
  piece: {
    position: 'absolute',
    top: '-24px',
    width: '10px',
    height: '16px',
    borderRadius: tokens.borderRadiusSmall,
    animationName: {
      from: { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      to: { transform: 'translateY(110vh) rotate(720deg)', opacity: 0.9 },
    },
    animationFillMode: 'both',
    animationTimingFunction: 'ease-in',
  },
});

const CONFETTI_COLORS = [
  tokens.colorPaletteRedBackground3, tokens.colorPaletteGreenBackground3, tokens.colorPaletteYellowBackground3,
  tokens.colorBrandBackground, tokens.colorPalettePurpleBackground2, tokens.colorPaletteBerryBackground2,
] as const;

/** 紙吹雪。ROI 発表の議題で、演出強度が Entertainment のときだけ置かれる。一定時間で消える */
function Confetti() {
  const s = useStyles();
  const playing = usePlaying();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setDone(true), CONFETTI_MS);
    return () => window.clearTimeout(id);
  }, []);
  if (done) return null;
  return (
    <div className={s.confetti} data-testid="confetti" aria-hidden>
      {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
        <span
          key={i}
          className={s.piece}
          style={{
            left: `${(i * 97) % 100}%`,
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDuration: `${playing ? 2400 + ((i * 53) % 1800) : 0}ms`,
            animationDelay: `${playing ? (i * 71) % 900 : 0}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Before/After スライダー。つまみより左が Before、右が After。キーボード（矢印）とポインター（クリック・ドラッグ）で動かせる */
function BeforeAfterView({ data }: { data: BeforeAfter }) {
  const s = useStyles();
  const [pos, setPos] = useState(50);
  return (
    <div className={s.ba} data-testid="before-after">
      <div className={s.baPanes}>
        <div className={mergeClasses(s.baPane, s.baBefore)}>
          <Text weight="semibold" size={400}>{data.before.label}</Text>
          <Text>{data.before.text}</Text>
        </div>
        <div className={mergeClasses(s.baPane, s.baAfter)} style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <Text weight="semibold" size={400}>{data.after.label}</Text>
          <Text>{data.after.text}</Text>
        </div>
        <div className={s.baDivider} style={{ left: `${pos}%` }} aria-hidden />
      </div>
      <input
        type="range"
        className={s.baRange}
        aria-label="Before/After スライダー"
        min={0}
        max={100}
        step={1}
        value={pos}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pos}
        aria-valuetext={`${data.before.label} ${pos}%・${data.after.label} ${100 - pos}%`}
        onChange={(e) => setPos(clampSlider(Number(e.target.value)))}
      />
    </div>
  );
}

/** TOP5 ランキング。優先順位分析のランキングの上位 5 件を、順位どおりに出す */
function Top5View({ animate }: { animate: boolean }) {
  const s = useStyles();
  const { ready, rows } = usePriority();
  const { tempo } = useMotionProfile();
  const top = useMemo(() => topFive(rows), [rows]);
  if (!ready) return null;
  if (top.length === 0) return <Text>ランキングの対象の課題がありません。</Text>;
  return (
    <ol className={s.top5} data-testid="top5-ranking" aria-label="優先順位 TOP5">
      {top.map((r, i) => (
        <li
          key={r.id}
          className={mergeClasses(s.top5Item, animate ? s.enter : undefined)}
          style={animate ? {
            animationDuration: `${scaledDuration(DURATION.slow * 2, tempo, true)}ms`,
            animationDelay: `${scaledDuration(DURATION.slower * (top.length - i), tempo, true)}ms`,
            animationTimingFunction: EASING.decelerateMid,
          } : undefined}
        >
          <span className={s.top5Rank}>{i + 1}位</span>
          <Text className={s.top5Title}>{r.title}</Text>
          <Text size={200}>スコア <KpiValue>{r.score.toFixed(1)}</KpiValue></Text>
        </li>
      ))}
    </ol>
  );
}

/** ROI 発表。数値はカウントアップし、出典を示す（FR-009）。紙吹雪は別（Confetti） */
function RoiView({ data }: { data: RoiAnnouncement }) {
  const s = useStyles();
  const v = useCountUp(data.value);
  const text = Number.isInteger(data.value) ? Math.round(v).toLocaleString('ja-JP') : v.toFixed(1);
  return (
    <div className={s.roi} data-testid="roi-announcement" role="group" aria-label="ROI 発表">
      <Text size={500} weight="semibold">{data.label}</Text>
      <Text className={s.roiValue}>
        <KpiValue><NumericValue sourceIds={data.sourceIds}>{text}</NumericValue></KpiValue>{data.unit}
      </Text>
      {data.caption ? <Text>{data.caption}</Text> : null}
    </div>
  );
}

/** テロップ/ローワーサード。本文に出典リンクを併記し、リンクを選ぶと出典カードが開く（Esc で閉じる） */
function TelopView({ text, sourceIds, topicId }: { text: string; sourceIds: readonly string[]; topicId: string }) {
  const s = useStyles();
  const { captionStyle } = useMotionProfile();
  const state = usePackStore((st) => st.state);
  const [openId, setOpenId] = useState<string | null>(null);
  const sources = state.status === 'ready' ? state.pack.data.sources.sources : [];
  const found = sourceIds.map((id) => sources.find((x) => x.id === id)).filter((x): x is (typeof sources)[number] => x !== undefined);
  const open = found.find((x) => x.id === openId);
  // 別の議題へ移ったら出典カードを閉じる
  useEffect(() => { setOpenId(null); }, [topicId]);
  useEffect(() => {
    if (!openId) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);
  return (
    <>
      {open ? <div className={s.sourceCard}><SourceCard source={open} onClose={() => setOpenId(null)} /></div> : null}
      <section className={s.telop} data-testid="telop" data-caption-style={captionStyle} aria-label="テロップ">
        <Text className={captionStyle === 'concise' ? s.telopConcise : undefined}>{text}</Text>
        <div className={s.sources}>
          <Text size={200}>出典:</Text>
          {found.length === 0 ? <Text size={200}>出典の情報がありません</Text> : found.map((src) => (
            <Link key={src.id} href={`#source-${src.id}`} onClick={(e) => { e.preventDefault(); setOpenId(src.id); }}>
              {src.title}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

/** プレゼンテーション中だけ表示する。現在の議題に合わせて、予告カード・テロップ・演出を出す */
export function ShowStage() {
  const s = useStyles();
  const st = usePresentationStore();
  const intensity = useIntensity();
  const playing = usePlaying();
  const { tempo } = useMotionProfile();
  const packState = usePackStore((p) => p.state);
  const cur = currentTopic(st);
  const topic = useMemo(() => {
    if (!cur || packState.status !== 'ready') return undefined;
    return packState.pack.data.show.chapters.flatMap((c) => c.topics).find((t) => t.id === cur.id);
  }, [cur, packState]);
  if (!st.active || !cur) return null;

  const next = nextChapterOf(st.topics, st.index);
  const type = topicTypeOf(topic);
  const telop = readTelop(topic);
  const animate = playing && usesEnterMotion(intensity);
  const enter = animate ? s.enter : undefined;
  const enterStyle = animate ? { animationDuration: `${scaledDuration(DURATION.slower, tempo, true)}ms`, animationTimingFunction: EASING.decelerateMid } : undefined;
  const ba = type === 'before-after' ? readBeforeAfter(topic) : null;
  const roi = type === 'roi' ? readRoi(topic) : null;

  const hasFlow = next !== null || ba !== null || type === 'ranking' || roi !== null;

  return (
    <>
      {hasFlow ? (
    <section className={s.stage} data-testid="show-stage" data-intensity={intensity} aria-label="番組の表示">
      {next ? (
        <Card className={s.next} size="small" data-testid="next-chapter-card" aria-label={`次のチャプター: ${next.chapterTitle}`}>
          <Text size={200}>次のチャプター</Text>
          <ArrowRight20Regular aria-hidden />
          <Text weight="semibold">{next.chapterTitle}</Text>
        </Card>
      ) : null}
      {ba || type === 'ranking' || roi ? (
        <div key={cur.id} className={enter} style={enterStyle}>
          <Text as="h2" size={500} weight="semibold" className={s.heading} block>{cur.title}</Text>
          {ba ? <BeforeAfterView data={ba} /> : null}
          {type === 'ranking' ? <Top5View animate={animate} /> : null}
          {roi ? <RoiView data={roi} /> : null}
        </div>
      ) : null}
    </section>
      ) : null}
      {telop ? <TelopView text={telop.text} sourceIds={telop.sourceIds} topicId={cur.id} /> : null}
      {showsConfetti(type, intensity) ? <Confetti key={cur.id} /> : null}
    </>
  );
}
