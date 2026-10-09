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
import type { Intensity } from '../motion/tone';
import { useIntensity } from '../motion/useMotion';
import { usePresentationStore } from '../store/presentation';
import { prefersReducedMotion, useAnimation } from '../store/animation';
import { useEffectiveBrand } from '../theme/useBrand';
import { ErrorView, LoadingView } from '../components/StateViews';
import { PresentationBar, PresentationButton } from '../presentation/PresentationMode';
import { SCREENS } from '../screens/registry';
import { SelectionController } from '../selection/SelectionController';
import { EditModeSwitch, HistoryButton, ResetSampleButton } from '../edit/EditControls';
import { installEditKeys } from '../edit/useEditKeys';
import { SelectionAnnouncer } from '../selection/Announcer';
import { EntityBoardActions } from '../whiteboard/entityActions';
import { CommandController } from '../commands/CommandPalette';
import { GlobalSearch } from '../search/GlobalSearch';
import { isComponentVisible, setAvailableComponents, useLayout } from '../store/layout';
import { usePackStore } from '../store/pack';
import { checkTemplateVersion, versionWarning } from '../version';
import { Dock, PersonaMenu, ResetLayoutButton } from '../workspace/Controls';
import { Workspace } from '../workspace/Workspace';
import { IntensityIndicator } from '../show/IntensityIndicator';
import { ShowStage } from '../show/ShowStage';
import { useOpening } from '../store/opening';
import { Opening } from './Opening';

setAvailableComponents(SCREENS.map((s) => s.key));

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
  runTransition(() => (animate ? flushSync(() => openComponent(key)) : openComponent(key)), animate);
}

export function App() {
  const state = usePackStore((s) => s.state);
  const load = usePackStore((s) => s.load);
  const brand = useEffectiveBrand();
  const opened = useOpening((s) => s.opened);
  const finishOpening = useOpening((s) => s.finish);
  const presenting = usePresentationStore((s) => s.active);
  const intensity = useIntensity();
  const motionRef = useRef({ presenting, intensity });
  motionRef.current = { presenting, intensity };
  const onSelect = useCallback((key: string) => selectComponent(key, motionRef.current), []);

  useEffect(() => { void load(); }, [load]);
  // 顧客パックの読み込み中に Esc が押されたら、オープニングを飛ばす（読み込みが終わってから出るオープニングが、先の Esc を取りこぼさない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finishOpening(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishOpening]);
  useEffect(() => installEditKeys(), []);

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
  return (
    <>
      {!opened ? <Opening customerName={name} projectName={projectName} onDone={finishOpening} /> : null}
      <SelectionController />
      <ExportHost screens={SCREENS} />
      <SelectionAnnouncer />
      <EntityBoardActions />
      <CommandController screens={SCREENS} />
      <AppShell
        title={`${name} ${projectName}`}
        screens={SCREENS}
        onSelect={onSelect}
        headerExtra={<><GlobalSearch /><ExportButton /><DiscussionFileActions /><TimeAxis /><AnimationStatus /><IntensityIndicator /><AiStatus /></>}
        actions={<><EditModeSwitch /><HistoryButton /><ResetSampleButton /><PersonaMenu /><ResetLayoutButton /><PresentationButton /></>}
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
        <ShowStage />
        <Workspace screens={SCREENS} />
      </AppShell>
    </>
  );
}
