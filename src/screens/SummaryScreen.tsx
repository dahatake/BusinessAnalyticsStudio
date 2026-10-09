// エグゼクティブサマリー（FR-041）の単独のコンポーネント。経営層の既定のレイアウトで、上段に置く。
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { Panel } from '../components/Panel';
import { LoadingView } from '../components/StateViews';
import { usePackStore } from '../store/pack';

function SummaryScreen() {
  const ready = usePackStore((s) => s.state.status === 'ready');
  if (!ready) return <LoadingView label="サマリーを読み込み中" />;
  return (
    <Panel testId="component-summary" title="サマリー" description="結論・根拠の数値・推奨アクションを、データから自動で更新します。">
      <ExecutiveSummary scope="overview" />
    </Panel>
  );
}

export { SummaryScreen };
