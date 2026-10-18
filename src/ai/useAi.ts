// AI 接続状態（モック／接続済み）。FR-011・FR-132。
// 実接続の有効化は、確認を経て、起動中の顧客パック（顧客名）に対してだけ働く。別の顧客パックでは既定のモックに戻る（A-15）。
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePackStore } from '../store/pack';
import { useConsent } from './useConsent';
import { probeRelay, setRelayConnection, type AiKind, type AiMode, type AiResult } from './client';
import { askAiWithPersonConfirm } from './personConfirm';

interface AiState {
  /** 実接続を確認つきで有効にした顧客パック。null は未有効 */
  enabledPackId: string | null;
  /** 直近の有効化・同期の失敗理由（画面に出す） */
  notice: string | null;
  setEnabledPackId: (id: string | null) => void;
  setNotice: (n: string | null) => void;
}

export const useAiStore = create<AiState>()(
  persist(
    (set) => ({
      enabledPackId: null,
      notice: null,
      setEnabledPackId: (enabledPackId) => set({ enabledPackId }),
      setNotice: (notice) => set({ notice }),
    }),
    { name: 'edb.ai', version: 1, partialize: (s) => ({ enabledPackId: s.enabledPackId }) },
  ),
);

export function useAi() {
  const pack = usePackStore((s) => s.state);
  const runtime = usePackStore((s) => s.runtime);
  const enabledPackId = useAiStore((s) => s.enabledPackId);
  const notice = useAiStore((s) => s.notice);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const { granted: consentGranted, record: consentRecord } = useConsent();
  // FR-181: 了承の記録がない案件は、有効にしていても実接続にしない（取消でモックに戻る）
  const realEnabled = packId !== '' && enabledPackId === packId && consentGranted;
  const mode: AiMode = realEnabled ? 'connected' : 'mock';

  const ask = useCallback(
    (kind: AiKind, prompt: string): Promise<AiResult> =>
      // FR-219: 実接続で種別「人」を含む顧客パックの内容を送る操作は、確認を通す（モックは送信がないので確認しない）
      askAiWithPersonConfirm({ kind, packId, prompt }, { relayUrl: runtime.relayUrl, mockDelayMs: runtime.aiMock?.delayMs, realEnabled },
        { data: pack.status === 'ready' ? pack.pack.data : undefined, consent: consentRecord }),
    [packId, runtime, realEnabled, pack, consentRecord],
  );

  /** 確認のあとに呼ぶ。中継プロセスが使える状態のときだけ「接続済み」になる。 */
  const enable = useCallback(async (): Promise<boolean> => {
    const { setEnabledPackId, setNotice } = useAiStore.getState();
    if (!consentGranted) { setNotice('顧客の了承の記録がないため、実接続を有効にできません。モックのまま動作します。'); return false; }
    const p = await probeRelay(runtime.relayUrl);
    if (!p.ok) { setNotice(`${p.reason}モックのまま動作します。`); return false; }
    if (!(await setRelayConnection(runtime.relayUrl as string, packId, true, undefined, true))) {
      setNotice('中継プロセスに接続を登録できませんでした。モックのまま動作します。');
      return false;
    }
    setNotice(null);
    setEnabledPackId(packId);
    return true;
  }, [runtime.relayUrl, packId, consentGranted]);

  const disable = useCallback(async (): Promise<void> => {
    const { setEnabledPackId, setNotice } = useAiStore.getState();
    setEnabledPackId(null);
    setNotice(null);
    if (runtime.relayUrl && packId) await setRelayConnection(runtime.relayUrl, packId, false);
  }, [runtime.relayUrl, packId]);

  return { mode, packId, realEnabled, notice, ask, enable, disable, relayUrl: runtime.relayUrl };
}

/** 起動時: 別の顧客パックの有効化は破棄してモックに戻し、同じ顧客パックなら中継プロセスに登録し直す（再起動で消えるため）。 */
export function useAiSync(): void {
  const { packId, realEnabled, relayUrl } = useAi();
  const enabledPackId = useAiStore((s) => s.enabledPackId);
  useEffect(() => {
    if (!packId) return;
    const { setEnabledPackId, setNotice } = useAiStore.getState();
    if (enabledPackId && !realEnabled) {
      // 別の顧客パック、または了承の記録がなくなった: モックに戻し、中継プロセスの登録も外す
      setEnabledPackId(null);
      if (relayUrl && enabledPackId === packId) void setRelayConnection(relayUrl, packId, false);
      return;
    }
    if (!realEnabled || !relayUrl) return;
    let cancelled = false;
    void (async () => {
      const ok = (await probeRelay(relayUrl)).ok && (await setRelayConnection(relayUrl, packId, true, undefined, true));
      if (!ok && !cancelled) { setEnabledPackId(null); setNotice('中継プロセスに接続できないため、モックに戻しました。'); }
    })();
    return () => { cancelled = true; };
  }, [packId, realEnabled, relayUrl, enabledPackId]);
}
