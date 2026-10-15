// 音声合成・手書き認識の実接続の状態（FR-182）。AI の実接続（useAi）と同じく、確認を経て、起動中の顧客パックにだけ働く。
// 実接続にするには、設定で有効にし、かつ了承の記録（FR-181）があり、かつ中継プロセスがキーを持っていること。
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePackStore } from '../store/pack';
import { useConsent } from './useConsent';
import { setAzureConnection, type AzureFeature } from './azureClient';

interface AzureState {
  /** 機能ごとに、実接続を確認つきで有効にした顧客パック */
  enabled: Record<AzureFeature, string | null>;
  /** 画面に出す通知（キーの値を含まない） */
  notice: Record<AzureFeature, string | null>;
  /** 中継プロセスが実際に接続済みにした（キーあり）機能。再読み込みで消える */
  connected: Record<AzureFeature, boolean>;
  set: (f: AzureFeature, packId: string | null) => void;
  setNotice: (f: AzureFeature, n: string | null) => void;
  setConnected: (f: AzureFeature, c: boolean) => void;
}

const none = { speech: null, vision: null } as const;

export const useAzureStore = create<AzureState>()(
  persist(
    (set) => ({
      enabled: { ...none },
      notice: { ...none },
      connected: { speech: false, vision: false },
      set: (f, packId) => set((s) => ({ enabled: { ...s.enabled, [f]: packId } })),
      setNotice: (f, n) => set((s) => ({ notice: { ...s.notice, [f]: n } })),
      setConnected: (f, c) => set((s) => ({ connected: { ...s.connected, [f]: c } })),
    }),
    { name: 'edb.azure', version: 1, partialize: (s) => ({ enabled: s.enabled }) },
  ),
);

export function useAzure(feature: AzureFeature) {
  const pack = usePackStore((s) => s.state);
  const runtime = usePackStore((s) => s.runtime);
  const enabledPack = useAzureStore((s) => s.enabled[feature]);
  const connected = useAzureStore((s) => s.connected[feature]);
  const notice = useAzureStore((s) => s.notice[feature]);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const { granted } = useConsent();
  /** 有効化の条件（設定・了承）を満たしている。キーの有無は中継プロセスが決め、connected に反映する */
  const realEnabled = packId !== '' && enabledPack === packId && granted && connected;

  const enable = useCallback(async (): Promise<boolean> => {
    const st = useAzureStore.getState();
    if (!granted) { st.setNotice(feature, '顧客の了承の記録がないため、実接続を有効にできません。モックのまま動作します。'); return false; }
    const r = await setAzureConnection(runtime.relayUrl, feature, packId, true, true);
    st.set(feature, packId);
    st.setConnected(feature, r.ok && r.mode === 'connected');
    st.setNotice(feature, r.ok && r.mode === 'connected' ? null : `${r.reason ?? 'モックのまま動作します。'}`);
    return r.ok && r.mode === 'connected';
  }, [feature, granted, packId, runtime.relayUrl]);

  const disable = useCallback(async (): Promise<void> => {
    const st = useAzureStore.getState();
    st.set(feature, null);
    st.setConnected(feature, false);
    st.setNotice(feature, null);
    if (runtime.relayUrl && packId) await setAzureConnection(runtime.relayUrl, feature, packId, false, false);
  }, [feature, packId, runtime.relayUrl]);

  return { feature, packId, relayUrl: runtime.relayUrl, enabledPack, switchOn: packId !== '' && enabledPack === packId, realEnabled, notice, enable, disable, granted };
}

/** 起動時・案件の切替時・了承の取消時の同期。別の案件・了承なしなら無効に戻し、同じ案件なら中継プロセスに登録し直す */
export function useAzureSync(): void {
  for (const f of ['speech', 'vision'] as const) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAzureSyncOne(f);
  }
}

function useAzureSyncOne(feature: AzureFeature): void {
  const { packId, switchOn, granted, relayUrl, enabledPack } = useAzure(feature);
  useEffect(() => {
    if (!packId) return;
    const st = useAzureStore.getState();
    if (enabledPack && !(switchOn && granted)) {
      st.set(feature, null); st.setConnected(feature, false);
      if (relayUrl && enabledPack === packId) void setAzureConnection(relayUrl, feature, packId, false, false);
      return;
    }
    if (!switchOn || !relayUrl) return;
    let cancelled = false;
    void setAzureConnection(relayUrl, feature, packId, true, true).then((r) => {
      if (!cancelled) st.setConnected(feature, r.ok && r.mode === 'connected');
    });
    return () => { cancelled = true; };
  }, [feature, packId, switchOn, granted, relayUrl, enabledPack]);
}
