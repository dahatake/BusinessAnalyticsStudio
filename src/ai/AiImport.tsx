// 取り込み画面の「AI 取り込み」（FR-289）。Foundry の設定済み・実接続の有効化・了承の記録がそろうときだけ選べる。
// 欠けるときは無効にして、欠けている条件と設定画面への案内を示す（呼び出し 0 回）。送信前に費用と送信内容の確認を求め、
// 取り込んだ内容はプレビューで確認してから反映する（確認前に既存のデータを変えない）。API キーはこの画面に来ない（中継プロセスだけが持つ）。
import { useEffect, useState } from 'react';
import { Button, DialogActions, DialogBody, DialogContent, DialogTitle, MessageBar, MessageBarBody, Text } from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { usePackStore } from '../store/pack';
import { useDataCatalog } from '../store/datacatalog';
import { useConsent } from './useConsent';
import { FOUNDRY_CHANGED_EVENT, fetchFoundryView, type FoundryView } from './foundryClient';
import { AI_SCOPE_LABEL, confirmViaUi, consentOf, countPersons, gatePersonConfirm } from './personConfirm';
import {
  AI_IMPORT_MAX_MB, aiImportAvailability, browserUsageStore, budgetState, checkSize, currentUsage, estimateCostYen, recordCall, requestAiImport,
  type ImportEntity, type UsageStore,
} from './aiImportLogic';
import { tokens } from '../theme/tokens';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.txt,.md,.log,application/pdf,image/*,text/*';

export function AiImport({ projectId, store = browserUsageStore, onApplied }: { projectId: string | null; store?: UsageStore; onApplied?: (msg: string) => void }) {
  const relayUrl = usePackStore((s) => s.runtime.relayUrl);
  const pack = usePackStore((s) => s.state);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const { granted } = useConsent();
  const importCatalog = useDataCatalog((x) => x.importCatalog);
  const [view, setView] = useState<FoundryView | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ file: File; entities: ImportEntity[] } | null>(null);

  useEffect(() => {
    let alive = true;
    // 表示するたび・設定の変更時・画面に戻ったときに取得し直す（古い状態のまま選べない／選べないままにしない）
    const load = (): void => { void fetchFoundryView(relayUrl, packId).then((v) => { if (alive) setView(v); }); };
    load();
    const onVisible = (): void => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener(FOUNDRY_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener(FOUNDRY_CHANGED_EVENT, load);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [relayUrl, packId]);

  const avail = aiImportAvailability(view, granted);
  // 条件が欠けたら、選択中の状態も閉じる（送信しない）
  useEffect(() => { if (!avail.available) { setChoosing(false); setPending(null); } }, [avail.available]);

  const onPick = (file: File | undefined): void => {
    setError(''); setNotice('');
    if (!file || !avail.available) return;
    const size = checkSize(file.size);
    if (!size.ok) { setPreview(null); setError(size.message); return; }
    const b = budgetState(currentUsage(store, new Date()), estimateCostYen(file.size));
    if (b.state === 'stop') { setPreview(null); setError(b.message); return; }
    if (b.state === 'warn') setNotice(b.message);
    setPending(file); // 送る前の確認（費用・送信されるもの）。確認するまで送らない
  };

  const send = async (file: File): Promise<void> => {
    setPending(null);
    if (pack.status !== 'ready') return;
    const personCount = countPersons(pack.pack.data);
    const gate = await gatePersonConfirm({
      destination: 'ai', scopeLabel: `${AI_SCOPE_LABEL}（AI 取り込みのファイル「${file.name}」の内容。個人情報が含まれうる）`,
      data: pack.pack.data, consent: consentOf(pack.pack.data), confirm: confirmViaUi,
    });
    if (!gate.allowed) { setError(gate.reason ?? '送信しませんでした。'); return; }
    setBusy(true);
    try {
      recordCall(store, new Date(), estimateCostYen(file.size)); // 失敗した呼び出しも概算に算入する（FR-276・安全側）
      const r = await requestAiImport(relayUrl, { packId, file, consent: granted, includesPerson: personCount > 0, personConfirmed: true });
      if (r.ok) { setPreview({ file, entities: r.entities }); setError(''); } else { setPreview(null); setError(r.message); }
    } finally {
      setBusy(false);
    }
  };

  const apply = (): void => {
    if (!preview || !projectId) return;
    const text = JSON.stringify({ entities: preview.entities });
    const r = importCatalog(projectId, text, `${preview.file.name}.json`, text.length);
    if (r.ok) { setPreview(null); setError(''); onApplied?.(`${preview.file.name} から AI 取り込みで ${r.count} 件の項目を反映しました。`); } else setError(r.errors.join(' '));
  };

  return (
    <section data-testid="ai-import" aria-label="AI 取り込み" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <Text as="h3" weight="semibold">AI 取り込み（Microsoft Foundry）</Text>
      <Text size={200}>
        PDF・画像・Office 文書・非定型テキストを、生成 AI で読み取って取り込みます。Foundry は有料サービスで費用が発生し、選んだファイルの内容が、
        ローカルの中継プロセスを通じて Foundry に送信されます（1 件 {AI_IMPORT_MAX_MB} MB まで）。取り込んだ内容はプレビューで確認してから反映します。
      </Text>
      <div>
        <Button appearance="secondary" disabled={!avail.available || busy} aria-disabled={!avail.available} onClick={() => setChoosing(true)}>AI 取り込み</Button>
      </div>
      {!avail.available ? <Text size={200} data-testid="ai-import-guide" role="note">{avail.guide}</Text> : null}
      {avail.available && choosing ? (
        <div>
          <label htmlFor="ai-import-file">AI 取り込みのファイル</label>{' '}
          <input id="ai-import-file" type="file" accept={ACCEPT} disabled={busy} onChange={(ev) => { onPick(ev.target.files?.[0]); ev.target.value = ''; }} />
        </div>
      ) : null}
      {notice ? <Text role="status">{notice}</Text> : null}
      {busy ? <Text role="status">Foundry に送信して読み取っています…</Text> : null}
      {error ? <MessageBar intent="error" layout="multiline" role="alert"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
      {preview ? (
        <section role="region" aria-label="取り込みのプレビュー" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS }}>
          <Text weight="semibold">{preview.file.name} から {preview.entities.length} 件を読み取りました。反映するまで、既存のデータは変わりません。</Text>
          <ul>{preview.entities.map((e, i) => <li key={i}><b>{e.name}</b>{e.description ? `: ${e.description}` : ''}</li>)}</ul>
          <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
            <Button appearance="primary" onClick={apply}>反映</Button>
            <Button appearance="secondary" onClick={() => setPreview(null)}>破棄</Button>
          </div>
        </section>
      ) : null}
      <Dialog open={!!pending} modalType="alert" onOpenChange={(_, d) => { if (!d.open) setPending(null); }}>
        <DialogSurface aria-label="AI 取り込みの送信前の確認">
          <DialogBody>
            <DialogTitle>ファイルを Foundry に送信しますか</DialogTitle>
            <DialogContent>
              Microsoft Foundry は有料サービスで、費用が発生します（概算は今月の予算に算入します）。
              送信されるのは、選んだファイル「{pending?.name}」の内容です。ファイルに個人情報が含まれうる場合は、顧客の了承の範囲で送ってください。
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPending(null)}>キャンセル</Button>
              <Button appearance="primary" onClick={() => { if (pending) void send(pending); }}>送信する</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}
