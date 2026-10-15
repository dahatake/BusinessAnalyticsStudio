// 顧客の了承の記録の入力・表示（FR-181）。設定画面に置く。自己申告の記録で、個人名・連絡先は保存しない。
import { useState } from 'react';
import { Button, Field, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { downloadText } from '../analysis/exportFile';
import { CONSENT_EXPORT_FILE, CONSENT_EXPORT_GUIDE, CONSENT_SELF_DECLARED_NOTICE, buildConsentExport } from './consent';
import { useConsent, useConsentStore } from './useConsent';

// 無効のボタンは Fluent が forced-color-adjust: none を付ける。強制カラーでは OS の色で描かせる（FR-058 AC-071）
const useStyles = makeStyles({
  define: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto', ':disabled': { forcedColorAdjust: 'auto' }, ':disabled:hover': { forcedColorAdjust: 'auto' }, ':disabled:hover:active': { forcedColorAdjust: 'auto' } }, ':disabled': { forcedColorAdjust: 'auto' }, ':disabled:hover': { forcedColorAdjust: 'auto' }, ':disabled:hover:active': { forcedColorAdjust: 'auto' } },
    // 入力欄の本体にもフォーカスの輪郭を出す（NFR-A11Y-001 AC-170: フォーカスの位置が見える）
    inputFocus: { '&[data-fui-focus-visible]': { boxShadow: `0 0 0 ${tokens.strokeWidthThick} ${tokens.colorStrokeFocus2}` }, ':focus': { boxShadow: `0 0 0 ${tokens.strokeWidthThick} ${tokens.colorStrokeFocus2}` } },
  });

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ConsentSettings({ onRevoke }: { onRevoke: () => void | Promise<void> }) {
  const styles = useStyles();
  const { key, record } = useConsent();
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const r = useConsentStore.getState().save(key, date, note);
    if (r.ok) { setNote(''); setError(null); } else setError(r.reason);
  };
  const exportFile = () => {
    if (!record) return;
    downloadText(CONSENT_EXPORT_FILE, buildConsentExport(key, record), 'application/json');
  };
  const revoke = async () => {
    await onRevoke();
    useConsentStore.getState().revoke(key);
    setError(null);
  };

  return (
    <section aria-label="顧客の了承の記録" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Text weight="semibold">顧客の了承の記録（この案件）</Text>
      <Text size={200} data-testid="consent-notice">{CONSENT_SELF_DECLARED_NOTICE}</Text>
      <Text size={200} data-testid="consent-state">
        {record ? `了承あり（確認日 ${record.confirmedOn}）　確認した相手の役割と方法: ${record.note}` : '記録なし'}
      </Text>
      {record ? null : (
        <Text size={200} data-testid="consent-required">
          顧客の了承の記録がない間は、AI・音声・手書きの実接続を有効にできません（顧客情報は外部へ送信しません）。
        </Text>
      )}
      <Field label="了承を確認した日">
        <Input input={{ className: styles.inputFocus }} type="date" value={date} onChange={(_, d) => setDate(d.value)} disabled={!key} />
      </Field>
      <Field label="了承を確認した相手の役割と方法のメモ" hint="例: 顧客側の担当役員（口頭）。個人名・連絡先は書かないでください。">
        <Input input={{ className: styles.inputFocus }} value={note} onChange={(_, d) => setNote(d.value)} disabled={!key} maxLength={200} />
      </Field>
      {error ? <MessageBar intent="error" role="alert"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button className={styles.define} appearance="primary" disabled={!key} onClick={save}>了承の記録を保存</Button>
        <Button className={styles.define} disabled={!record} onClick={() => void revoke()}>了承の記録を取り消す</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Button className={styles.define} style={{ alignSelf: 'flex-start' }} disabled={!record} aria-describedby="consent-export-guide" onClick={exportFile}>了承の記録を consent.json として書き出す</Button>
        <Text size={200} id="consent-export-guide" data-testid="consent-export-guide">
          {record ? CONSENT_EXPORT_GUIDE : `了承の記録がないため書き出せません。先に了承の記録を保存してください。${CONSENT_EXPORT_GUIDE}`}
          {` ${CONSENT_SELF_DECLARED_NOTICE}`}
        </Text>
      </div>
    </section>
  );
}

