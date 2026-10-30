// 番組の付加機能の純粋なモデル（FR-080 ナビゲーター・FR-081 ショート動画・FR-082 クイズとリアクション）。React・ストアに依存しない。
import { tr } from '../i18n';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ───────── FR-080 AI ナビゲーター ─────────

/** 論点の台本（narration）を読む。空・欠けていれば null */
export function readNarration(topic: unknown): string | null {
  const n = isRecord(topic) ? topic.narration : undefined;
  return typeof n === 'string' && n.trim() !== '' ? n.trim() : null;
}

/** 台本を字幕の単位（文）に分ける。「。」「！」「？」「.」の後ろで切る。空なら空の配列 */
export function splitSubtitles(script: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of script.replace(/\s+/g, ' ').trim()) {
    cur += ch;
    if ('。！？!?'.includes(ch)) { out.push(cur.trim()); cur = ''; }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

/** 1 つの字幕を出している時間（ms）。長さに比例し、短すぎず長すぎない */
export function subtitleDurationMs(text: string): number {
  return Math.min(8_000, Math.max(2_500, text.length * 180));
}

/** 台本の開始からの経過時間（ms）から、いま出す字幕の番号を求める。最後の字幕で止まる */
export function subtitleIndexAt(sentences: readonly string[], elapsedMs: number): number {
  let t = Math.max(0, elapsedMs);
  for (let i = 0; i < sentences.length; i++) {
    const d = subtitleDurationMs(sentences[i]!);
    if (t < d) return i;
    t -= d;
  }
  return Math.max(0, sentences.length - 1);
}

// ───────── FR-082 AI 成熟度クイズ ─────────

export interface QuizOption { label: string; score: number }
export interface QuizQuestion { id: string; text: string; options: QuizOption[] }
export interface QuizLevel { minScore: number; label: string; description: string }
export interface Quiz { title: string; questions: QuizQuestion[]; levels: QuizLevel[] }

/** 成熟度のレベルの既定（show.json に levels がないとき）。満点に対する割合で 4 段階にする */
export function defaultLevels(maxScore: number): QuizLevel[] {
  const at = (r: number) => Math.round(maxScore * r);
  return [
    { minScore: 0, label: tr('レベル 1: 検討前'), description: tr('AI の活用はこれからです。小さな業務での試行から始めましょう。') },
    { minScore: at(0.35), label: tr('レベル 2: 試行中'), description: tr('一部の業務で試しています。成果の測り方と推進の体制を整えましょう。') },
    { minScore: at(0.6), label: tr('レベル 3: 展開中'), description: tr('複数の業務で活用しています。データと運用の標準化で広げましょう。') },
    { minScore: at(0.85), label: tr('レベル 4: 定着'), description: tr('業務の基盤として定着しています。効果の最大化と新しい価値の創出に進めます。') },
  ];
}

export function quizMaxScore(questions: readonly QuizQuestion[]): number {
  return questions.reduce((sum, q) => sum + Math.max(0, ...q.options.map((o) => o.score)), 0);
}

/** 論点の quiz を読む。質問が 1 問もなければ null */
export function readQuiz(topic: unknown): Quiz | null {
  const q = isRecord(topic) ? topic.quiz : undefined;
  if (!isRecord(q) || !Array.isArray(q.questions)) return null;
  const questions: QuizQuestion[] = [];
  q.questions.forEach((raw, i) => {
    if (!isRecord(raw) || typeof raw.text !== 'string' || raw.text.trim() === '' || !Array.isArray(raw.options)) return;
    const options: QuizOption[] = raw.options.flatMap((o): QuizOption[] => (
      isRecord(o) && typeof o.label === 'string' && o.label !== ''
        ? [{ label: o.label, score: typeof o.score === 'number' && Number.isFinite(o.score) ? o.score : 0 }]
        : []));
    if (options.length === 0) return;
    questions.push({ id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : `q${i + 1}`, text: raw.text, options });
  });
  if (questions.length === 0) return null;
  let levels: QuizLevel[] = Array.isArray(q.levels)
    ? q.levels.flatMap((l): QuizLevel[] => (
      isRecord(l) && typeof l.label === 'string' && l.label !== '' && typeof l.minScore === 'number'
        ? [{ minScore: l.minScore, label: l.label, description: typeof l.description === 'string' ? l.description : '' }]
        : []))
    : [];
  if (levels.length === 0) levels = defaultLevels(quizMaxScore(questions));
  levels.sort((a, b) => a.minScore - b.minScore);
  return { title: typeof q.title === 'string' && q.title !== '' ? q.title : tr('AI 成熟度クイズ'), questions, levels };
}

export interface QuizResult { score: number; max: number; level: QuizLevel; levelNumber: number }

/** 回答（質問 ID → 選んだ選択肢の番号）から結果を求める。全問に答えていなければ null */
export function scoreQuiz(quiz: Quiz, answers: Readonly<Record<string, number>>): QuizResult | null {
  let score = 0;
  for (const q of quiz.questions) {
    const a = answers[q.id];
    if (a === undefined || !q.options[a]) return null;
    score += q.options[a]!.score;
  }
  let levelNumber = 0;
  quiz.levels.forEach((l, i) => { if (score >= l.minScore) levelNumber = i; });
  return { score, max: quizMaxScore(quiz.questions), level: quiz.levels[levelNumber]!, levelNumber: levelNumber + 1 };
}

// ───────── FR-082 リアクション ─────────

export const REACTIONS = [
  { id: 'like', emoji: '👍', get label() { return tr('いいね'); } },
  { id: 'clap', emoji: '👏', get label() { return tr('拍手'); } },
  { id: 'idea', emoji: '💡', get label() { return tr('なるほど'); } },
] as const;
export type ReactionId = (typeof REACTIONS)[number]['id'];

// ───────── FR-081 ショート動画 ─────────

/** PARAM-013: ショート動画の長さ（約）（秒） */
export const SHORT_VIDEO_SECONDS = 60;
/** 縦横 9:16 */
export const SHORT_VIDEO_WIDTH = 540;
export const SHORT_VIDEO_HEIGHT = 960;
export const SHORT_VIDEO_FPS = 30;
/** 透かしの文字（FR-081） */
export const SHORT_VIDEO_WATERMARK = 'サンプル';

export interface ShortSlide { chapter: string; title: string; text: string }

/** 経過時間（秒）から、いま出すスライドの番号を求める。全体を等分して巡る。スライドがなければ -1 */
export function slideIndexAt(count: number, elapsedSec: number, totalSec: number = SHORT_VIDEO_SECONDS): number {
  if (count <= 0) return -1;
  const per = totalSec / count;
  return Math.min(count - 1, Math.max(0, Math.floor(elapsedSec / per)));
}

/** 書き出すファイル名（Windows で使えない文字を除く） */
export function shortVideoFileName(projectName: string): string {
  const safe = projectName.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'show'}-short.webm`;
}

/** 文字を指定の幅で折り返す（日本語は 1 文字ずつ。measure は文字列の幅を返す） */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (cur !== '' && measure(cur + ch) > maxWidth) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur !== '') lines.push(cur);
  return lines;
}
