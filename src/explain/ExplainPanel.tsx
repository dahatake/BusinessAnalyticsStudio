// 「現状の説明」ボタンとサイドパネル（FR-274）。画面上部の読み取り専用のボタンを押すと、画面の横（ワークスペースの右）のサイドパネルに、
// 課題 → 解決策 → KPI/OKR への寄与の説明を出す。AI が使えないとき・上限・予算の停止では、決定的な代替説明に退避する（FR-277・FR-276）。
// 画面の本体は隠さない（ワークスペースと並べる）。Esc か「閉じる」で閉じて、焦点は「現状の説明」ボタンへ戻る。
import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Badge, Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Dismiss16Regular, Sparkle20Regular } from '@fluentui/react-icons';
import { askFoundry, fetchFoundryView } from '../ai/foundryClient';
import { consentKeyOf } from '../ai/consent';
import { useConsentStore } from '../ai/useConsent';
import { SCREENS } from '../screens/registry';
import { usePackStore } from '../store/pack';
import { buildSnapshot } from './model';
import { newSession, runExplain } from './run';
import { explainLimitsNow, explainUsageNow, setExplainUsage, toExplainLimits, toExplainUsage, useCurrentScreen, useExplainPanel } from './store';
import { useUsageStore } from '../ai/foundryUsage';
import { budgetLevel, rollover } from './usage';

const useStyles = makeStyles({
  row: { display: 'flex', flex: '1 1 auto', minHeight: 0, minWidth: 0 },
  body: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0, minHeight: 0 },
  panel: {
    flex: '0 0 auto',
    width: 'min(380px, 40%)',
    minWidth: '260px',
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    overflowY: 'auto',
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  head: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  grow: { flexGrow: 1 },
  text: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, fontFamily: 'inherit' },
});

const session = newSession();
let controller: AbortController | null = null;

const labelOf = (key: string): string => SCREENS.find((s) => s.key === key)?.label ?? 'ワークスペース';

/** 「現状の説明」を作る。読み取り専用（顧客パック・保存データには書かない）。書くのは利用量の記録だけ */
export async function triggerExplain(): Promise<void> {
  const panel = useExplainPanel.getState();
  panel.setOpen(true);
  const pack = usePackStore.getState().state;
  if (pack.status !== 'ready') return;
  const screenKey = useCurrentScreen.getState().key || 'workspace';
  const snapshot = buildSnapshot(pack.pack.data, screenKey, labelOf(screenKey));
  const relayUrl = usePackStore.getState().runtime.relayUrl;
  const packId = pack.pack.data.customer.name;
  const consent = !!useConsentStore.getState().records[consentKeyOf(pack.pack.data.customer.name, pack.pack.data.customer.projectName)];
  controller = new AbortController();
  panel.setRunning(true);
  const outcome = await runExplain({
    now: () => new Date(),
    limits: explainLimitsNow,
    usage: { get: explainUsageNow, set: setExplainUsage },
    consent,
    fetchView: () => fetchFoundryView(relayUrl, packId),
    ask: (req) => askFoundry(relayUrl, { packId, ...req }),
  }, session, snapshot, controller.signal);
  useExplainPanel.getState().setRunning(false);
  const prev = useExplainPanel.getState().result;
  if (outcome.kind === 'wait' || outcome.kind === 'busy') {
    useExplainPanel.getState().setResult(prev && prev.screenKey === screenKey ? { ...prev, notice: outcome.message } : { screenKey, outcome, notice: outcome.message });
    return;
  }
  useExplainPanel.getState().setResult({ screenKey, outcome });
}

export function ExplainButton() {
  const open = useExplainPanel((s) => s.open);
  return (
    <Button
      data-testid="explain-button"
      size="small"
      icon={<Sparkle20Regular />}
      aria-expanded={open}
      aria-controls={open ? 'explain-panel' : undefined}
      onClick={() => void triggerExplain()}
    >現状の説明</Button>
  );
}

function closePanel(): void {
  controller?.abort();
  useExplainPanel.getState().setRunning(false);
  useExplainPanel.getState().setOpen(false);
  document.querySelector<HTMLElement>('[data-testid="explain-button"]')?.focus();
}

function Panel() {
  const s = useStyles();
  const result = useExplainPanel((st) => st.result);
  const running = useExplainPanel((st) => st.running);
  const screenKey = useCurrentScreen((st) => st.key) || 'workspace';
  const usage = toExplainUsage(useUsageStore((st) => st.record));
  const limits = toExplainLimits(useUsageStore((st) => st.limits));
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePanel(); }
  };
  const stale = !!result && result.screenKey !== screenKey;
  const o = result?.outcome;
  const level = budgetLevel(rollover(usage, new Date()), limits);
  const warn = o && 'warning' in o ? o.warning : level !== 'ok' ? '概算の費用が予算の警告の割合に達しています（設定画面で確認できます）。' : undefined;
  let body: ReactNode;
  if (running) body = <Text role="status">生成しています…（「中止」で止められます）</Text>;
  else if (!result) body = <Text>「現状の説明」ボタンで説明を作ります。</Text>;
  else if (stale) body = <Text data-testid="explain-body">画面が切り替わりました。この画面（{labelOf(screenKey)}）の情報で説明を作り直すには「作り直す」を押してください。前の画面の説明は表示しません。</Text>;
  else if (o?.kind === 'ai') {
    body = (
      <>
        <Badge data-testid="ai-generated-label" appearance="tint" color="brand">AI 生成</Badge>
        <pre data-testid="explain-body" className={s.text}>{o.text}</pre>
      </>
    );
  } else if (o?.kind === 'fallback') {
    body = (
      <>
        <Text data-testid="explain-reason" weight="semibold">AI は使えません: {o.reasonText}</Text>
        <pre data-testid="explain-body" className={s.text}>{o.text}</pre>
      </>
    );
  } else if (o?.kind === 'cancelled') body = <Text data-testid="explain-body">生成を中止しました。</Text>;
  else body = <Text data-testid="explain-body">{result?.notice ?? ''}</Text>;
  const truncated = !stale && !running && o && 'truncated' in o && o.truncated;
  return (
    <aside
      ref={ref}
      id="explain-panel"
      data-testid="explain-panel"
      data-screen={screenKey}
      aria-label="現状の説明（サイドパネル）"
      tabIndex={-1}
      className={s.panel}
      onKeyDown={onKey}
    >
      <div className={s.head}>
        <Text as="h2" size={400} weight="semibold" className={s.grow}>現状の説明 — {labelOf(screenKey)}</Text>
        {running ? <Button size="small" onClick={() => controller?.abort()}>中止</Button> : null}
        <Button size="small" icon={<Dismiss16Regular />} onClick={closePanel}>閉じる</Button>
      </div>
      {result?.notice && !running ? <Text role="status" data-testid="explain-notice">{result.notice}</Text> : null}
      {warn ? <Text role="alert" data-testid="explain-warning">警告: {warn}</Text> : null}
      {truncated ? <Text role="status" data-testid="explain-truncated">入力が上限（{limits.inputMaxTokens} トークン）を超えるため、表示中の情報を切り詰めて送りました。</Text> : null}
      {body}
      {stale && !running ? <div><Button appearance="primary" size="small" onClick={() => void triggerExplain()}>作り直す</Button></div> : null}
    </aside>
  );
}

/** ワークスペースの横にサイドパネルを並べる（本体を隠さない）。いま見ている画面（フォーカスしたコンポーネント）も追う */
export function ExplainHost({ children }: { children: ReactNode }) {
  const s = useStyles();
  const open = useExplainPanel((st) => st.open);
  const track = useCallback((e: Event) => {
    const el = (e.target as HTMLElement | null)?.closest?.('[data-testid^="component-"]');
    const key = el?.getAttribute('data-testid')?.slice('component-'.length);
    if (key && key !== 'settings') useCurrentScreen.getState().set(key);
  }, []);
  useEffect(() => {
    document.addEventListener('focusin', track);
    document.addEventListener('pointerdown', track, true);
    return () => { document.removeEventListener('focusin', track); document.removeEventListener('pointerdown', track, true); };
  }, [track]);
  return (
    <div className={s.row}>
      <div className={s.body}>{children}</div>
      {open ? <Panel /> : null}
    </div>
  );
}

