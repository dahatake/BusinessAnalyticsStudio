// 番組（ショー）の純粋なモデル（FR-076〜FR-079・FR-083）。React・ストアに依存しない。
// オープニングの時間割、演出強度の切替、次のチャプター、テロップ・ROI・Before/After の読み取り、TOP5 の作り方を持つ。
import { INTENSITIES, type Intensity } from '../motion/tone';

/** オープニングの全体の長さ（ms）。PARAM-011（15 秒）〜 PARAM-012（30 秒）の範囲に収める */
export const OPENING_MIN_MS = 15_000;
export const OPENING_MAX_MS = 30_000;
export const OPENING_TOTAL_MS = 20_000;

/** オープニングの段階: カウントダウン → ロゴのリビール → タイトル */
export type OpeningPhase = 'countdown' | 'logo' | 'title';

/** カウントダウンの数（3 → 2 → 1）と 1 つあたりの長さ */
export const COUNTDOWN_STEPS = 3;
export const COUNTDOWN_STEP_MS = 1_000;
/** ロゴのリビールの長さ */
export const LOGO_REVEAL_MS = 5_000;

/** 経過時間（ms）から、オープニングの段階とカウントダウンの数を求める。動かさない版（静止画）は常にタイトル */
export function openingPhaseAt(elapsedMs: number, animated: boolean): { phase: OpeningPhase; count: number } {
  if (!animated) return { phase: 'title', count: 0 };
  const countdownEnd = COUNTDOWN_STEPS * COUNTDOWN_STEP_MS;
  if (elapsedMs < countdownEnd) {
    return { phase: 'countdown', count: COUNTDOWN_STEPS - Math.floor(Math.max(0, elapsedMs) / COUNTDOWN_STEP_MS) };
  }
  if (elapsedMs < countdownEnd + LOGO_REVEAL_MS) return { phase: 'logo', count: 0 };
  return { phase: 'title', count: 0 };
}

/** 全体の長さを PARAM-011〜012 の範囲に収める */
export function clampOpeningMs(ms: number): number {
  if (!Number.isFinite(ms)) return OPENING_TOTAL_MS;
  return Math.min(OPENING_MAX_MS, Math.max(OPENING_MIN_MS, ms));
}

/** オープニングのタイトル「{顧客名} × Microsoft — {Project名}: The Future Ahead」 */
export function openingTitle(customerName: string, projectName: string): string {
  return `${customerName} × Microsoft — ${projectName}: The Future Ahead`;
}

/** 演出強度を Executive→Showcase→Entertainment→Executive の順に 1 つ進める */
export function nextIntensity(current: Intensity): Intensity {
  const i = INTENSITIES.indexOf(current);
  return INTENSITIES[(i + 1) % INTENSITIES.length]!;
}

/** 紙吹雪を出してよいか。ROI 発表で、演出強度が Entertainment のときだけ（FR-079） */
export function showsConfetti(topicType: string | undefined, intensity: Intensity): boolean {
  return topicType === 'roi' && intensity === 'Entertainment';
}

/** 動きを付けた登場にするか。Executive は動きを足さない */
export function usesEnterMotion(intensity: Intensity): boolean {
  return intensity !== 'Executive';
}

export interface ChapterRef { chapterId: string; chapterTitle: string; chapterIndex: number }

/** 現在のチャプターの次のチャプター（最後のチャプターなら null）。議題の並びから、章の順に求める */
export function nextChapterOf(topics: readonly ChapterRef[], index: number): ChapterRef | null {
  const cur = topics[index];
  if (!cur) return null;
  return topics.find((t) => t.chapterIndex > cur.chapterIndex) ?? null;
}

/** テロップ（FR-078）。出典 ID を併記する */
export interface Telop { text: string; sourceIds: string[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];
}

/** 議題の telop を読む。本文が空・欠けていれば null */
export function readTelop(topic: unknown): Telop | null {
  const t = isRecord(topic) ? topic.telop : undefined;
  if (!isRecord(t) || typeof t.text !== 'string' || t.text.trim() === '') return null;
  return { text: t.text, sourceIds: strings(t.sourceIds) };
}

export interface BeforeAfterSide { label: string; text: string }
export interface BeforeAfter { before: BeforeAfterSide; after: BeforeAfterSide }

function side(v: unknown, fallbackLabel: string): BeforeAfterSide | null {
  if (!isRecord(v) || typeof v.text !== 'string' || v.text.trim() === '') return null;
  return { label: typeof v.label === 'string' && v.label !== '' ? v.label : fallbackLabel, text: v.text };
}

/** 議題の beforeAfter を読む。どちらかが欠けていれば null */
export function readBeforeAfter(topic: unknown): BeforeAfter | null {
  const b = isRecord(topic) ? topic.beforeAfter : undefined;
  if (!isRecord(b)) return null;
  const before = side(b.before, 'Before');
  const after = side(b.after, 'After');
  return before && after ? { before, after } : null;
}

export interface RoiAnnouncement { label: string; value: number; unit: string; caption?: string; sourceIds: string[] }

/** 議題の roi を読む。値が数でなければ null */
export function readRoi(topic: unknown): RoiAnnouncement | null {
  const r = isRecord(topic) ? topic.roi : undefined;
  if (!isRecord(r) || typeof r.value !== 'number' || !Number.isFinite(r.value)) return null;
  return {
    label: typeof r.label === 'string' && r.label !== '' ? r.label : 'ROI',
    value: r.value,
    unit: typeof r.unit === 'string' ? r.unit : '%',
    caption: typeof r.caption === 'string' && r.caption !== '' ? r.caption : undefined,
    sourceIds: strings(r.sourceIds),
  };
}

/** 議題の type（なければ undefined） */
export function topicTypeOf(topic: unknown): string | undefined {
  const t = isRecord(topic) ? topic.type : undefined;
  return typeof t === 'string' && t !== '' ? t : undefined;
}

/** スライダーの値を 0〜100 に収める（数でなければ 50） */
export function clampSlider(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** ランキングの上位 5 件（順位の昇順）。順位が同じときは元の並びを保つ */
export function topFive<T extends { rank: number }>(rows: readonly T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.rank - b.r.rank || a.i - b.i)
    .slice(0, 5)
    .map((x) => x.r);
}
