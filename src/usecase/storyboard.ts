// ストーリーボード（FR-163〜FR-166）の純関数。ユースケース（FR-158）のユーザーストーリーから、再生用のシーンを端末内だけで作る。AI には接続しない。
import { signature, type Checked, type UseCaseDraft } from './model';

/** 再生の目標の長さ（PARAM-052。ミリ秒）。許容の幅は ±PARAM-053（5 秒） */
export const TARGET_MS = 30_000;
/** 強調テロップの最大文字数（PARAM-054） */
export const TELOP_MAX = 20;

export type StoryKind = 'intro' | 'step' | 'effect';
/** 1 シーン。字幕は読み上げる文と同じ文言。強調テロップは `*語*` で強調する語を囲む */
export interface StoryScene { kind: StoryKind; heading: string; caption: string; telop: string }
export interface Storyboard { scenes: StoryScene[]; /** 作成時のユースケースの署名。変わると「古い」 */ signature: string; createdAt: string }
/** 作成状態: 未作成→最新→古い */
export type StoryboardState = 'none' | 'latest' | 'stale';

export const STYLES = ['3D', 'アニメ', 'Geometric 3D', 'Isometric 3D', 'Whimsical 3D'] as const;
export type StoryStyle = (typeof STYLES)[number];
/** 既定のスタイル（FR-166） */
export const DEFAULT_STYLE: StoryStyle = 'Isometric 3D';

/** 再生の演出強度の既定（FR-164 AC-320）。企業向けの Executive ではなく、明るく楽しい Entertainment で始める（FR-016 の既存の見せ方は別の入口） */
export const DEFAULT_STORY_INTENSITY = 'Entertainment' as const;
export const isStyle = (x: unknown): x is StoryStyle => typeof x === 'string' && (STYLES as readonly string[]).includes(x);
/** 3D を描くスタイル（WebGL が使えないときは 2D の表現に切り替える） */
export const is3dStyle = (s: StoryStyle): boolean => s !== 'アニメ';

const clip = (t: string, n: number): string => {
  const a = Array.from(t.replace(/\s+/g, ' ').trim());
  return a.length <= n ? a.join('') : `${a.slice(0, n - 1).join('')}…`;
};

/** テロップの `*` を除いた表示上の文字（文字数の数え方） */
export const telopPlain = (t: string): string => t.replace(/\*/g, '');
/** テロップを通常部分と強調部分に分ける（`*語*` が強調） */
export function telopParts(t: string): { text: string; emphasis: boolean }[] {
  return t.split('*').map((text, i) => ({ text, emphasis: i % 2 === 1 })).filter((p) => p.text !== '');
}

/** シーンの生成（FR-163 AC-315）: 導入（対象ペルソナ）+ 手順 N + 効果（入力があれば 1）。同じ入力から同じ構成 */
export function buildStoryScenes(uc: UseCaseDraft): StoryScene[] {
  const persona = uc.persona.trim() || '利用者';
  const intro: StoryScene = {
    kind: 'intro',
    heading: uc.name,
    caption: `${persona}が、${uc.summary.trim() || uc.name}ために。`,
    telop: `*${clip(uc.name, 8)}*、知ってる？`,
  };
  const steps: StoryScene[] = uc.steps.map((s, i) => ({
    kind: 'step',
    heading: s.title,
    caption: s.description.trim() || s.title,
    telop: `*STEP ${i + 1}* ${clip(s.title, 10)}`,
  }));
  const effect: StoryScene[] = uc.effect.trim()
    ? [{ kind: 'effect', heading: '期待する効果', caption: uc.effect.trim(), telop: `*効果*：${clip(uc.effect, 12)}` }]
    : [];
  return [intro, ...steps, ...effect];
}

/** ストーリーボードを作る。手順が 0 件なら拒否する（FR-163 AC-316） */
export function createStoryboard(uc: UseCaseDraft, now: Date = new Date()): Checked<Storyboard> {
  if (uc.steps.length === 0) {
    return { ok: false, errors: ['手順がないため、ストーリーボードを作成できません。手順を 1 つ以上追加する（「編集」から手順を追加して保存する）と作成できます。'] };
  }
  return { ok: true, value: { scenes: buildStoryScenes(uc), signature: signature(uc), createdAt: now.toISOString() } };
}

export function storyboardState(uc: UseCaseDraft, sb: Storyboard | undefined): StoryboardState {
  if (!sb) return 'none';
  return sb.signature === signature(uc) ? 'latest' : 'stale';
}

/** シーンの編集内容の検証。強調テロップは最大文字数以内、字幕・見出しは必須 */
export function validateScenes(scenes: readonly StoryScene[]): Checked<StoryScene[]> {
  const errors: string[] = [];
  scenes.forEach((s, i) => {
    const n = i + 1;
    if (!s.heading.trim()) errors.push(`シーン ${n} の見出しを入力してください。`);
    if (!s.caption.trim()) errors.push(`シーン ${n} の字幕を入力してください。`);
    if (Array.from(telopPlain(s.telop)).length > TELOP_MAX) errors.push(`シーン ${n} の強調テロップは ${TELOP_MAX} 文字以内にしてください（* は数えません）。`);
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: scenes.map((s) => ({ ...s, heading: s.heading.trim(), caption: s.caption.trim(), telop: s.telop.trim() })) };
}

/** 1 シーンあたりの表示時間（ミリ秒）。全体が TARGET_MS に収まるよう、シーンが多いほど短くなる（FR-164 AC-318） */
export const sceneMs = (count: number): number => Math.round(TARGET_MS / Math.max(1, count));

/** シーンを n 番目から 1 つ動かす（順序の編集）。範囲外なら変えない */
export function moveScene<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const a = [...items];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x!);
  return a;
}
