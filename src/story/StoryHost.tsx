// ペルソナ別ストーリー（FR-177〜FR-179）。ペルソナを選ぶと、顧客パックと Project のデータだけから、フルスクリーンの 1 画面 1 メッセージのシーンを作って順に見せる。
// 操作: `→`/`←` 次/前、`Home` 先頭、`Space` 自動再生の一時停止・再開、`F` フルスクリーンの開始・終了、`Esc` でフルスクリーンを抜け、もう一度で終了。画面のボタンでも同じことができる。
// 動き: OS の「視差効果を減らす」・アプリのアニメーション停止（FR-071・FR-072）のときは、動きなしで即座に切り替わる。端末内だけで動き、外部には接続しない。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, FluentProvider, Text, makeStyles, mergeClasses, tokens, webDarkTheme,
} from '@fluentui/react-components';
import {
  ArrowPrevious20Regular, ArrowNext20Regular, ArrowReset20Regular, FullScreenMaximize20Regular, Play20Regular, Pause20Regular, Dismiss20Regular,
} from '@fluentui/react-icons';
import { usePackStore } from '../store/pack';
import { usePriorityStore } from '../store/priority';
import { useProjects } from '../store/projects';
import { usePresentationStore } from '../store/presentation';
import { useStoryStore } from '../store/story';
import { useUseCaseSet } from '../store/usecases';
import { useAnimation } from '../store/animation';
import { demoUseCases } from '../usecase/demo';
import { SCENE_SECONDS } from '../usecase/model';
import {
  PERSONA_ANGLE, STORY_PERSONAS, buildStory, positionText, stepScene, storyKeyAction,
  type StoryPersona, type StoryScene, type StoryUseCase,
} from './model';

const fadeUp = { from: { opacity: 0, transform: 'translateY(32px)' }, to: { opacity: 1, transform: 'translateY(0)' } };
const zoomIn = { from: { opacity: 0, transform: 'scale(0.6)' }, to: { opacity: 1, transform: 'scale(1)' } };

const useStyles = makeStyles({
  root: {
    position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column',
    backgroundImage: `radial-gradient(ellipse at 20% 10%, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground1} 60%)`,
    backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1, outlineStyle: 'none',
  },
  stage: {
    flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    rowGap: tokens.spacingVerticalXL, padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXXL}`, textAlign: 'center', overflowY: 'auto',
  },
  kicker: { color: tokens.colorBrandForeground1, letterSpacing: '0.08em', fontSize: 'clamp(14px, 1.8vw, 24px)', fontWeight: tokens.fontWeightSemibold },
  heading: { margin: 0, fontWeight: tokens.fontWeightBold, fontSize: 'clamp(28px, 5.5vw, 72px)', lineHeight: 1.2, overflowWrap: 'anywhere', maxWidth: '24em' },
  big: { fontWeight: tokens.fontWeightBold, fontSize: 'clamp(56px, 13vw, 190px)', lineHeight: 1, color: tokens.colorBrandForeground1, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' },
  bigLabel: { fontSize: 'clamp(16px, 2.2vw, 30px)', color: tokens.colorNeutralForeground2 },
  lines: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, fontSize: 'clamp(18px, 2.6vw, 34px)', maxWidth: '32em' },
  steps: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, fontSize: 'clamp(16px, 2.1vw, 28px)', color: tokens.colorNeutralForeground2, maxWidth: '36em', textAlign: 'start' },
  noData: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalXL,
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusXLarge, fontSize: 'clamp(16px, 2.2vw, 28px)', maxWidth: '32em',
  },
  cta: { fontSize: 'clamp(18px, 2.8vw, 36px)', fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1, borderTop: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, paddingTop: tokens.spacingVerticalM },
  anim1: { animationName: fadeUp, animationDuration: '600ms', animationFillMode: 'both', animationTimingFunction: 'ease-out', '@media (prefers-reduced-motion: reduce)': { animationName: 'none' } },
  animBig: { animationName: zoomIn, animationDuration: '700ms', animationFillMode: 'both', animationTimingFunction: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', '@media (prefers-reduced-motion: reduce)': { animationName: 'none' } },
  footer: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM, backgroundColor: tokens.colorNeutralBackground3, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  progress: { display: 'flex', columnGap: '2px', height: '6px', margin: 0, padding: 0, listStyleType: 'none' },
  seg: { flexGrow: 1, backgroundColor: tokens.colorNeutralBackground5 },
  segDone: { backgroundColor: tokens.colorBrandBackground },
  hint: { color: tokens.colorNeutralForeground3 },
  personaList: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalM },
  forced: { forcedColorAdjust: 'auto' },
  srOnly: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
  segCur: { outlineStyle: 'solid', outlineWidth: '2px', outlineColor: tokens.colorNeutralForeground1 },
  textView: { flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: tokens.spacingHorizontalXXL, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL },
  textList: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL },
  textItem: { padding: tokens.spacingHorizontalL, borderLeft: `${tokens.strokeWidthThickest} solid ${tokens.colorNeutralStroke2}` },
  textItemCur: { borderLeft: `${tokens.strokeWidthThickest} double ${tokens.colorBrandStroke1}`, fontWeight: tokens.fontWeightSemibold },
});

/** 現在の作業先のユースケース（デモは顧客パックのお手本、実際の Project はその Project の登録）。ほかの Project のものは混ざらない（FR-138） */
function useStoryUseCases(): StoryUseCase[] {
  const projectId = useProjects((x) => x.openId);
  const set = useUseCaseSet(projectId);
  const packState = usePackStore((x) => x.state);
  const data = packState.status === 'ready' ? packState.pack.data : undefined;
  return useMemo(() => {
    if (projectId) return set.items.map((u) => ({ id: u.id, name: u.name, persona: u.persona, summary: u.summary, steps: u.steps, effect: u.effect, solutionId: u.source?.solutionId }));
    return demoUseCases(data?.customer, data?.issues.solutions);
  }, [projectId, set, data]);
}

function useStoryScenes(persona: StoryPersona): StoryScene[] {
  const packState = usePackStore((x) => x.state);
  const weights = usePriorityStore((x) => x.weights);
  const projectId = useProjects((x) => x.openId);
  const useCases = useStoryUseCases();
  return useMemo(() => {
    // 実際の Project を開いているときは、デモのお手本パック（解決策・優先順位・ROI・KPI/OKR）の値を使わない（FR-138・FR-180）。
    // Project 自身のデータがない要素は「データなし」のシーンになる
    if (projectId) return buildStory({ persona, issues: [], solutions: [], products: [], customer: undefined, useCases, weights });
    if (packState.status !== 'ready') return [];
    const d = packState.pack.data;
    return buildStory({
      persona, issues: d.issues.issues, solutions: d.issues.solutions, products: d.products.products,
      customer: d.customer as never, useCases, weights,
    });
  }, [packState, persona, weights, useCases, projectId]);
}

/** デモの作業先のときだけ、架空であることの注記（UseCaseScreen と同じ fictionalNote） */
function useDemoNote(): string | undefined {
  const projectId = useProjects((x) => x.openId);
  const packState = usePackStore((x) => x.state);
  return projectId || packState.status !== 'ready' ? undefined : packState.pack.data.customer.fictionalNote;
}

function endStory(): void {
  useStoryStore.getState().reset();
  usePresentationStore.getState().end();
}

function requestFs(el: HTMLElement | null): void {
  try { void el?.requestFullscreen?.()?.catch?.(() => undefined); } catch { /* フルスクリーンが使えなくてもストーリーは続ける */ }
}
let fsExiting = false; // exitFullscreen は非同期。抜ける途中で Esc がもう一度来たら、ストーリーの終了として扱う
function exitFs(): void {
  try {
    if (!document.fullscreenElement) return;
    fsExiting = true;
    void document.exitFullscreen?.()?.catch?.(() => { fsExiting = false; });
  } catch { fsExiting = false; }
}

function SceneView({ scene, motion }: { scene: StoryScene; motion: boolean }) {
  const s = useStyles();
  const a = (delay: number, big = false) => (motion ? { className: big ? s.animBig : s.anim1, style: { animationDelay: `${delay}ms` } } : {});
  return (
    <section
      className={s.stage}
      data-testid="story-scene"
      data-story-part={scene.part}
      data-solution-id={scene.solutionId}
      data-no-data={scene.noData ? 'true' : undefined}
      aria-label={`${scene.kicker}`}
    >
      <Text as="p" className={mergeClasses(s.kicker, motion && s.anim1)} {...(motion ? { style: { animationDelay: '0ms' } } : {})}>{scene.kicker}</Text>
      {scene.big ? (
        <div {...a(150, true)}>
          <div className={s.big}>{scene.big.value}</div>
          <div className={s.bigLabel}>{scene.big.label}</div>
        </div>
      ) : null}
      <h2 className={mergeClasses(s.heading, motion && s.anim1)} style={motion ? { animationDelay: scene.big ? '450ms' : '150ms' } : undefined}>{scene.heading}</h2>
      {scene.noData ? (
        <div className={mergeClasses(s.noData, motion && s.anim1)} role="note" style={motion ? { animationDelay: '300ms' } : undefined}>
          <Text weight="semibold" size={500}>データなし</Text>
          <span>理由：{scene.noData.reason}</span>
          <span>補うには：{scene.noData.entry}</span>
        </div>
      ) : null}
      {scene.lines.length > 0 ? (
        <ul className={s.lines}>
          {scene.lines.map((l, i) => <li key={i} className={motion ? s.anim1 : undefined} style={motion ? { animationDelay: `${600 + i * 200}ms` } : undefined}>{l}</li>)}
        </ul>
      ) : null}
      {scene.steps && scene.steps.length > 0 ? (
        <ol className={s.steps} aria-label="手順">
          {scene.steps.map((l, i) => <li key={i} className={motion ? s.anim1 : undefined} style={motion ? { animationDelay: `${900 + i * 200}ms` } : undefined}>{l}</li>)}
        </ol>
      ) : null}
      {scene.cta ? <p className={mergeClasses(s.cta, motion && s.anim1)} style={motion ? { animationDelay: '1500ms' } : undefined}>{scene.cta}</p> : null}
    </section>
  );
}

/** テキスト表示（NFR-A11Y-008 AC-367）: 全シーンの内容を同じ順序で読める目次。演出なし */
function TextView({ scenes, cur }: { scenes: StoryScene[]; cur: number }) {
  const s = useStyles();
  const curRef = useRef<HTMLLIElement>(null);
  useEffect(() => { try { curRef.current?.scrollIntoView?.({ block: 'center' }); } catch { /* 無視 */ } }, []);
  return (
    <section className={s.textView} data-testid="story-text" aria-label="ストーリーのテキスト表示" tabIndex={0}>
      <ol className={s.textList}>
        {scenes.map((sc, i) => (
          <li key={sc.id} ref={i === cur ? curRef : undefined} className={mergeClasses(s.textItem, i === cur && s.textItemCur)} aria-current={i === cur ? 'step' : undefined} data-testid="story-text-item">
            <Text as="p" size={200}>{i + 1} / {scenes.length}{i === cur ? '（現在のシーン）' : ''}　{sc.kicker}</Text>
            {sc.big ? <p>{sc.big.value}　{sc.big.label}</p> : null}
            <h3>{sc.heading}</h3>
            {sc.noData ? <p>データなし。理由：{sc.noData.reason}　補うには：{sc.noData.entry}</p> : null}
            {sc.lines.length > 0 ? <ul>{sc.lines.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}
            {sc.steps && sc.steps.length > 0 ? <ol aria-label="手順">{sc.steps.map((l, k) => <li key={k}>{l}</li>)}</ol> : null}
            {sc.cta ? <p>{sc.cta}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

let openerFocus: Element | null = null;
if (typeof document !== 'undefined') {
  // ペルソナの選択が開く瞬間（描画の前）のフォーカス位置を覚える（NFR-A11Y-008 AC-370）
  useStoryStore.subscribe((st, prev) => {
    if (st.picking && !prev.picking) {
      const a = document.activeElement;
      openerFocus = a && a !== document.body ? a : null;
    }
  });
}

function StoryPlayer({ persona }: { persona: StoryPersona }) {
  const s = useStyles();
  const scenes = useStoryScenes(persona);
  const demoNote = useDemoNote();
  const index = useStoryStore((x) => x.index);
  const setIndex = useStoryStore((x) => x.setIndex);
  const motion = useAnimation((x) => x.playing);
  const rootRef = useRef<HTMLDivElement>(null);
  const [auto, setAuto] = useState(false);
  const [fs, setFs] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const textModeRef = useRef(false);
  textModeRef.current = textMode;
  // 開く前のフォーカス位置は、ペルソナの選択を開いた時点で記録したもの（選択ダイアログのボタンは閉じると消えるため）
  const prevFocus = useRef<Element | null>(openerFocus ?? (typeof document !== 'undefined' ? document.activeElement : null));
  const total = scenes.length;
  const cur = Math.min(index, Math.max(0, total - 1));
  const scene = scenes[cur];

  const go = useCallback((delta: number) => setIndex(stepScene(useStoryStore.getState().index, delta, total)), [setIndex, total]);
  const toggleFs = useCallback(() => { if (document.fullscreenElement) exitFs(); else requestFs(rootRef.current); }, []);

  // 開始: フルスクリーンにする（使えない・拒否された場合も、ストーリーはそのまま表示する）
  useEffect(() => {
    requestFs(rootRef.current);
    rootRef.current?.focus();
    const t = window.setTimeout(() => rootRef.current?.focus(), 60);
    const onFs = () => { setFs(document.fullscreenElement !== null); fsExiting = false; };
    document.addEventListener('fullscreenchange', onFs);
    const back = prevFocus.current;
    return () => {
      window.clearTimeout(t); document.removeEventListener('fullscreenchange', onFs); exitFs(); fsExiting = false;
      // AC-370: 閉じたら、開く前のフォーカスの位置へ戻す
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) window.setTimeout(() => back.focus(), 0);
    };
  }, []);

  // 自動再生（PARAM-047 秒ごと。最後のシーンで止まる）
  useEffect(() => {
    if (!auto || textMode) return;
    if (cur >= total - 1) { setAuto(false); return; }
    const t = window.setTimeout(() => go(1), SCENE_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [auto, textMode, cur, total, go]);

  // キー操作（キャンバスなどより先に捕まえる）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // AC-370: Tab はストーリーの外へ抜けない（フォーカストラップ）
      if (e.key === 'Tab' && rootRef.current) {
        const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (items.length === 0) { e.preventDefault(); return; }
        const first = items[0]!; const last = items[items.length - 1]!;
        const activeEl = document.activeElement;
        if (!rootRef.current.contains(activeEl) || (!e.shiftKey && activeEl === last)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && (activeEl === first || activeEl === rootRef.current)) { e.preventDefault(); last.focus(); }
        return;
      }
      const act = storyKeyAction(e);
      if (!act) return;
      // テキスト表示中は、スクロール等の通常の操作を奪わない（Esc だけ扱う）
      if (textModeRef.current && act !== 'exit') return;
      e.preventDefault();
      e.stopPropagation();
      if (act === 'next') go(1);
      else if (act === 'prev') go(-1);
      else if (act === 'first') setIndex(0);
      else if (act === 'toggle-play') setAuto((v) => !v);
      else if (act === 'toggle-fullscreen') toggleFs();
      else if (document.fullscreenElement && !fsExiting) exitFs(); // Esc: まずフルスクリーンを抜ける（位置とペルソナは保つ）
      else endStory();
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') e.preventDefault(); }; // Space でボタンが押されないように
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); };
  }, [go, setIndex, toggleFs]);

  return (
    <FluentProvider theme={webDarkTheme} className={s.forced} style={{ background: 'transparent' }}>
      <div ref={rootRef} className={s.root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${persona}向けのストーリー`} data-testid="story" data-persona={persona}>
        <div className={s.srOnly} role="status" aria-live="polite" aria-atomic="true" data-testid="story-announce">{scene ? `${scene.kicker}、${positionText(cur, Math.max(total, 1))}` : ''}</div>
        {textMode ? <TextView scenes={scenes} cur={cur} /> : scene ? <SceneView key={scene.id} scene={scene} motion={motion} /> : <section className={s.stage} data-testid="story-scene" data-no-data="true"><h2 className={s.heading}>データなし</h2></section>}
        {demoNote ? <Text size={200} className={s.hint} align="center" data-testid="demo-fictional-note">{demoNote}</Text> : null}
        <ol className={s.progress} aria-hidden="true">
          {scenes.map((sc, i) => <li key={sc.id} className={mergeClasses(s.seg, i <= cur && s.segDone, i === cur && s.segCur)} />)}
        </ol>
        <div className={s.footer} role="toolbar" aria-label="ストーリーの操作">
          <Button icon={<ArrowReset20Regular aria-hidden />} onClick={() => setIndex(0)} disabled={cur === 0}>先頭へ</Button>
          <Button icon={<ArrowPrevious20Regular aria-hidden />} onClick={() => go(-1)} disabled={cur === 0} aria-label="前のシーン" />
          <Text role="status" aria-live="polite" data-testid="story-position" size={400}>{positionText(cur, Math.max(total, 1))}</Text>
          <Button icon={<ArrowNext20Regular aria-hidden />} onClick={() => go(1)} disabled={cur >= total - 1} aria-label="次のシーン" />
          <Button onClick={() => { setAuto(false); setTextMode((v) => !v); }} aria-pressed={textMode}>{textMode ? '演出の表示に戻る' : 'テキスト表示'}</Button>
          <Button icon={auto ? <Pause20Regular aria-hidden /> : <Play20Regular aria-hidden />} onClick={() => setAuto((v) => !v)} aria-pressed={auto}>
            {auto ? '自動再生を一時停止' : '自動再生'}
          </Button>
          <Button icon={<FullScreenMaximize20Regular aria-hidden />} onClick={toggleFs} aria-pressed={fs}>{fs ? 'フルスクリーンを終了' : 'フルスクリーン'}</Button>
          <Button appearance="primary" icon={<Dismiss20Regular aria-hidden />} onClick={endStory}>ストーリーを終了</Button>
          <Text size={200} className={s.hint}>← → 前後　Space 自動再生　F フルスクリーン　Home 先頭　Esc 終了</Text>
        </div>
      </div>
    </FluentProvider>
  );
}

/** ペルソナの選択ダイアログと、ストーリーの画面。アプリの上位に 1 つ置く */
export function StoryHost() {
  const s = useStyles();
  const picking = useStoryStore((x) => x.picking);
  const persona = useStoryStore((x) => x.persona);
  const closePicker = useStoryStore((x) => x.closePicker);
  const play = useStoryStore((x) => x.play);
  return (
    <>
      <Dialog open={picking} modalType="non-modal" onOpenChange={(_, d) => { if (!d.open) closePicker(); }}>
        <DialogSurface aria-label="ペルソナの選択">
          <DialogBody>
            <DialogTitle>ペルソナの選択</DialogTitle>
            <DialogContent>
              <Text as="p" block>誰に向けて話すかを選ぶと、そのペルソナ向けに分析の結果をストーリーで示します。選ばずに閉じると、議題を巡るプレゼンテーションのまま続けます。</Text>
              <div className={s.personaList}>
                {STORY_PERSONAS.map((p) => (
                  <Button key={p} appearance="primary" size="large" onClick={() => play(p)} title={PERSONA_ANGLE[p]}>{p}</Button>
                ))}
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {persona ? createPortal(<StoryPlayer key={persona} persona={persona} />, document.body) : null}
    </>
  );
}
