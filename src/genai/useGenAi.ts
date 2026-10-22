// 生成AIの活用分析の実接続の状態（FR-285）。独自の設定は持たず、共通接続（FR-275。設定画面の「Microsoft Foundry（生成AI機能の共通接続）」）に従う。
// 実接続にするには、共通接続が設定済みで、当該 Project で有効（中継プロセスの foundryEnabled）で、かつ了承の記録（FR-181）があること。
// 失敗は原因つきで表示し、モックの結果を代替にする。
import { usePackStore } from '../store/pack';
import { useConsent } from '../ai/useConsent';

// 旧「生成AIの活用分析」独自の設定（localStorage `edb.genai`）は廃止した（FR-285）。残っている旧データは破棄する
try { globalThis.localStorage?.removeItem('edb.genai'); } catch { /* 保管が使えない環境では何もしない */ }

/** 実接続の条件（共通接続が有効＋了承の記録）を満たすか。無効・了承なしは既定のモック */
export function isGenAiReal(packId: string, connectionEnabled: boolean, granted: boolean): boolean {
  return packId !== '' && connectionEnabled && granted;
}

export function useGenAi() {
  const pack = usePackStore((s) => s.state);
  const runtime = usePackStore((s) => s.runtime);
  const { granted, record } = useConsent();
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  return {
    packId, relayUrl: runtime.relayUrl, granted, consent: record,
    data: pack.status === 'ready' ? pack.pack.data : undefined,
  };
}
