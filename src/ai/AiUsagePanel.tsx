// Foundry の利用量と上限（FR-276・FR-286）。今日の回数・今月の概算費用と、1 日の回数・月の予算・単価を確認・変更できる。
// 上げる変更（回数・予算）には確認を求め、下げる変更は確認なし。記録には文章・キーを含めない。
import { useState } from 'react';
import { Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, Text } from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { checkUsage, rollover, useUsageStore } from './foundryUsage';
import { tokens } from '../theme/tokens';

export function AiUsagePanel() {
  const limits = useUsageStore((s) => s.limits);
  const record = useUsageStore((s) => s.record);
  const setLimits = useUsageStore((s) => s.setLimits);
  const r = rollover(record, new Date());
  const [daily, setDaily] = useState(String(limits.dailyLimit));
  const [budget, setBudget] = useState(String(limits.monthlyBudget));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<{ d: number; b: number } | null>(null);
  const [priceIn, setPriceIn] = useState(String(limits.priceInPer1k));
  const [priceOut, setPriceOut] = useState(String(limits.priceOutPer1k));
  const gate = checkUsage(record, limits, new Date());
  const status = !gate.allowed ? '停止中' : gate.warning ? '警告' : '正常';
  const apply = (d: number, b: number) => {
    setLimits({ ...limits, dailyLimit: d, monthlyBudget: b, priceInPer1k: Number(priceIn), priceOutPer1k: Number(priceOut) });
    setMsg('保存しました。');
  };
  const save = () => {
    const d = Number(daily);
    const b = Number(budget);
    const pi = Number(priceIn);
    const po = Number(priceOut);
    if (!Number.isInteger(d) || d < 0 || !Number.isFinite(b) || b < 0 || !Number.isFinite(pi) || pi < 0 || !Number.isFinite(po) || po < 0) { setMsg('回数は 0 以上の整数、予算・単価は 0 以上の数で入力してください。'); return; }
    if (d > limits.dailyLimit || b > limits.monthlyBudget) { setPending({ d, b }); return; }
    apply(d, b);
  };

  return (
    <section data-testid="ai-usage" aria-label="Microsoft Foundry の利用量と上限" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <Text weight="semibold">Microsoft Foundry の利用量（チャット・現状の説明の合算。端末内の記録）</Text>
      <Text>今日の回数: {r.dayCount} / {limits.dailyLimit} 回</Text>
      <Text>今月の回数: {r.monthCount} 回 ／ 概算費用: {Math.round(r.monthCost * 100) / 100} 円 / 予算 {limits.monthlyBudget} 円</Text>
      <Field label="1 日の回数の上限（回）">
        <Input value={daily} inputMode="numeric" onChange={(_, d) => setDaily(d.value)} />
      </Field>
      <Text data-testid="ai-usage-status">状態: {status}（警告は予算の {limits.warnPercent}%、停止は {limits.stopPercent}% に達したとき）{gate.allowed ? '' : ` ${gate.reason}`}</Text>
      <Field label="月の予算（円）">
        <Input value={budget} inputMode="numeric" onChange={(_, d) => setBudget(d.value)} />
      </Field>
      <Field label="単価・入力（円 / 1000 トークン）">
        <Input value={priceIn} inputMode="decimal" onChange={(_, d) => setPriceIn(d.value)} />
      </Field>
      <Field label="単価・出力（円 / 1000 トークン）">
        <Input value={priceOut} inputMode="decimal" onChange={(_, d) => setPriceOut(d.value)} />
      </Field>
      <div><Button appearance="secondary" onClick={save}>保存</Button></div>
      <Dialog open={pending !== null} modalType="alert" onOpenChange={(_, d) => { if (!d.open) setPending(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>上限を上げますか（確認）</DialogTitle>
            <DialogContent>上限を上げると、課金が増える可能性があります。変更しますか。</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setPending(null); setMsg('変更しませんでした。'); }}>キャンセル</Button>
              <Button appearance="primary" onClick={() => { if (pending) apply(pending.d, pending.b); setPending(null); }}>上げる</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {msg ? <Text size={200} role="status">{msg}</Text> : null}
    </section>
  );
}


