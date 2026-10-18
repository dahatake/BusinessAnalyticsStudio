import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { AiStatus } from '../ai/AiStatus';
import { DiscussionFileActions } from '../discussion/FileActions';
import { ExportButton, ExportHost } from '../export/ExportButton';
import { AppShell } from '../components/AppShell';
import { BrandLockup } from '../components/Brand';
import { TimeAxis } from '../components/TimeAxis';
import { AnimationStatus } from '../motion/AnimationController';
import { runTransition } from '../motion/fluent';
import { fadeInScreen, screenMotionAllowed } from '../motion/transitions';
import type { Intensity } from '../motion/tone';
import { useIntensity } from '../motion/useMotion';
import { usePresentationStore } from '../store/presentation';
import { prefersReducedMotion, useAnimation } from '../store/animation';
import { useEffectiveBrand } from '../theme/useBrand';
import { ErrorView, LoadingView } from '../components/StateViews';
import { PresentationBar, PresentationButton } from '../presentation/PresentationMode';
import { StoryHost } from '../story/StoryHost';
import { SCREENS } from '../screens/registry';
import { Stepper } from '../stepper/Stepper';
import { useStepper } from '../store/stepper';
import { SelectionController } from '../selection/SelectionController';
import { EditModeSwitch, HistoryButton, ResetSampleButton } from '../edit/EditControls';
import { installEditKeys } from '../edit/useEditKeys';
import { SelectionAnnouncer, SelectionIndicator } from '../selection/Announcer';
import { EntityBoardActions } from '../whiteboard/entityActions';
import { CommandController } from '../commands/CommandPalette';
import { GlobalSearch } from '../search/GlobalSearch';
import { isComponentVisible, setAvailableComponents, useLayout } from '../store/layout';
import { usePackStore } from '../store/pack';
import { checkTemplateVersion, versionWarning } from '../version';
import { AutoSizeSwitch, Dock, PersonaMenu, ResetLayoutButton } from '../workspace/Controls';
import { Workspace } from '../workspace/Workspace';
import { registerViewDecls } from '../view/viewModel';
import { registerViewTestHook } from '../view/useView';
import { ScreenViewButton } from '../view/ViewMenu';
import { IntensityIndicator } from '../show/IntensityIndicator';
import { ShowStage } from '../show/ShowStage';
import { useOpening } from '../store/opening';
import { Opening } from './Opening';
import '../ink/presentationInk'; // プレゼン中の一時的な注釈をチャプターの移動で消す（FR-091）
import { InkToolbarHost } from '../ink/FloatingInkToolbar';
import { AudioDirector } from '../audio/AudioDirector';
import { ShowControlBar } from '../show/ShowControlBar';
import { LaserPointer, PresenterView, ShowControlActions, ShowShortcuts } from '../show/ControlBarActions';
import { ShortVideoButton, ShortVideoDialog } from '../show/ShortVideo';
import { currentTopic } from '../store/presentation';
import { ProjectsPanel } from '../projects/ProjectsPanel';
import { MainScreen } from '../projects/MainScreen';
import { useMainScreen } from '../store/mainScreen';

setAvailableComponents(SCREENS.map((s) => s.key));
// 各画面の 2D・3D の表現の有無と世界区分の扱い（FR-217・FR-218）
registerViewDecls(SCREENS);

/** ナビゲーションの選択: 非表示なら再表示し、そのコンポーネントへフォーカスを移す。 */
function openComponent(key: string): void {
  useLayout.getState().showComponent(key);
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-testid="component-${key}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
    el?.focus({ preventScroll: true });
  }, 0);
}

/**
 * ナビゲーションの選択。非表示のコンポーネントを出すときだけ View Transition で動かす（FR-070）。
 * すでに表示中のものは見た目が変わらないので、更新を遅らせずにすぐ反映する（遷移の最中に始まった操作を妨げない）。
 */
function selectComponent(key: string, ctx: { presenting: boolean; intensity: Intensity }): void {
  // View Transition は、演出の動きが意味を持つときだけ（プレゼンテーションモード中で、演出強度が Executive でなく、停止中でも reduced-motion でもない）。
  // 通常の操作・Executive・停止中は、遷移を挟まず即時に切り替える（遷移中は当たり判定が実要素に届かず、直後の操作を妨げるため）。
  const animate = ctx.presenting && ctx.intensity !== 'Executive' && useAnimation.getState().playing && !prefersReducedMotion() && !isComponentVisible(key);
  if (animate) {
    runTransition(() => flushSync(() => openComponent(key)), animate);
    return;
  }
  // 通常の画面の切替は、開いた画面の面をフェードで現す（NFR-UX-017。覆いは操作を妨げない。停止中・視差効果を減らすでは動かさない）
  flushSync(() => openComponent(key));
  fadeInScreen(document.querySelector<HTMLElement>(`[data-testid="component-${key}"]`), screenMotionAllowed());
}

export function App() {
  const state = usePackStore((s) => s.state);
  const load = usePackStore((s) => s.load);
  const brand = useEffectiveBrand();
  const opened = useOpening((s) => s.opened);
  const mainShown = useMainScreen((s) => s.shown);
  const finishOpening = useOpening((s) => s.finish);
  // BGM のシーン: オープニング、プレゼンテーション中は章ごと、それ以外は通常（FR-073）
  const topic = usePresentationStore(currentTopic);
  const scene = !opened ? 'opening' : topic ? `chapter:${topic.chapterId}` : 'workspace';
  const presenting = usePresentationStore((s) => s.active);
  const intensity = useIntensity();
  const motionRef = useRef({ presenting, intensity });
  motionRef.current = { presenting, intensity };
  const onSelect = useCallback((key: string) => {
    useStepper.getState().followScreen(key); // FR-136 AC-203: 画面に対応するステップを現在にする
    selectComponent(key, motionRef.current);
  }, []);

  useEffect(() => { void load(); }, [load]);
  // モーダルのダイアログ（メイン画面の作業先の選択など）を閉じた後に、背景（#root）の aria-hidden が残ると、画面全体が支援技術から見えなくなる。
  // 開いているモーダルがないときは外す（AppShell の背景の扱いと同じ考え方。FR-186・FR-187）
  useEffect(() => {
    const fix = (): void => {
      const open = document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]') !== null;
      const root = document.getElementById('root');
      if (!open && root?.getAttribute('aria-hidden') === 'true') root.removeAttribute('aria-hidden');
    };
    fix();
    const mo = new MutationObserver(fix);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
    return () => mo.disconnect();
  }, []);
  // 顧客パックの読み込み中に Esc が押されたら、オープニングを飛ばす（読み込みが終わってから出るオープニングが、先の Esc を取りこぼさない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finishOpening(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishOpening]);
  useEffect(() => installEditKeys(), []);
  // テスト用フック t.view.state(key)（CONTRACT.md §21）
  useEffect(() => registerViewTestHook(), []);

  const customer = state.status === 'ready' ? state.pack.data.customer : undefined;
  useEffect(() => {
    if (customer) document.title = `${customer.name} ${customer.projectName}`;
  }, [customer]);

  // FR-102: 画面とコンソールの両方にエラーを出す
  const messages = state.status === 'ready' ? state.warnings : state.status === 'error' ? state.messages : undefined;
  useEffect(() => {
    for (const m of messages ?? []) console.warn(`[顧客パック] ${m}`);
  }, [messages]);

  if (state.status === 'loading') return <LoadingView label="顧客パックを読み込み中" />;
  if (state.status === 'error') {
    return (
      <div data-testid="pack-errors">
        <ErrorView
          title="顧客パックを読み込めませんでした"
          messages={state.messages}
          action="public/data の JSON を、schema/ のスキーマに合わせて直してください。"
        />
      </div>
    );
  }

  const { name, projectName } = state.pack.data.customer;
  // FR-106: 顧客パックの対応する雛形のバージョンが、雛形のバージョンと互換でないときの警告
  const version = checkTemplateVersion(state.pack.data.customer.templateVersion);
  // FR-186・FR-144 AC-398: 起動直後はメイン画面（QuickStart の手順だけの画面）。分析画面（AppShell）には、Project を開いてから入る
  if (mainShown) {
    return (
      <>
        {!opened ? <Opening customerName={name} projectName={projectName} onDone={finishOpening} /> : null}
        <AudioDirector scene={scene} />
        <MainScreen />
      </>
    );
  }
  return (
    <>
      {!opened ? <Opening customerName={name} projectName={projectName} onDone={finishOpening} /> : null}
      <SelectionController />
      <ExportHost screens={SCREENS} />
      <SelectionAnnouncer />
      <EntityBoardActions />
      <InkToolbarHost />
      <CommandController screens={SCREENS} />
      <AudioDirector scene={scene} />
      <ShowControlBar><ShowControlActions /></ShowControlBar>
      <ShowShortcuts />
      <PresenterView />
      <LaserPointer />
      <ShortVideoDialog />
      <AppShell
        title={`${name} ${projectName}`}
        screens={SCREENS}
        onSelect={onSelect}
        stepper={<Stepper onNavigate={onSelect} />}
        headerExtra={<><GlobalSearch /><ExportButton /><DiscussionFileActions /><SelectionIndicator /><TimeAxis /><AnimationStatus /><IntensityIndicator /><AiStatus /></>}
        actions={<><EditModeSwitch /><HistoryButton /><ResetSampleButton /><PersonaMenu /><AutoSizeSwitch /><ScreenViewButton /><ResetLayoutButton /><ShortVideoButton /><PresentationButton /></>}
        dock={<Dock screens={SCREENS} />}
        brand={brand ? <BrandLockup brand={brand} customerName={name} /> : null}
      >
        {state.pack.isExample ? (
          <div data-testid="example-pack-notice">
            <MessageBar intent="info" layout="multiline">
              <MessageBarBody>
                <MessageBarTitle>お手本パックで起動しています。</MessageBarTitle>
                架空企業のデモ用データです。顧客のデータは public/data/ と public/brand/ に置くと切り替わります。
              </MessageBarBody>
            </MessageBar>
          </div>
        ) : null}
        {!version.compatible ? (
          <div data-testid="version-warning">
            <MessageBar intent="warning" layout="multiline">
              <MessageBarBody>
                <MessageBarTitle>雛形のバージョンが合っていません。</MessageBarTitle>
                {versionWarning(version)}
              </MessageBarBody>
            </MessageBar>
          </div>
        ) : null}
        {state.warnings.length > 0 ? (
          <div data-testid="pack-errors">
            <MessageBar intent="warning" layout="multiline">
              <MessageBarBody>
                <MessageBarTitle>顧客パックに問題があります。問題のある項目だけを無効にして起動しました。</MessageBarTitle>
                <ul>{state.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </MessageBarBody>
            </MessageBar>
          </div>
        ) : null}
        <PresentationBar />
        <StoryHost />
        <ProjectsPanel onNavigate={onSelect} />
        <ShowStage />
        <Workspace screens={SCREENS} />
      </AppShell>
    </>
  );
}
