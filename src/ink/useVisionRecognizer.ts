// 手書き認識の実接続の登録（FR-182）。実接続が有効なときだけ、認識器を Azure AI Vision（中継プロセス経由）に差し替える。
import { useEffect } from 'react';
import { useAzure } from '../ai/useAzure';
import { recognizeViaRelay } from '../ai/azureClient';
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
        if (!img) throw new Error('手書きを画像にできませんでした');
        const out = await recognizeViaRelay({ relayUrl, packId }, img, strokes.length);
        return { text: out.text, mock: out.mock };
      },
    };
    setHandwritingRecognizer(r);
    return () => setHandwritingRecognizer(null);
  }, [realEnabled, relayUrl, packId]);
}
