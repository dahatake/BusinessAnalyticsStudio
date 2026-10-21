// 生成AIの活用分析の実接続の状態（FR-285）。AI の実接続（useAi）と同じく、確認を経て、起動中の顧客パックにだけ働く。
// 実接続にするには、設定で有効にし、かつ了承の記録（FR-181）があること。キーの有無は中継プロセスが決める（失敗は原因つきで表示し、モックの結果を代替にする）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePackStore } from '../store/pack';
import { useConsent } from '../ai/useConsent';
import { DEFAULT_FOUNDRY_DEPLOYMENT, DEFAULT_FOUNDRY_ENDPOINT } from './foundryClient';

interface GenAiState {
  /** 実接続を確認つきで有効にした顧客パック。null は未有効（既定のモック） */
  enabledPack: string | null;
  endpoint: string;
  deployment: string;
  setEnabledPack: (id: string | null) => void;
  setEndpoint: (v: string) => void;
  setDeployment: (v: string) => void;
}

export const useGenAiStore = create<GenAiState>()(
  persist(
    (set) => ({
      enabledPack: null,
      endpoint: DEFAULT_FOUNDRY_ENDPOINT,
      deployment: DEFAULT_FOUNDRY_DEPLOYMENT,
      setEnabledPack: (enabledPack) => set({ enabledPack }),
      setEndpoint: (endpoint) => set({ endpoint }),
      setDeployment: (deployment) => set({ deployment }),
    }),
    { name: 'edb.genai', version: 1, partialize: (s) => ({ enabledPack: s.enabledPack, endpoint: s.endpoint, deployment: s.deployment }) },
  ),
);

/** 実接続の条件（設定で有効＋了承の記録）を満たすか。別の顧客パック・了承なしは既定のモック */
export function isGenAiReal(packId: string, enabledPack: string | null, granted: boolean): boolean {
  return packId !== '' && enabledPack === packId && granted;
}

export function useGenAi() {
  const pack = usePackStore((s) => s.state);
  const runtime = usePackStore((s) => s.runtime);
  const enabledPack = useGenAiStore((s) => s.enabledPack);
  const endpoint = useGenAiStore((s) => s.endpoint);
  const deployment = useGenAiStore((s) => s.deployment);
  const { granted, record } = useConsent();
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  return {
    packId, relayUrl: runtime.relayUrl, endpoint, deployment, granted, consent: record,
    switchOn: packId !== '' && enabledPack === packId,
    realEnabled: isGenAiReal(packId, enabledPack, granted),
    data: pack.status === 'ready' ? pack.pack.data : undefined,
  };
}
