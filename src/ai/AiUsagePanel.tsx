// Foundry の利用量と上限（FR-276・FR-286）。今日の回数・今月の概算費用と、1 日の回数・月の予算・単価を確認・変更できる。
// 上げる変更（回数・予算）には確認を求め、下げる変更は確認なし。記録には文章・キーを含めない。
import { useState } from 'react';
import { Button, Field, Input, Text } from '@fluentui/react-components';
import { rollover, useUsageStore } from './foundryUsage';
import { tokens } from '../theme/tokens';

export function AiUsagePanel() {
  const limits = useUsageStore((s) => s.limits);
  const record = useUsageStore((s) => s.record);
  const setLimits = useUsageStore((s) => s.setLimits);
  const r = rollover(record, new Date());
  const [daily, setDaily] = useState(String(limits.dailyLimit));
  const [budget, setBudget] = useState(String(limits.monthlyBudget));
  const [msg, setMsg] = useState<string | null>(null);

  const save = () => {
    const d = Number(daily);
    const b = Number(budget);
    if (!Number.isInteger(d) || d < 0 || !Number.isFinite(b) || b < 0) { setMsg('回数は 0 以上の整数、予算は 0 以上の数で入力してください。'); return; }
    if ((d > limits.dailyLimit || b > limits.monthlyBudget) && !window.confirm('上限を上げると、課金が増える可能性があります。変更しますか。')) { setMsg('変更しませんでした。'); return; }
    setLimits({ ...limits, dailyLimit: d, monthlyBudget: b });
    setMsg('保存しました。');
  };

  return (
    <section data-testid="ai-usage" aria-label="Microsoft Foundry の利用量と上限" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <Text weight="semibold">Microsoft Foundry の利用量（チャット・現状の説明の合算。端末内の記録）</Text>
      <Text>今日の回数: {r.dayCount} / {limits.dailyLimit} 回</Text>
      <Text>今月の回数: {r.monthCount} 回 ／ 概算費用: {Math.round(r.monthCost * 100) / 100} 円 / 予算 {limits.monthlyBudget} 円</Text>
      <Field label="1 日の回数の上限（回）">
        <Input value={daily} inputMode="numeric" onChange={(_, d) => setDaily(d.value)} />
      </Field>
      <Field label="月の予算（円）">
        <Input value={budget} inputMode="numeric" onChange={(_, d) => setBudget(d.value)} />
      </Field>
      <div><Button appearance="secondary" onClick={save}>保存</Button></div>
      {msg ? <Text size={200} role="status">{msg}</Text> : null}
    </section>
  );
}
