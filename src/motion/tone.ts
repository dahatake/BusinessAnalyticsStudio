// ブランドトーンの演出への反映（FR-063）。純粋な関数だけで構成する（画面や状態に依存しない）。
// トーンは自由な文字列（brand-profile.json の tone.value）なので、キーワードで 3 つの分類のどれかに寄せ、分類ごとに演出の設定値を定義する。

/** 演出強度（FR-083）。Executive は控えめ、Entertainment は最も賑やか */
export const INTENSITIES = ['Executive', 'Showcase', 'Entertainment'] as const;
export type Intensity = (typeof INTENSITIES)[number];

/** トーンの分類 */
export type ToneCategory = 'calm' | 'innovative' | 'friendly';

/** BGM の曲調（手続き生成の BGM が参照する。FR-073） */
export type BgmMood = 'quiet-ambient' | 'driving-electronic' | 'warm-acoustic';

/** テロップの文体（FR-078）。formal=です・ます調、concise=体言止め、friendly=やわらかい口調 */
export type CaptionStyle = 'formal' | 'concise' | 'friendly';

export interface MotionProfile {
  category: ToneCategory;
  /** 演出強度の既定値（利用者が切り替えるまでの値） */
  defaultIntensity: Intensity;
  bgmMood: BgmMood;
  /** モーションのテンポ。時間（ms）に掛ける倍率。1 より大きいほどゆっくり */
  tempo: number;
  captionStyle: CaptionStyle;
}

/** 分類ごとの設定値の定義 */
export const MOTION_PROFILES: Record<ToneCategory, MotionProfile> = {
  calm: { category: 'calm', defaultIntensity: 'Executive', bgmMood: 'quiet-ambient', tempo: 1.25, captionStyle: 'formal' },
  innovative: { category: 'innovative', defaultIntensity: 'Showcase', bgmMood: 'driving-electronic', tempo: 1, captionStyle: 'concise' },
  friendly: { category: 'friendly', defaultIntensity: 'Entertainment', bgmMood: 'warm-acoustic', tempo: 0.85, captionStyle: 'friendly' },
};

/** 分類のキーワード。何も当てはまらないときは、Microsoft 標準の「先進的」にする（FR-123 の既定のトーンと同じ） */
const KEYWORDS: Record<ToneCategory, readonly string[]> = {
  calm: ['誠実', '精密', '落ち着', '堅実', '信頼', '重厚', '安定', '上品'],
  friendly: ['親しみ', 'やわらか', '柔らか', 'カジュアル', '温か', '明る', '楽し', 'フレンドリー'],
  innovative: ['先進', '革新', '挑戦', 'スマート', 'モダン', '未来'],
};
export const DEFAULT_TONE_CATEGORY: ToneCategory = 'innovative';

/** トーンの文字列を分類にする。複数のキーワードがあるときは、文字列の中で最初に現れたものに従う */
export function classifyTone(tone: string | undefined | null): ToneCategory {
  if (!tone) return DEFAULT_TONE_CATEGORY;
  let best: { cat: ToneCategory; at: number } | null = null;
  for (const cat of Object.keys(KEYWORDS) as ToneCategory[]) {
    for (const k of KEYWORDS[cat]) {
      const at = tone.indexOf(k);
      if (at >= 0 && (best === null || at < best.at)) best = { cat, at };
    }
  }
  return best ? best.cat : DEFAULT_TONE_CATEGORY;
}

/** ブランドトーンから、演出強度の既定値・BGM の曲調・モーションのテンポ・テロップの文体を決める */
export function motionProfileForTone(tone: string | undefined | null): MotionProfile {
  return MOTION_PROFILES[classifyTone(tone)];
}

/** 利用者が選んだ演出強度（なければトーンの既定値）。保存された値が壊れているときも既定値に戻す */
export function resolveIntensity(chosen: Intensity | null | undefined, profile: MotionProfile): Intensity {
  return chosen && (INTENSITIES as readonly string[]).includes(chosen) ? chosen : profile.defaultIntensity;
}
