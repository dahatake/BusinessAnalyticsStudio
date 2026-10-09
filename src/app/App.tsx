import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ErrorView, LoadingView } from '../components/StateViews';
import { SCREENS } from '../screens/registry';
import { usePackStore } from '../store/pack';

export function App() {
  const state = usePackStore((s) => s.state);
  const load = usePackStore((s) => s.load);
  const [active, setActive] = useState<string>(SCREENS[0]?.key ?? '');

  useEffect(() => { void load(); }, [load]);

  if (state.status === 'loading') return <LoadingView label="顧客パックを読み込み中" />;
  if (state.status === 'error') {
    return (
      <ErrorView
        title="顧客パックを読み込めませんでした"
        messages={state.messages}
        action="public/data の JSON を、schema/ のスキーマに合わせて直してください。"
      />
    );
  }

  const Screen = SCREENS.find((s) => s.key === active)?.component;
  return (
    <AppShell title={state.pack.data.customer.projectName} screens={SCREENS} activeKey={active} onSelect={setActive}>
      {Screen ? <Screen /> : null}
    </AppShell>
  );
}
