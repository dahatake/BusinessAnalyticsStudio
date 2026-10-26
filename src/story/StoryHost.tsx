// ペルソナ別ストーリー（FR-177〜FR-179）。ペルソナを選ぶと、顧客パックと Project のデータだけから、フルスクリーンの 1 画面 1 メッセージのシーンを作って順に見せる。
// 操作: `→`/`←` 次/前、`Home` 先頭、`Space` 自動再生の一時停止・再開、`F` フルスクリーンの開始・終了、`Esc` でフルスクリーンを抜け、もう一度で終了。画面のボタンでも同じことができる。
// 動き: OS の「視差効果を減らす」・アプリのアニメーション停止（FR-071・FR-072）のときは、動きなしで即座に切り替わる。
// 既定（「生成 AI で作成」を選ばない）は端末内だけで動き、外部には接続しない（FR-179 AC-362）。
// 「生成 AI で作成」（FR-290）を選んだときだけ、共通接続（FR-275）の接続先へ材料を送ってストーリーの見出しと語りを作る。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Badge, Button, Checkbox, DialogActions, DialogBody, DialogContent, DialogTitle, FluentProvider, Spinner, Text, makeStyles, mergeClasses, tokens, webDarkTheme,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import {
  ArrowPrevious20Regular, ArrowNext20Regular, ArrowReset20Regular, FullScreenMaximize20Regular, Play20Regular, Pause20Regular, Dismiss20Regular,
} from '@fluentui/react-icons';
import { usePackStore } from '../store/pack';
import { usePriorityStore } from '../store/priority';
import { useProjects } from '../store/projects';
import { usePresentationStore } from '../store/presentation';
import { useStoryStore, type AiStory } from '../store/story';
import { askFoundry, fetchFoundryView } from '../ai/foundryClient';
import { consentKeyOf } from '../ai/consent';
import { confirmViaUi, countPersons, gatePersonConfirm } from '../ai/personConfirm';
import { useConsentStore } from '../ai/useConsent';
import { recordConfirmedSendKinds, confirmedSendKinds } from '../ai/sendKinds';
import { explainLimitsNow, explainUsageNow, setExplainUsage } from '../explain/store';
import { buildStoryMaterials } from './genai';
import { PROVIDER_LABEL, companyAllowedOf, newStorySession, runStoryGenai } from './genaiRun';
import { useUseCaseSet } from '../store/usecases';
import { useAnimation } from '../store/animation';
import { demoUseCases } from '../usecase/demo';
import { SCENE_SECONDS } from '../usecase/model';
import {
  PERSONA_ANGLE, STORY_PERSONAS, buildStory, positionText, stepScene, storyKeyAction,
  type StoryInput, type StoryPersona, type StoryScene, type StoryUseCase,
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
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`, textAlign: 'center', overflow: 'hidden', boxSizing: 'border-box', minWidth: 0,
  },
  inner: {
    flexShrink: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: tokens.spacingVerticalS, boxSizing: 'border-box', transformOrigin: 'center center',
    '& > *': { flexShrink: 0, maxWidth: '100%', boxSizing: 'border-box' },
  },
  kicker: { color: tokens.colorBrandForeground1, letterSpacing: '0.08em', fontSize: 'clamp(12px, min(1.8vw, 3vh), 24px)', lineHeight: 1.3, overflowWrap: 'anywhere', fontWeight: tokens.fontWeightSemibold },
  heading: { margin: 0, fontWeight: tokens.fontWeightBold, fontSize: 'clamp(18px, min(5.5vw, 9vh), 72px)', lineHeight: 1.25, overflowWrap: 'anywhere', maxWidth: '24em' },
  big: { fontWeight: tokens.fontWeightBold, fontSize: 'clamp(40px, min(13vw, 22vh), 190px)', lineHeight: 1.4, paddingBlock: tokens.spacingVerticalXS, color: tokens.colorBrandForeground1, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' },
  bigLabel: { fontSize: 'clamp(14px, min(2.2vw, 4vh), 30px)', lineHeight: 1.3, color: tokens.colorNeutralForeground2 },
  lines: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, fontSize: 'clamp(13px, min(2.6vw, 4.2vh), 34px)', lineHeight: 1.3, overflowWrap: 'anywhere', maxWidth: '32em' },
  steps: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, fontSize: 'clamp(12px, min(2.1vw, 3.6vh), 28px)', lineHeight: 1.3, overflowWrap: 'anywhere', color: tokens.colorNeutralForeground2, maxWidth: '36em', textAlign: 'start' },
  noData: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusXLarge, fontSize: 'clamp(13px, min(2.2vw, 3.8vh), 28px)', lineHeight: 1.3, overflowWrap: 'anywhere', maxWidth: '32em',
  },
  cta: { fontSize: 'clamp(14px, min(2.8vw, 4.5vh), 36px)', lineHeight: 1.3, overflowWrap: 'anywhere', fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1, borderTop: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, paddingTop: tokens.spacingVerticalM },
  anim1: { animationName: fadeUp, animationDuration: '600ms', animationFillMode: 'both', animationTimingFunction: 'ease-out', '@media (prefers-reduced-motion: reduce)': { animationName: 'none' } },
  animBig: { animationName: zoomIn, animationDuration: '700ms', animationFillMode: 'both', animationTimingFunction: 'ease-out', '@media (prefers-reduced-motion: reduce)': { animationName: 'none' } },
  footer: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM, backgroundColor: tokens.colorNeutralBackground3, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  progress: { display: 'flex', columnGap: tokens.spacingHorizontalXXS, height: '6px', margin: 0, padding: 0, listStyleType: 'none' },
  seg: { flexGrow: 1, backgroundColor: tokens.colorNeutralBackground5 },
  segDone: { backgroundColor: tokens.colorBrandBackground },
  hint: { color: tokens.colorNeutralForeground3 },
  personaList: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalM },
  forced: { forcedColorAdjust: 'auto' },
  srOnly: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
  segCur: { outlineStyle: 'solid', outlineWidth: tokens.strokeWidthThick, outlineColor: tokens.colorNeutralForeground1 },
  textView: { flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: tokens.spacingHorizontalXXL, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL },
  textList: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL },
  textItem: { padding: tokens.spacingHorizontalL, borderLeft: `${tokens.strokeWidthThickest} solid ${tokens.colorNeutralStroke2}` },
  aiBar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}` },
  subHeading: { margin: 0, fontWeight: tokens.fontWeightSemibold, fontSize: 'clamp(14px, min(2.6vw, 4.2vh), 32px)', lineHeight: 1.3, overflowWrap: 'anywhere', maxWidth: '32em', color: tokens.colorNeutralForeground2 },
  narration: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, fontSize: 'clamp(13px, min(2.3vw, 3.8vh), 30px)', lineHeight: 1.4, overflowWrap: 'anywhere', maxWidth: '36em' },
  genaiOpt: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, marginBlockStart: tokens.spacingVerticalM },
  dialogStack: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
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

/** ストーリーの入力（FR-179 と FR-290 で同じ材料を使う） */
function useStoryInput(persona: StoryPersona): StoryInput | null {
  const packState = usePackStore((x) => x.state);
  const weights = usePriorityStore((x) => x.weights);
  const projectId = useProjects((x) => x.openId);
  const useCases = useStoryUseCases();
  return useMemo(() => {
    // 実際の Project を開いているときは、デモのお手本パック（解決策・優先順位・ROI・KPI/OKR）の値を使わない（FR-138・FR-180）。
    // Project 自身のデータがない要素は「データなし」のシーンになる
    if (projectId) return { persona, issues: [], solutions: [], products: [], customer: undefined, useCases, weights };
    if (packState.status !== 'ready') return null;
    const d = packState.pack.data;
    return {
      persona, issues: d.issues.issues, solutions: d.issues.solutions, products: d.products.products,
      customer: d.customer as never, useCases, weights,
    };
  }, [packState, persona, weights, useCases, projectId]);
}

function useStoryScenes(persona: StoryPersona): StoryScene[] {
  const input = useStoryInput(persona);
  return useMemo(() => (input ? buildStory(input) : []), [input]);
}

/** 番組構成（デモのときだけ顧客パックの show。実際の Project ではほかの Project・お手本の値を混ぜない） */
function useShowChapters(): Array<{ title: string; topics?: Array<{ title: string }> }> {
  const packState = usePackStore((x) => x.state);
  const projectId = useProjects((x) => x.openId);
  return useMemo(() => {
    if (projectId || packState.status !== 'ready') return [];
    return (packState.pack.data.show?.chapters ?? []).map((c) => ({ title: c.title, topics: (c.topics ?? []).map((t) => ({ title: t.title })) }));
  }, [packState, projectId]);
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
  const stageRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  // 内容が画面より高いときは全体を縮小して収める（要素どうしの重なり・画面外へのはみ出しを避ける。FR-178 AC-740）
  useLayoutEffect(() => {
    const stage = stageRef.current, inner = innerRef.current;
    if (!stage || !inner) return undefined;
    const fit = () => {
      const cs = getComputedStyle(stage);
      const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const ratio = inner.offsetHeight > 0 && availH > 0 ? Math.min(1, availH / inner.offsetHeight) : 1;
      inner.style.transform = ratio < 1 ? `scale(${ratio})` : '';
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : undefined;
    ro?.observe(stage); ro?.observe(inner);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, [scene]);
  const a = (delay: number, big = false) => (motion ? { className: big ? s.animBig : s.anim1, style: { animationDelay: `${delay}ms` } } : {});
  return (
    <section
      ref={stageRef}
      className={s.stage}
      data-testid="story-scene"
      data-story-part={scene.part}
      data-solution-id={scene.solutionId}
      data-no-data={scene.noData ? 'true' : undefined}
      aria-label={`${scene.kicker}`}
    >
      <div ref={innerRef} className={s.inner}>
      <Text as="p" data-story-el="kicker" className={mergeClasses(s.kicker, motion && s.anim1)} {...(motion ? { style: { animationDelay: '0ms' } } : {})}>{scene.kicker}</Text>
      {scene.big ? (
        <div {...a(150, true)}>
          <div className={s.big} data-story-el="big">{scene.big.value}</div>
          <div className={s.bigLabel} data-story-el="big-label">{scene.big.label}</div>
        </div>
      ) : null}
      {scene.aiHeading ? (
        <>
          <h2 data-story-el="heading" className={mergeClasses(s.heading, motion && s.anim1)} style={motion ? { animationDelay: scene.big ? '450ms' : '150ms' } : undefined}>{scene.aiHeading}</h2>
          <p data-story-el="sub-heading" className={s.subHeading}>{scene.heading}</p>
        </>
      ) : (
        <h2 data-story-el="heading" className={mergeClasses(s.heading, motion && s.anim1)} style={motion ? { animationDelay: scene.big ? '450ms' : '150ms' } : undefined}>{scene.heading}</h2>
      )}
      {scene.narration && scene.narration.length > 0 ? (
        <ul className={s.narration} aria-label="語り" data-story-el="narration">
          {scene.narration.map((l, i) => <li key={i} className={motion ? s.anim1 : undefined} style={motion ? { animationDelay: `${300 + i * 150}ms` } : undefined}>{l}</li>)}
        </ul>
      ) : null}
      {scene.removedSentences ? <Text size={300} className={s.hint} data-story-el="removed">材料にない数値・名称を含む {scene.removedSentences} 文は表示していません</Text> : null}
      {scene.noData ? (
        <div className={mergeClasses(s.noData, motion && s.anim1)} role="note" style={motion ? { animationDelay: '300ms' } : undefined}>
          <Text weight="semibold" size={500} data-story-el="body-line">データなし</Text>
          <span data-story-el="body-line">理由：{scene.noData.reason}</span>
          <span data-story-el="body-line">補うには：{scene.noData.entry}</span>
        </div>
      ) : null}
      {scene.lines.length > 0 ? (
        <ul className={s.lines}>
          {scene.lines.map((l, i) => <li key={i} data-story-el="body-line" className={motion ? s.anim1 : undefined} style={motion ? { animationDelay: `${600 + i * 200}ms` } : undefined}>{l}</li>)}
        </ul>
      ) : null}
      {scene.steps && scene.steps.length > 0 ? (
        <ol className={s.steps} aria-label="手順">
          {scene.steps.map((l, i) => <li key={i} data-story-el="body-line" className={motion ? s.anim1 : undefined} style={motion ? { animationDelay: `${900 + i * 200}ms` } : undefined}>{l}</li>)}
        </ol>
      ) : null}
      {scene.cta ? <p data-story-el="cta" className={mergeClasses(s.cta, motion && s.anim1)} style={motion ? { animationDelay: '1500ms' } : undefined}>{scene.cta}</p> : null}
            </div>
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
            <h3>{sc.aiHeading ?? sc.heading}</h3>
            {sc.aiHeading ? <p>{sc.heading}</p> : null}
            {sc.narration && sc.narration.length > 0 ? <p>{sc.narration.join('')}</p> : null}
            {sc.removedSentences ? <p>材料にない数値・名称を含む {sc.removedSentences} 文は表示していません</p> : null}
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

function StoryPlayer({ persona, ai }: { persona: StoryPersona; ai: AiStory | null }) {
  const s = useStyles();
  const built = useStoryScenes(persona);
  const scenes = ai ? ai.scenes : built;
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
        {ai ? (
          <div className={s.aiBar} data-testid="story-ai-label">
            <Badge appearance="filled" color="brand">AI 生成</Badge>
            <Text size={300}>接続先: {PROVIDER_LABEL[ai.provider]}</Text>
            {ai.truncated ? <Text size={200} className={s.hint}>入力の上限のため、番組構成などの一部の材料を省いて作成しました</Text> : null}
            {ai.removed > 0 ? <Text size={200} className={s.hint}>材料にない数値・名称を含む {ai.removed} 文は表示していません</Text> : null}
          </div>
        ) : null}
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

/** 生成 AI での作成の呼び出しの状態（二重の呼び出し・最小の間隔の判定に使う。保存しない） */
const genaiSession = newStorySession();
let genaiController: AbortController | null = null;

/** 「生成 AI で作成」（FR-290）を実行する。材料は選んだペルソナと、この作業先の FR-179 の材料だけ */
async function runGenai(persona: StoryPersona, runId: number, input: StoryInput, chapters: Array<{ title: string; topics?: Array<{ title: string }> }>): Promise<void> {
  const st = useStoryStore.getState();
  const pack = usePackStore.getState().state;
  const isCurrent = () => { const g = useStoryStore.getState().genai; return g?.phase === 'running' && g.runId === runId; };
  if (pack.status !== 'ready') { st.setGenai({ phase: 'error', persona, reasonText: '顧客パックが読み込まれていないため、生成 AI に接続しませんでした' }); return; }
  const data = pack.pack.data;
  const relayUrl = usePackStore.getState().runtime.relayUrl;
  const packId = data.customer.name;
  const consentRecord = useConsentStore.getState().records[consentKeyOf(data.customer.name, data.customer.projectName)];
  // FR-140・AC-785: 実際の Project を開いているときは、その企業の「外部 AI への送信を許可する」が必要（お手本パックのデモは不要）
  const companyAllowed = companyAllowedOf(useProjects.getState());
  genaiController = new AbortController();
  const signal = genaiController.signal;
  const outcome = await runStoryGenai({
    now: () => new Date(),
    limits: explainLimitsNow,
    usage: { get: explainUsageNow, set: setExplainUsage },
    consent: !!consentRecord,
    companyAllowed,
    includesPerson: countPersons(data) > 0,
    confirmPerson: () => gatePersonConfirm({ destination: 'ai', scopeLabel: 'プレゼンテーションの生成 AI による作成（選択した生成AI接続先へ、選んだペルソナと解決策・優先順位・ROI・コスト・KPI/OKR・ユースケース・番組構成を送信）', data, consent: consentRecord, confirm: confirmViaUi }),
    fetchView: () => fetchFoundryView(relayUrl, packId),
    confirmedKinds: () => confirmedSendKinds(packId),
    ask: (req, sig) => askFoundry(relayUrl, { packId, ...req }, undefined, sig),
  }, genaiSession, buildStoryMaterials(input, chapters), buildStory(input), signal);
  if (!isCurrent()) return; // 取り消した後に届いた結果は使わない
  const s2 = useStoryStore.getState();
  if (outcome.kind === 'ai') s2.playAi(persona, { scenes: outcome.scenes, provider: outcome.provider, truncated: outcome.truncated, removed: outcome.removed });
  else if (outcome.kind === 'reconfirm') s2.setGenai({ phase: 'reconfirm', persona, added: outcome.added });
  else if (outcome.kind === 'unavailable') s2.setGenai({ phase: 'error', persona, reasonText: outcome.reasonText });
  else if (outcome.kind === 'all-removed') s2.setGenai({ phase: 'removed', persona, message: outcome.message });
  else if (outcome.kind === 'wait' || outcome.kind === 'busy') s2.setGenai({ phase: 'error', persona, reasonText: outcome.message });
  else s2.reset();
}

function cancelGenai(): void {
  genaiController?.abort();
  useStoryStore.getState().reset();
}

/** 作成中の進行状況。実行は 1 回の作成（runId）ごとに 1 度だけ */
function GenaiRunning({ persona, runId }: { persona: StoryPersona; runId: number }) {
  const input = useStoryInput(persona);
  const chapters = useShowChapters();
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (!input || started.current === runId) return;
    started.current = runId;
    void runGenai(persona, runId, input, chapters);
  }, [input, chapters, persona, runId]);
  return (
    <Dialog open modalType="non-modal" onOpenChange={(_, d) => { if (!d.open) cancelGenai(); }}>
      <DialogSurface aria-label="ストーリーを作成中" data-testid="story-generating">
        <DialogBody>
          <DialogTitle>ストーリーを作成中</DialogTitle>
          <DialogContent>
            <Spinner size="small" labelPosition="after" label={`${persona}向けのストーリーを生成 AI で作成しています`} />
          </DialogContent>
          <DialogActions>
            <Button onClick={cancelGenai}>取り消す</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** 生成 AI を使えない理由と、FR-179 のストーリーで始める代替 */
function GenaiError({ persona, reasonText }: { persona: StoryPersona; reasonText: string }) {
  const s = useStyles();
  const play = useStoryStore((x) => x.play);
  const reset = useStoryStore((x) => x.reset);
  return (
    <Dialog open modalType="non-modal" onOpenChange={(_, d) => { if (!d.open) reset(); }}>
      <DialogSurface aria-label="生成 AI で作成できません">
        <DialogBody>
          <DialogTitle>生成 AI で作成できません</DialogTitle>
          <DialogContent className={s.dialogStack}>
            <Text as="p" block role="alert" data-testid="story-genai-error">{reasonText}</Text>
            <Text as="p" block>生成 AI を使わずに、材料から作るストーリーで始められます（外部へは送信しません）。</Text>
          </DialogContent>
          <DialogActions>
            <Button onClick={reset}>閉じる</Button>
            <Button appearance="primary" onClick={() => play(persona)}>生成 AI を使わずに開始</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** 生成された文をすべて除いたときの通知（FR-290 AC-776。エラーではない）と、FR-179 のストーリーで始める代替 */
function GenaiRemoved({ persona, message }: { persona: StoryPersona; message: string }) {
  const s = useStyles();
  const play = useStoryStore((x) => x.play);
  const reset = useStoryStore((x) => x.reset);
  return (
    <Dialog open modalType="non-modal" onOpenChange={(_, d) => { if (!d.open) reset(); }}>
      <DialogSurface aria-label="生成された文を表示しませんでした">
        <DialogBody>
          <DialogTitle>生成された文を表示しませんでした</DialogTitle>
          <DialogContent className={s.dialogStack}>
            <Text as="p" block role="status" data-testid="story-genai-removed">{message}</Text>
            <Text as="p" block>材料から作るストーリーで始められます（外部へは送信しません）。</Text>
          </DialogContent>
          <DialogActions>
            <Button onClick={reset}>閉じる</Button>
            <Button appearance="primary" onClick={() => play(persona)}>生成 AI を使わずに開始</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** 送信される情報の種類が増えたときの再確認（FR-290 AC-777）。確認するまで生成 AI を呼ばない */
function GenaiReconfirm({ persona, added }: { persona: StoryPersona; added: Array<{ id: string; label: string }> }) {
  const s = useStyles();
  const play = useStoryStore((x) => x.play);
  const reset = useStoryStore((x) => x.reset);
  const startGenai = useStoryStore((x) => x.startGenai);
  const confirm = () => {
    const pack = usePackStore.getState().state;
    if (pack.status === 'ready') recordConfirmedSendKinds(pack.pack.data.customer.name);
    startGenai(persona);
  };
  return (
    <Dialog open modalType="alert">
      <DialogSurface aria-label="送信される情報の再確認">
        <DialogBody>
          <DialogTitle>送信される情報の種類が増えました（再確認）</DialogTitle>
          <DialogContent className={s.dialogStack}>
            <Text as="p" block>実接続を有効にしたときに確認した内容に加えて、次の情報が生成 AI の接続先へ送信されます。確認するまで送信しません。</Text>
            <ul>{added.map((k) => <li key={k.id}>{k.label}</li>)}</ul>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={confirm}>確認して作成</Button>
            <Button onClick={() => play(persona)}>生成 AI を使わずに開始</Button>
            <Button onClick={reset}>キャンセル</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** ペルソナの選択ダイアログと、ストーリーの画面。アプリの上位に 1 つ置く */
export function StoryHost() {
  const s = useStyles();
  const picking = useStoryStore((x) => x.picking);
  const persona = useStoryStore((x) => x.persona);
  const ai = useStoryStore((x) => x.aiStory);
  const genai = useStoryStore((x) => x.genai);
  const closePicker = useStoryStore((x) => x.closePicker);
  const play = useStoryStore((x) => x.play);
  const startGenai = useStoryStore((x) => x.startGenai);
  // 「生成 AI で作成」は既定で選ばない（開くたびに選ばない状態へ戻す。FR-179 AC-362）
  const [useAi, setUseAi] = useState(false);
  useEffect(() => { if (picking) setUseAi(false); }, [picking]);
  return (
    <>
      <Dialog open={picking} modalType="non-modal" onOpenChange={(_, d) => { if (!d.open) closePicker(); }}>
        <DialogSurface aria-label="ペルソナの選択">
          <DialogBody>
            <DialogTitle>ペルソナの選択</DialogTitle>
            <DialogContent>
              <Text as="p" block>誰に向けて話すかを選ぶと、そのペルソナ向けに分析の結果をストーリーで示します。選ばずに閉じると、論点を巡るプレゼンテーションのまま続けます。</Text>
              <div className={s.personaList}>
                {STORY_PERSONAS.map((p) => (
                  <Button key={p} appearance="primary" size="large" onClick={() => (useAi ? startGenai(p) : play(p))} title={PERSONA_ANGLE[p]}>{p}</Button>
                ))}
              </div>
              <div className={s.genaiOpt}>
                <Checkbox label="生成 AI で作成" checked={useAi} onChange={(_, d) => setUseAi(d.checked === true)} />
                <Text size={200} className={s.hint}>選ぶと、選んだペルソナとこの Project の材料（解決策・優先順位・ROI・コスト・KPI/OKR・ユースケース・番組構成）を設定の生成 AI の接続先へ送り、その場でストーリーを作ります。選ばなければ外部へは送信しません。</Text>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {genai?.phase === 'running' ? <GenaiRunning key={genai.runId} persona={genai.persona} runId={genai.runId} /> : null}
      {genai?.phase === 'error' ? <GenaiError persona={genai.persona} reasonText={genai.reasonText} /> : null}
      {genai?.phase === 'removed' ? <GenaiRemoved persona={genai.persona} message={genai.message} /> : null}
      {genai?.phase === 'reconfirm' ? <GenaiReconfirm persona={genai.persona} added={genai.added} /> : null}
      {persona ? createPortal(<StoryPlayer key={`${persona}-${ai ? 'ai' : 'base'}`} persona={persona} ai={ai} />, document.body) : null}
    </>
  );
}
