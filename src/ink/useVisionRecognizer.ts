// 手書き認識の実接続の登録（FR-182）。実接続が有効なときだけ、認識器を Azure AI Vision（中継プロセス経由）に差し替える。
import { useEffect } from 'react';
import { tr } from '../i18n';
import { useAzure } from '../ai/useAzure';
import { recognizeViaRelay } from '../ai/azureClient';
import { confirmViaUi, gatePersonConfirm } from '../ai/personConfirm';
import { usePackStore } from '../store/pack';
import { setHandwritingRecognizer, type HandwritingRecognizer } from './handwriting';
import { strokesToPngBase64 } from './strokeImage';

export function useVisionRecognizer(): void {
  const { realEnabled, relayUrl, packId } = useAzure('vision');
  useEffect(() => {
    if (!realEnabled) { setHandwritingRecognizer(null); return undefined; }
    const r: HandwritingRecognizer = {
      id: 'azure-vision',
      recognize: async (strokes) => {
        const img = strokesToPngBase64(strokes);
        if (!img) throw new Error(tr('手書きを画像にできませんでした'));
        // FR-219 AC-377: 種別「人」を含む案件は、手書きの画像を送る前に確認を通す（最新の顧客パックを読む）
        const pack = usePackStore.getState().state;
        const data = pack.status === 'ready' ? pack.pack.data : undefined;
        const confirmPerson = data
          ? () => gatePersonConfirm({ destination: 'ai', scopeLabel: tr('手書き認識（選んだ手書きの線を画像にして Azure AI Vision へ送信）'), data, confirm: confirmViaUi })
          : undefined;
        const out = await recognizeViaRelay({ relayUrl, packId, ...(confirmPerson ? { confirmPerson } : {}) }, img, strokes.length);
        return { text: out.text, mock: out.mock };
      },
    };
    setHandwritingRecognizer(r);
    return () => setHandwritingRecognizer(null);
  }, [realEnabled, relayUrl, packId]);
}
