// 手書き文字の認識（FR-090）。認識の接続先（外部サービス）は Q-002 の推奨案 A に従い、初回はモックだけにして、
// 接続部品の差し替え口（setHandwritingRecognizer）だけを用意する。外部サービスには接続しない。
import type { Stroke } from './model';
import { tr } from '../i18n';

/** 認識結果として反映した項目に付けるラベル（AC-109）。 */
export const RECOGNIZED_LABEL = 'AI 生成（認識結果）';

export interface RecognitionResult {
  text: string;
  /** モックの結果か（接続先を設定していないとき true） */
  mock: boolean;
}

export interface HandwritingRecognizer {
  id: string;
  recognize: (strokes: readonly Stroke[]) => Promise<RecognitionResult>;
}

/** モックの認識器。同じ手書きには同じ結果を返す（画数と範囲から決まる）。 */
export const mockRecognizer: HandwritingRecognizer = {
  id: 'mock',
  recognize: async (strokes) => {
    const n = strokes.length;
    return { text: tr('手書きメモ（{n} 画。モックの認識結果）', { n }), mock: true };
  },
};

let current: HandwritingRecognizer = mockRecognizer;

/** 接続先を差し替える（null でモックに戻す）。認証情報はコードに書かず、呼ぶ側が環境設定から読む。 */
export function setHandwritingRecognizer(r: HandwritingRecognizer | null): void {
  current = r ?? mockRecognizer;
}

export function getHandwritingRecognizer(): HandwritingRecognizer {
  return current;
}

/** 選んだ手書きを認識する。ストロークがなければ null。 */
export async function recognizeHandwriting(strokes: readonly Stroke[]): Promise<RecognitionResult | null> {
  const ink = strokes.filter((k) => k.tool === 'pen' || k.tool === 'highlighter');
  if (ink.length === 0) return null;
  const r = await current.recognize(ink);
  const text = r.text.replace(/\s+/g, ' ').trim();
  return text === '' ? null : { ...r, text };
}
