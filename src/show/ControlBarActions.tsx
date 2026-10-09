// ショーコントロールバーの操作（FR-084）と、プレゼンタービュー・レーザーポインター・全画面（`F`）。
// バー（src/show/ShowControlBar.tsx）の中身として置く。コマンドパレットとショートカット一覧にも同じ操作を載せる（FR-085）。
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import {
  ArrowMaximize20Regular, ArrowMinimize20Regular, Cube20Regular, CursorHover20Regular, MoviesAndTv20Regular,
  Pause20Regular, Play20Regular, Sparkle20Regular, WeatherMoon20Regular, WeatherSunny20Regular, Presenter20Regular,
} from '@fluentui/react-icons';
import { registerCommands } from '../commands/registry';
import { isShortcutTarget } from '../motion/control';
import { useIntensity } from '../motion/useMotion';
import { useAnimation } from '../store/animation';
import { useOpening } from '../store/opening';
import { usePackStore } from '../store/pack';
import { currentTopic, usePresentationStore } from '../store/presentation';
import { useSettings } from '../store/settings';
import { useShowUi } from '../store/show';
import { useView3D } from '../store/view3d';
import { QUALITIES } from '../three/quality';
import { cycleIntensity } from './IntensityIndicator';
import { readNarration } from './extras';

/** 全画面の表示を切り替える（対応していない環境では何もしない） */
export function toggleFullscreen(): void {
  const doc = document;
  if (doc.fullscreenElement) { void doc.exitFullscreen?.(); return; }
  void doc.documentElement.requestFullscreen?.().catch(() => undefined);
}

function useFullscreen(): boolean {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && document.fullscreenElement !== null);
  useEffect(() => {
    const h = () => setOn(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  return on;
}

/** Light と Dark を切り替える。「システムに合わせる」のときは、いま表示している側の反対にする */
export function toggleTheme(): void {
  const st = useSettings.getState();
  const dark = st.themeMode === 'dark' || (st.themeMode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  st.setThemeMode(dark ? 'light' : 'dark');
}

function useIsDark(): boolean {
  const mode = useSettings((s) => s.themeMode);
  const [osDark, setOsDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!m) return undefined;
    const h = () => setOsDark(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return mode === 'dark' || (mode === 'system' && osDark);
}

/** 3D の品質を 1 段進める（Low → Medium → High → Ultra → Low） */
export function cycleQuality(): void {
  const st = useView3D.getState();
  st.setQuality(QUALITIES[(QUALITIES.indexOf(st.quality) + 1) % QUALITIES.length]!);
}

/** バーの 9 種類の操作のうち、ミュート/音量（AudioControls）以外の 8 つ。ボタンは文字なしでも、名前（aria-label）と title を持つ */
export function ShowControlActions() {
  const playing = useAnimation((s) => s.playing);
  const toggleAnimation = useAnimation((s) => s.toggle);
  const intensity = useIntensity();
  const quality = useView3D((s) => s.quality);
  const dark = useIsDark();
  const fullscreen = useFullscreen();
  const presenterView = useShowUi((s) => s.presenterView);
  const setPresenterView = useShowUi((s) => s.setPresenterView);
  const laser = useShowUi((s) => s.laser);
  const setLaser = useShowUi((s) => s.setLaser);
  const replay = useOpening((s) => s.replay);
  const btn = (label: string, icon: ReactElement, onClick: () => void, extra?: { pressed?: boolean; title?: string }) => (
    <Button
      size="small"
      appearance="subtle"
      icon={icon}
      aria-label={label}
      aria-pressed={extra?.pressed}
      title={extra?.title ?? label}
      onClick={onClick}
    />
  );
  return (
    <>
      {btn(playing ? 'アニメーションを停止' : 'アニメーションを再生', playing ? <Pause20Regular aria-hidden /> : <Play20Regular aria-hidden />, toggleAnimation, { title: 'アニメーションの再生／停止（P キー）' })}
      {btn(`演出強度: ${intensity}`, <Sparkle20Regular aria-hidden />, () => cycleIntensity(intensity), { title: `演出強度の切替（E キー）: ${intensity}` })}
      {btn(`3D 品質: ${quality}`, <Cube20Regular aria-hidden />, cycleQuality, { title: `3D の品質の切替: ${quality}` })}
      {btn(dark ? 'テーマ: Dark（Light に切替）' : 'テーマ: Light（Dark に切替）', dark ? <WeatherMoon20Regular aria-hidden /> : <WeatherSunny20Regular aria-hidden />, toggleTheme)}
      {btn(fullscreen ? '全画面を終了' : '全画面', fullscreen ? <ArrowMinimize20Regular aria-hidden /> : <ArrowMaximize20Regular aria-hidden />, toggleFullscreen, { title: '全画面の切替（F キー）' })}
      {btn('プレゼンタービュー', <Presenter20Regular aria-hidden />, () => setPresenterView(!presenterView), { pressed: presenterView })}
      {btn('レーザーポインター', <CursorHover20Regular aria-hidden />, () => setLaser(!laser), { pressed: laser })}
      {btn('オープニングを再生', <MoviesAndTv20Regular aria-hidden />, replay)}
    </>
  );
}

const useStyles = makeStyles({
  presenter: {
    position: 'fixed',
    left: tokens.spacingHorizontalL,
    top: '110px',
    zIndex: 25,
    width: 'min(360px, calc(100vw - 32px))',
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16,
  },
  laser: {
    position: 'fixed',
    left: 0,
    top: 0,
    width: '20px',
    height: '20px',
    marginLeft: '-10px',
    marginTop: '-10px',
    borderRadius: '50%',
    backgroundColor: '#ff1744',
    boxShadow: '0 0 12px 6px rgba(255, 23, 68, 0.6)',
    pointerEvents: 'none',
    zIndex: 100,
  },
});

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** プレゼンタービュー: 発表者向けに、いまの議題・次の議題・台本のメモ・経過時間を出す */
export function PresenterView() {
  const s = useStyles();
  const on = useShowUi((st) => st.presenterView);
  const close = useShowUi((st) => st.setPresenterView);
  const pres = usePresentationStore();
  const state = usePackStore((p) => p.state);
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    setSec(0);
    const id = window.setInterval(() => setSec((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  if (!on) return null;
  const cur = currentTopic(pres);
  const next = pres.active ? pres.topics[pres.index + 1] : undefined;
  const topic = cur && state.status === 'ready' ? state.pack.data.show.chapters.flatMap((c) => c.topics).find((t) => t.id === cur.id) : undefined;
  const notes = readNarration(topic);
  return (
    <section className={s.presenter} data-testid="presenter-view" aria-label="プレゼンタービュー">
      <Text weight="semibold">プレゼンタービュー</Text>
      {cur ? (
        <>
          <Text size={200}>{cur.chapterTitle} ・ 議題 {pres.index + 1} / {pres.topics.length}</Text>
          <Text data-testid="presenter-current">いま: {cur.title}</Text>
          <Text data-testid="presenter-next">次: {next ? next.title : 'なし（最後の議題）'}</Text>
          {notes ? <Text size={200} data-testid="presenter-notes">台本: {notes}</Text> : null}
        </>
      ) : <Text size={200}>プレゼンテーションを開始すると、いまの議題・次の議題・台本のメモが出ます。</Text>}
      <Text size={200} data-testid="presenter-elapsed">経過時間: {formatElapsed(sec)}</Text>
      <div><Button size="small" onClick={() => close(false)}>プレゼンタービューを閉じる</Button></div>
    </section>
  );
}

/** レーザーポインター: 有効な間、ポインターの位置に赤い点を出す */
export function LaserPointer() {
  const s = useStyles();
  const on = useShowUi((st) => st.laser);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!on) { setPos(null); return undefined; }
    const h = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', h, true);
    return () => window.removeEventListener('pointermove', h, true);
  }, [on]);
  if (!on || !pos) return null;
  return <div className={s.laser} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} data-testid="laser-pointer" aria-hidden />;
}

/** `F` で全画面。コマンドパレット・ショートカット一覧にも載せる。アプリで 1 回だけ置く */
export function ShowShortcuts() {
  const intensity = useIntensity();
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.shiftKey || e.key.toLowerCase() !== 'f' || !isShortcutTarget(e)) return;
      toggleFullscreen();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => registerCommands(() => {
    const ui = useShowUi.getState();
    return [
      { id: 'show.fullscreen', label: '全画面を切り替える', keywords: ['全画面', 'フルスクリーン', 'fullscreen'], shortcut: 'F', run: toggleFullscreen },
      { id: 'show.intensity', label: '演出強度を切り替える', keywords: ['演出', '強度', 'intensity', 'Executive', 'Showcase', 'Entertainment'], shortcut: 'E', run: () => cycleIntensity(intensityRef.current) },
      { id: 'show.theme', label: 'Light と Dark を切り替える', keywords: ['テーマ', 'ダーク', 'ライト', 'theme'], run: toggleTheme },
      { id: 'show.quality', label: '3D の品質を切り替える', keywords: ['品質', '3D', 'quality'], run: cycleQuality },
      { id: 'show.presenter', label: 'プレゼンタービューを切り替える', keywords: ['発表者', 'プレゼンタービュー', 'presenter'], run: () => ui.setPresenterView(!useShowUi.getState().presenterView) },
      { id: 'show.laser', label: 'レーザーポインターを切り替える', keywords: ['レーザー', 'ポインター', 'laser'], run: () => ui.setLaser(!useShowUi.getState().laser) },
      { id: 'show.opening', label: 'オープニングを再生する', keywords: ['オープニング', 'opening'], run: () => useOpening.getState().replay() },
      { id: 'show.short-video', label: 'ショート動画を書き出す', keywords: ['ショート動画', '動画', 'webm', 'video'], run: () => ui.setShortVideoOpen(true) },
    ];
  }), []);
  return null;
}
