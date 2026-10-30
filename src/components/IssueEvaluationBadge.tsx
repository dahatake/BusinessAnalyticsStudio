// 課題の評価値（優先順位など）を行に示すバッジ。値が更新されたら、いまの値から最新の値へ数値が遷移する（FR-070 AC-086、PARAM-133=2000ms 以内）。
// 遷移が終われば最新値だけを表示する。停止中・視差効果の軽減中は即時に最新値（useTweenedValue）。
import { Badge } from '@fluentui/react-components';
import { useT } from '../i18n';
import { useTweenedValue } from '../motion';
import { EVALUATION_LABELS } from '../analysis/model';
import type { Issue } from '../analysis/model';

function TweenedNumber({ value }: { value: number }) {
  const v = useTweenedValue(value);
  return <>{v === value ? String(value) : String(Math.round(v))}</>;
}

/** 優先順位が数値で設定されている課題だけ、バッジを出す（なければ何も描かない） */
export function IssueEvaluationBadge({ issue }: { issue: Pick<Issue, 'evaluation'> }) {
  const t = useT();
  const raw = (issue.evaluation as { priority?: { value: number | string } } | undefined)?.priority?.value;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return (
    <Badge appearance="outline" data-testid="issue-evaluation-badge">
      {t(EVALUATION_LABELS.priority)} <TweenedNumber value={n} />
    </Badge>
  );
}
