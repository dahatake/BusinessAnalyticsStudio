import { useEffect, useState } from 'react';
import { MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { AiStatus } from '../ai/AiStatus';
import { DiscussionFileActions } from '../discussion/FileActions';
import { AppShell } from '../components/AppShell';
import { BrandLockup } from '../components/Brand';
import { useEffectiveBrand } from '../theme/useBrand';
import { ErrorView, LoadingView } from '../components/StateViews';
import { SCREENS } from '../screens/registry';
import { SelectionController } from '../selection/SelectionController';
import { SelectionAnnouncer } from '../selection/Announcer';
import { CommandController } from '../commands/CommandPalette';
import { GlobalSearch } from '../search/GlobalSearch';
import { setAvailableComponents, useLayout } from '../store/layout';
import { usePackStore } from '../store/pack';
import { checkTemplateVersion, versionWarning } from '../version';
import { Dock, PersonaMenu, ResetLayoutButton } from '../workspace/Controls';
import { Workspace } from '../workspace/Workspace';
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

export function App() {
  const state = usePackStore((s) => s.state);
  const load = usePackStore((s) => s.load);
  const brand = useEffectiveBrand();
  const [opened, setOpened] = useState(false);

  useEffect(() => { void load(); }, [load]);

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
      {!opened ? <Opening customerName={name} projectName={projectName} onDone={() => setOpened(true)} /> : null}
      <SelectionController />
      <SelectionAnnouncer />
      <CommandController screens={SCREENS} />
      <AppShell
        title={`${name} ${projectName}`}
        screens={SCREENS}
        onSelect={openComponent}
        headerExtra={<><GlobalSearch /><DiscussionFileActions /><AiStatus /></>}
        actions={<><PersonaMenu /><ResetLayoutButton /></>}
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
        <Workspace screens={SCREENS} />
      </AppShell>
    </>
  );
}
