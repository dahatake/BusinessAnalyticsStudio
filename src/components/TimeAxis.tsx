// 時間軸（FR-021）。0〜23 時のスライダー。キーボードで操作できる（← → で 1 時間、PageUp/PageDown で 6 時間、Home/End で 0 時/23 時）。
// 値は共通のストア（src/store/timeline.ts）。地図の流れなど、時刻で表示が変わるビューが読む。
// 「自動」を入れると、アニメーションの再生中だけ 1 秒に 1 時間ずつ進む。停止中は進まない（FR-071）。
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Pause16Regular, Play16Regular } from '@fluentui/react-icons';
import { HOURS } from '../map/flows';
import { useAnimation } from '../store/animation';
import { formatHour, useTimeline } from '../store/timeline';
import { useT } from '../i18n';

const useStyles = makeStyles({
  root: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, minWidth: 0, maxWidth: '100%' },
  label: { whiteSpace: 'nowrap' },
  track: {
    position: 'relative',
    width: 'clamp(96px, 20vw, 144px)',
    height: '24px', // 操作できる大きさ（WCAG 2.5.8）
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    touchAction: 'none',
    borderRadius: tokens.borderRadiusMedium,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
  },
  rail: { position: 'absolute', left: 0, right: 0, height: '4px', borderRadius: tokens.borderRadiusCircular, backgroundColor: tokens.colorNeutralStroke1 },
  fill: { position: 'absolute', left: 0, height: '4px', borderRadius: tokens.borderRadiusCircular, backgroundColor: tokens.colorBrandBackground },
  thumb: {
    position: 'absolute',
    width: '16px',
    height: '16px',
    marginLeft: `calc(-1 * ${tokens.spacingHorizontalS})`,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralBackground1}`,
    boxShadow: tokens.shadow4,
  },
  time: { minWidth: '3.2em', textAlign: 'right' },
});

export function TimeAxis() {
  const s = useStyles();
  const tt = useT();
  const hour = useTimeline((t) => t.hour);
  const auto = useTimeline((t) => t.auto);
  const setHour = useTimeline((t) => t.setHour);
  const step = useTimeline((t) => t.step);
  const setAuto = useTimeline((t) => t.setAuto);
  const playing = useAnimation((a) => a.playing);
  const track = useRef<HTMLDivElement>(null);

  // 自動: アニメーションの再生中だけ進める
  useEffect(() => {
    if (!auto || !playing) return;
    const id = window.setInterval(() => step(1), 1000);
    return () => window.clearInterval(id);
  }, [auto, playing, step]);

  const fromPointer = (e: PointerEvent<HTMLDivElement>): void => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    setHour(((e.clientX - r.left) / r.width) * (HOURS - 1));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const move: Record<string, () => void> = {
      ArrowRight: () => setHour(Math.min(HOURS - 1, hour + 1)),
      ArrowUp: () => setHour(Math.min(HOURS - 1, hour + 1)),
      ArrowLeft: () => setHour(Math.max(0, hour - 1)),
      ArrowDown: () => setHour(Math.max(0, hour - 1)),
      PageUp: () => setHour(Math.min(HOURS - 1, hour + 6)),
      PageDown: () => setHour(Math.max(0, hour - 6)),
      Home: () => setHour(0),
      End: () => setHour(HOURS - 1),
    };
    const f = move[e.key];
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    f();
  };
  const pct = (hour / (HOURS - 1)) * 100;

  return (
    <div className={s.root} data-testid="time-axis">
      <Text size={200} className={s.label}>{tt('時間軸')}</Text>
      <div
        ref={track}
        className={s.track}
        role="slider"
        tabIndex={0}
        aria-label={tt('時間軸')}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={HOURS - 1}
        aria-valuenow={hour}
        aria-valuetext={formatHour(hour)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) fromPointer(e); }}
      >
        <div className={s.rail} />
        <div className={s.fill} style={{ width: `${pct}%` }} />
        <div className={s.thumb} style={{ left: `${pct}%` }} />
      </div>
      <Text size={200} weight="semibold" className={s.time} data-testid="time-axis-value">{formatHour(hour)}</Text>
      <Button
        size="small"
        appearance="subtle"
        icon={auto ? <Pause16Regular aria-hidden /> : <Play16Regular aria-hidden />}
        aria-pressed={auto}
        aria-label={tt('時間軸を自動で進める')}
        title={playing ? tt('時間軸を自動で進める') : tt('自動で進めるのは、アニメーションの再生中だけです')}
        onClick={() => setAuto(!auto)}
      />
    </div>
  );
}
