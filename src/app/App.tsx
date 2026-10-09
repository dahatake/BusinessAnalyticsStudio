import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { AiStatus } from '../ai/AiStatus';
import { AppShell } from '../components/AppShell';
import { BrandLockup } from '../components/Brand';
import { AnimationStatus } from '../motion/AnimationController';
import { runTransition } from '../motion/fluent';
import { useAnimation } from '../store/animation';
import { useEffectiveBrand } from '../theme/useBrand';
import { ErrorView, LoadingView } from '../components/StateViews';
import { SCREENS } from '../screens/registry';
import { usePackStore } from '../store/pack';
import { Opening } from './Opening';

export function App() {
  const state = usePackStore((s) => s.state);
  const load = usePackStore((s) => s.load);
  const [active, setActive] = useState<string>(SCREENS[0]?.key ?? '');
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

  const Screen = SCREENS.find((s) => s.key === active)?.component;
  const { name, projectName } = state.pack.data.customer;
  return (
    <>
      {!opened ? <Opening customerName={name} projectName={projectName} onDone={() => setOpened(true)} /> : null}
      <AppShell
        title={`${name} ${projectName}`}
        screens={SCREENS}
        activeKey={active}
        onSelect={(key) => runTransition(() => flushSync(() => setActive(key)), useAnimation.getState().playing)}
        headerExtra={<><AnimationStatus /><AiStatus /></>}
        brand={brand ? <BrandLockup brand={brand} customerName={name} /> : null}
      >
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
        {Screen ? <Screen /> : null}
      </AppShell>
    </>
  );
}
