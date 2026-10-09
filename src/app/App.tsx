import { useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { ErrorView, LoadingView } from '../components/StateViews';
import { SCREENS } from '../screens/registry';
import { setAvailableComponents, useLayout } from '../store/layout';
import { usePackStore } from '../store/pack';
import { Dock, PersonaMenu, ResetLayoutButton } from '../workspace/Controls';
import { Workspace } from '../workspace/Workspace';

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

  return (
    <AppShell
      title={state.pack.data.customer.projectName}
      screens={SCREENS}
      onSelect={openComponent}
      actions={<><PersonaMenu /><ResetLayoutButton /></>}
      dock={<Dock screens={SCREENS} />}
    >
      <Workspace screens={SCREENS} />
    </AppShell>
  );
}
