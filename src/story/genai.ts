// プレゼンテーションの生成 AI によるストーリーの作成（FR-290）の純粋な部分。React に依存しない。
// - 生成 AI に渡す材料は、選んだペルソナと、この Project の FR-179 の材料（解決策・優先順位・ROI・コスト・KPI/OKR・ユースケース・番組構成）だけ（FR-138）。
// - 入力が PARAM-114 を超えるときは、番組構成 → ユースケースの説明 → ROI・コストの内訳 の順に切り詰める（FR-276 (2)）。
// - 生成 AI が作るのは見出しと語りの文章だけ。解決策・KPI/OKR・ユースケースの名称と数値は、材料から作ったシーン（buildStory）の値をそのまま使う。
// - 見出し・語りに材料にない数値（漢数字・符号付きを含む）や、材料にない解決策・KPI/OKR・ユースケースの名称があれば、その文は表示しない（除いた件数をシーンに示す）。
import { kpisForSolution } from '../usecase/demo';
import {
  evalOf, rankSolutions, withUnit,
  type StoryInput, type StoryPart, type StoryPersona, type StoryScene,
} from './model';

/** PARAM-127: 応答を待つ時間の上限（秒） */
export const STORY_GENAI_TIMEOUT_SEC = 90;
/** PARAM-132: 1 回の出力の上限（トークン） */
export const STORY_GENAI_MAX_OUTPUT_TOKENS = 4000;

export interface StoryMaterials {
  persona: StoryPersona;
  solutions: Array<{ rank: number; title: string; issue: string; impact: number; feasibility: number; roi?: string; cost?: string; kpis: string[] }>;
  useCases: Array<{ name: string; solution: string; summary?: string; effect: string; steps: string[] }>;
  /** 番組構成（章: 論点） */
  program: string[];
}

export interface ShowChapterInput { title: string; topics?: ReadonlyArray<{ title: string }> }

/** FR-179 と同じ入力から、生成 AI に渡す材料を作る（ほかの Project・企業のデータは入れない） */
export function buildStoryMaterials(input: StoryInput, chapters: readonly ShowChapterInput[] = []): StoryMaterials {
  const top = rankSolutions(input.issues, input.solutions, input.weights, input.top);
  const solutions = top.map((rs) => ({
    rank: rs.rank,
    title: rs.solution.title,
    issue: rs.issueTitle,
    impact: rs.row.values.impact.value,
    feasibility: rs.row.values.feasibility.value,
    roi: withUnit(evalOf(rs.row, input.issues, 'roi')),
    cost: withUnit(evalOf(rs.row, input.issues, 'cost')),
    kpis: kpisForSolution(input.customer, rs.solution.id).map((k) => `${k.objective} ／ ${k.keyResult}（KPI：${k.kpi} 現在 ${k.current} → 目標 ${k.target} ${k.unit}）`.trim()),
  }));
  const titles = new Map(top.map((rs) => [rs.solution.id, rs.solution.title] as const));
  const useCases = input.useCases
    .filter((u) => u.persona === input.persona && u.solutionId && titles.has(u.solutionId))
    .map((u) => ({ name: u.name, solution: titles.get(u.solutionId!)!, summary: u.summary, effect: u.effect, steps: u.steps.map((s) => s.title) }));
  const program = chapters.map((c) => `${c.title}${c.topics && c.topics.length > 0 ? `: ${c.topics.map((t) => t.title).join('、')}` : ''}`);
  return { persona: input.persona, solutions, useCases, program };
}

interface RenderOpts { program: boolean; useCaseDetail: boolean; roiCost: boolean }

/** 材料の文（数値の照合にも使う） */
export function renderMaterials(m: StoryMaterials, o: RenderOpts = { program: true, useCaseDetail: true, roiCost: true }): string {
  const lines: string[] = [`ペルソナ: ${m.persona}`, '解決策（優先順位の順）:'];
  if (m.solutions.length === 0) lines.push('- （なし）');
  for (const s of m.solutions) {
    lines.push(`- 第 ${s.rank} 位 ${s.title}（解く課題: ${s.issue}。インパクト ${s.impact} / 5、実現性 ${s.feasibility} / 5）`);
    if (o.roiCost) {
      if (s.roi) lines.push(`  ROI: ${s.roi}`);
      if (s.cost) lines.push(`  コスト: ${s.cost}`);
    }
    for (const k of s.kpis) lines.push(`  KPI/OKR: ${k}`);
  }
  lines.push('ユースケース:');
  if (m.useCases.length === 0) lines.push('- （なし）');
  for (const u of m.useCases) {
    lines.push(`- ${u.name}（解決策: ${u.solution}）期待する効果: ${u.effect}`);
    if (o.useCaseDetail) {
      if (u.summary) lines.push(`  説明: ${u.summary}`);
      if (u.steps.length > 0) lines.push(`  手順: ${u.steps.join(' → ')}`);
    }
  }
  if (o.program && m.program.length > 0) {
    lines.push('番組構成:');
    for (const p of m.program) lines.push(`- ${p}`);
  }
  return lines.join('\n');
}

const INSTRUCTION = (persona: string): string => [
  `次の［材料］だけを使って、ペルソナ「${persona}」向けのプレゼンテーションのストーリーを日本語で作ってください。`,
  '①優先度の高い解決策、②その理由、③影響する KPI/OKR、④具体的なユースケース の順に、シーンごとの見出し（heading）と語りの文章（narration）を書きます。',
  '材料にない名称・数値は書かないでください。出力は次の形の JSON だけにします（part は ①〜④ の番号）。',
  '{"scenes":[{"part":1,"heading":"…","narration":"…"}]}',
  '［材料］',
].join('\n');

export interface StoryPrompt { prompt: string; tokens: number; truncated: boolean }

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** 生成 AI に渡す入力。上限を超えるときは、番組構成 → ユースケースの説明 → ROI・コストの内訳 の順に落とす */
export function buildStoryPrompt(m: StoryMaterials, maxInputTokens: number): StoryPrompt {
  const head = INSTRUCTION(m.persona);
  const steps: RenderOpts[] = [
    { program: true, useCaseDetail: true, roiCost: true },
    { program: false, useCaseDetail: true, roiCost: true },
    { program: false, useCaseDetail: false, roiCost: true },
    { program: false, useCaseDetail: false, roiCost: false },
  ];
  for (let i = 0; i < steps.length; i++) {
    const prompt = `${head}\n${renderMaterials(m, steps[i])}`;
    if (estimateTokens(prompt) <= maxInputTokens) return { prompt, tokens: estimateTokens(prompt), truncated: i > 0 };
  }
  // それでも超えるときは、末尾から切る
  const prompt = `${head}\n${renderMaterials(m, steps[steps.length - 1])}`.slice(0, Math.max(0, maxInputTokens * 4));
  return { prompt, tokens: estimateTokens(prompt), truncated: true };
}

export interface GenaiScene { part: StoryPart; heading: string; narration: string }

/** 応答（JSON。コードフェンスで囲まれていてもよい）からシーンを取り出す。形が合わなければ null */
export function parseGenaiScenes(answer: string): GenaiScene[] | null {
  const text = answer.replace(/```(?:json)?/gi, '');
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j: unknown;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  const raw = (j as { scenes?: unknown })?.scenes;
  if (!Array.isArray(raw)) return null;
  const out: GenaiScene[] = [];
  for (const s of raw) {
    const part = Number((s as { part?: unknown })?.part);
    const heading = (s as { heading?: unknown })?.heading;
    const narration = (s as { narration?: unknown })?.narration;
    if (![1, 2, 3, 4].includes(part) || typeof heading !== 'string' || typeof narration !== 'string') continue;
    out.push({ part: part as StoryPart, heading: heading.trim(), narration: narration.trim() });
  }
  return out.length > 0 ? out : null;
}

const toHalf = (t: string): string => t.replace(/[０-９．，＋]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_SMALL: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const KANJI_LARGE: Record<string, number> = { 万: 1e4, 億: 1e8, 兆: 1e12 };

/** 漢数字（例: 三、十二、二千五百、三万、二〇二六）を数にする。読めなければ null */
export function kanjiToNumber(s: string): number | null {
  if (!s) return null;
  if (![...s].some((c) => c in KANJI_SMALL || c in KANJI_LARGE)) {
    // 位取りの記号がない並び（二〇二六）は各桁を並べる
    if (![...s].every((c) => c in KANJI_DIGIT)) return null;
    return Number([...s].map((c) => KANJI_DIGIT[c]).join(''));
  }
  let total = 0, section = 0, digit: number | null = null;
  for (const c of s) {
    if (c in KANJI_DIGIT) digit = KANJI_DIGIT[c]!;
    else if (c in KANJI_SMALL) { section += (digit ?? 1) * KANJI_SMALL[c]!; digit = null; }
    else if (c in KANJI_LARGE) { total += (section + (digit ?? 0) || 1) * KANJI_LARGE[c]!; section = 0; digit = null; }
    else return null;
  }
  return total + section + (digit ?? 0);
}

/** 漢数字を数として読む後ろの語（「十分な」「一部」「一つ」などの普通の語は数として読まない） */
const KANJI_COUNTER = '(?=割|%|％|パーセント|ポイント|倍|件|人|名|円|年|か月|カ月|ヶ月|ケ月|週|日|時間|秒|社|点|位|回|個|台|店|拠点|億|万|兆)';
const NUM_RE = new RegExp(
  // 漢数字は途中で区切らない（「三万の」を「三」と読まない）。万・億・兆で終わる並びは後ろの語に関わらず数として読む
  `(?<sign>[+\\-−－‐▲△])?(?:(?<arabic>\\d+(?:[.,]\\d+)*)|(?=(?<kanji>[〇零一二三四五六七八九十百千][〇零一二三四五六七八九十百千万億兆]*))\\k<kanji>(?:(?<=[万億兆])|${KANJI_COUNTER}))(?<wari>割)?`,
  'g',
);

/**
 * 文に現れる数値（FR-290 AC-776）。全角は半角に、桁区切りは除く（1.50 と 1.5 は同じ）。
 * 漢数字（三割・二千万円）も数として読み、「割」は 10 倍（三割 = 30）にそろえる。
 * 符号: 「−5」「▲5」は -5、「+12」は 12 とする（数字の直後の「-」は範囲・日付の区切りとして符号にしない）。
 */
export function numbersIn(text: string): string[] {
  const t = toHalf(text);
  const out: string[] = [];
  for (const m of t.matchAll(NUM_RE)) {
    const g = m.groups ?? {};
    let v: number;
    if (g.arabic) {
      const n = g.arabic;
      const plain = /,\d{3}(?!\d)/.test(n) ? n.replace(/,/g, '') : n.replace(/,/g, '.');
      v = Number(plain);
      if (!Number.isFinite(v)) { out.push(plain); continue; }
    } else {
      const k = kanjiToNumber(g.kanji ?? '');
      if (k === null) continue;
      v = k;
    }
    if (g.wari) v = Math.round(v * 10 * 1e6) / 1e6;
    const prev = m.index > 0 ? t[m.index - 1]! : '';
    // 「10-15」「2026-10」のように数字・英字の直後の「-」は符号ではない
    const negative = !!g.sign && g.sign !== '+' && !(g.sign !== '▲' && g.sign !== '△' && /[0-9A-Za-z]/.test(prev));
    out.push(String(negative && v !== 0 ? -v : v));
  }
  return out;
}

export function allowedNumbers(...texts: string[]): Set<string> {
  return new Set(texts.flatMap((t) => numbersIn(t)));
}

const normName = (t: string): string => toHalf(t.normalize('NFKC')).replace(/\s+/g, '').toLowerCase();

/** 名称として書かれた語（括弧で囲んだ語と、「解決策：X」「KPI：X」「ユースケース：X」の X） */
export function namesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[「『【“"]([^「」『』【】“”"]{1,60})[」』】”"]/g)) out.push(m[1]!.trim());
  const label = /(?:解決策|施策|ソリューション|KPI|OKR|KR|指標|ユースケース|利用シナリオ)\s*(?:名)?\s*[:：]\s*([^\s、。,，「」『』]+)/gi;
  for (const m of text.matchAll(label)) out.push(m[1]!.trim());
  return out.filter((n) => n.length > 0);
}

/** 文の照合に使う、材料の数値と名称 */
export interface MaterialFacts { numbers: ReadonlySet<string>; text: string }

export function materialFacts(...texts: string[]): MaterialFacts {
  return { numbers: allowedNumbers(...texts), text: normName(texts.join('\n')) };
}

/** 文が材料にない数値・名称を含むか（FR-290 AC-776） */
export function sentenceAllowed(s: string, facts: MaterialFacts | ReadonlySet<string>): boolean {
  const f: MaterialFacts = facts instanceof Set ? { numbers: facts, text: '' } : (facts as MaterialFacts);
  if (!numbersIn(s).every((n) => f.numbers.has(n))) return false;
  if (facts instanceof Set) return true;
  return namesIn(s).every((n) => f.text.includes(normName(n)));
}

/** 材料にない数値・解決策・KPI/OKR・ユースケースの名称を含む文を除く */
export function filterSentences(text: string, allowed: MaterialFacts | ReadonlySet<string>): { kept: string[]; removed: number } {
  const parts = text.split(/(?<=[。！？!?\n])/).map((s) => s.trim()).filter((s) => s.length > 0);
  const kept: string[] = [];
  let removed = 0;
  for (const s of parts) {
    if (sentenceAllowed(s, allowed)) kept.push(s);
    else removed++;
  }
  return { kept, removed };
}

/** シーンの文字（数値の照合に使う） */
const sceneText = (s: StoryScene): string =>
  [s.kicker, s.heading, s.big?.value, s.big?.label, ...s.lines, ...(s.steps ?? []), s.cta, s.noData?.reason, s.noData?.entry].filter(Boolean).join('\n');

/**
 * 材料から作ったシーン（FR-179）に、生成 AI の見出しと語りを重ねる。名称・数値の欄（kicker・big・lines・steps）は材料の値のまま。
 * part ごとに、生成 AI の i 番目のシーンを、材料の part の i 番目のシーンへ（余れば最後のシーンへ）付ける。
 */
export function composeGenaiStory(base: readonly StoryScene[], gen: readonly GenaiScene[], materialsText: string): { scenes: StoryScene[]; removed: number } {
  const allowed = materialFacts(materialsText, ...base.map(sceneText));
  const scenes = base.map((s) => ({ ...s, lines: [...s.lines] }));
  let removed = 0;
  for (const p of [1, 2, 3, 4] as const) {
    const targets = scenes.filter((s) => s.part === p);
    if (targets.length === 0) continue;
    gen.filter((g) => g.part === p).forEach((g, i) => {
      const t = targets[Math.min(i, targets.length - 1)]!;
      const h = filterSentences(g.heading, allowed);
      const n = filterSentences(g.narration, allowed);
      const cut = h.removed + n.removed;
      removed += cut;
      if (h.removed === 0 && h.kept.length > 0 && !t.aiHeading) t.aiHeading = h.kept.join('');
      if (n.kept.length > 0) t.narration = [...(t.narration ?? []), ...n.kept];
      if (cut > 0) t.removedSentences = (t.removedSentences ?? 0) + cut;
    });
  }
  return { scenes, removed };
}
