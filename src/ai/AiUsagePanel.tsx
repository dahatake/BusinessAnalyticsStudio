// Foundry の利用量と上限（FR-276・FR-286）。今日の回数・今月の概算費用と、1 日の回数・月の予算・単価を確認・変更できる。
// 上げる変更（回数・予算）には確認を求め、下げる変更は確認なし。記録には文章・キーを含めない。
import { useState } from 'react';
import { Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, Text } from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { checkUsage, rollover, useUsageStore } from './foundryUsage';
import { tokens } from '../theme/tokens';
import { DEFAULT_PRICES, browserPriceStore, currentPrices, isValidPrices } from '../usecase/storyVideo';
import { useT } from '../i18n';

/** ストーリー動画の単価（PARAM-130・AC-784）。未入力のときは入力欄に既定の値を初期表示するだけで、実行には使わない */
function StoryVideoPriceSettings() {
  const t = useT();
  const saved = currentPrices();
  const [pin, setPin] = useState(String((saved ?? DEFAULT_PRICES).inPerM));
  const [pout, setPout] = useState(String((saved ?? DEFAULT_PRICES).outPerM));
  const [state, setState] = useState<string | null>(null);
  const save = () => {
    const p = { inPerM: Number(pin), outPerM: Number(pout) };
    if (pin.trim() === '' || pout.trim() === '' || !isValidPrices(p)) { setState(t('単価は 0 より大きい数で入力してください。')); return; }
    browserPriceStore.set(p);
    setState(t('単価を保存しました。'));
  };
  return (
    <div data-testid="story-video-prices" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <Text weight="semibold">{t('ストーリー動画の単価（{state}。入力すると作成を始められます）', { state: saved ? t('入力済み') : t('未入力') })}</Text>
      <Field label={t('ストーリー動画の単価・入力（円／100万トークン）')}><Input value={pin} inputMode="decimal" onChange={(_, d) => setPin(d.value)} /></Field>
      <Field label={t('ストーリー動画の単価・出力（円／100万トークン）')}><Input value={pout} inputMode="decimal" onChange={(_, d) => setPout(d.value)} /></Field>
      <div><Button appearance="secondary" onClick={save}>{t('単価を保存')}</Button></div>
      {state ? <Text size={200} role="status">{state}</Text> : null}
    </div>
  );
}

export function AiUsagePanel() {
  const t = useT();
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
  const status = !gate.allowed ? t('停止中') : gate.warning ? t('警告') : t('正常');
  const apply = (d: number, b: number) => {
    setLimits({ ...limits, dailyLimit: d, monthlyBudget: b, priceInPer1k: Number(priceIn), priceOutPer1k: Number(priceOut) });
    setMsg(t('保存しました。'));
  };
  const save = () => {
    const d = Number(daily);
    const b = Number(budget);
    const pi = Number(priceIn);
    const po = Number(priceOut);
    if (!Number.isInteger(d) || d < 0 || !Number.isFinite(b) || b < 0 || !Number.isFinite(pi) || pi < 0 || !Number.isFinite(po) || po < 0) { setMsg(t('回数は 0 以上の整数、予算・単価は 0 以上の数で入力してください。')); return; }
    if (d > limits.dailyLimit || b > limits.monthlyBudget) { setPending({ d, b }); return; }
    apply(d, b);
  };

  return (
    <section data-testid="ai-usage" aria-label={t('Microsoft Foundry の利用量と上限')} style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <Text weight="semibold">{t('Microsoft Foundry の利用量（チャット・現状の説明の合算。端末内の記録）')}</Text>
      <Text>{t('今日の回数: {n} / {limit} 回', { n: r.dayCount, limit: limits.dailyLimit })}</Text>
      <Text>{t('今月の回数: {n} 回 ／ 概算費用: {cost} 円 / 予算 {budget} 円', { n: r.monthCount, cost: Math.round(r.monthCost * 100) / 100, budget: limits.monthlyBudget })}</Text>
      <Text data-testid="ai-usage-tokens">{t('今月の利用量: 入力 {tin} トークン / 出力 {tout} トークン', { tin: r.monthTokensIn, tout: r.monthTokensOut })}</Text>
      <Text size={200} data-testid="ai-usage-disclaimer">{t('概算額は、端末内に記録した利用量と上の単価から計算した目安です。Azure の請求額ではありません。')}</Text>
      <Field label={t('1 日の回数の上限（回）')}>
        <Input value={daily} inputMode="numeric" onChange={(_, d) => setDaily(d.value)} />
      </Field>
      <Text data-testid="ai-usage-status">{t('状態: {status}（警告は予算の {warn}%、停止は {stop}% に達したとき）', { status, warn: limits.warnPercent, stop: limits.stopPercent })}{gate.allowed ? '' : ` ${gate.reason}`}</Text>
      <Field label={t('月の予算（円）')}>
        <Input value={budget} inputMode="numeric" onChange={(_, d) => setBudget(d.value)} />
      </Field>
      <Field label={t('単価・入力（円 / 1000 トークン）')}>
        <Input value={priceIn} inputMode="decimal" onChange={(_, d) => setPriceIn(d.value)} />
      </Field>
      <Field label={t('単価・出力（円 / 1000 トークン）')}>
        <Input value={priceOut} inputMode="decimal" onChange={(_, d) => setPriceOut(d.value)} />
      </Field>
      <div><Button appearance="secondary" onClick={save}>{t('保存')}</Button></div>
      <StoryVideoPriceSettings />
      <Dialog open={pending !== null} modalType="alert" onOpenChange={(_, d) => { if (!d.open) setPending(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('上限を上げますか（確認）')}</DialogTitle>
            <DialogContent>{t('上限を上げると、課金が増える可能性があります。変更しますか。')}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setPending(null); setMsg(t('変更しませんでした。')); }}>{t('キャンセル')}</Button>
              <Button appearance="primary" onClick={() => { if (pending) apply(pending.d, pending.b); setPending(null); }}>{t('上げる')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {msg ? <Text size={200} role="status">{msg}</Text> : null}
    </section>
  );
}


