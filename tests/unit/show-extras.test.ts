// 番組の付加機能の単体テスト: FR-080 AI ナビゲーター / FR-081 ショート動画 / FR-082 クイズとリアクション / FR-084 ショーコントロールバー / FR-085 ショートカット一覧
import { describe, expect, it } from 'vitest';
import { STATIC_SHORTCUTS } from '../../src/commands/registry';
import {
  REACTIONS, SHORT_VIDEO_HEIGHT, SHORT_VIDEO_SECONDS, SHORT_VIDEO_WIDTH, defaultLevels, quizMaxScore, readNarration, readQuiz,
  scoreQuiz, shortVideoFileName, slideIndexAt, splitSubtitles, subtitleDurationMs, subtitleIndexAt, wrapText,
} from '../../src/show/extras';
import { SHOW_BAR_HIDE_SECONDS } from '../../src/show/ShowControlBar';
import { DATA_SCHEMAS } from '../../src/schema';
import fs from 'node:fs';
import path from 'node:path';

describe('FR-080 AC-097 ナビゲーターの台本と字幕', () => {
  it('narration を読み、空・欠けは null', () => {
    expect(readNarration({ narration: ' 台本です。 ' })).toBe('台本です。');
    expect(readNarration({ narration: '  ' })).toBeNull();
    expect(readNarration({})).toBeNull();
    expect(readNarration(undefined)).toBeNull();
  });
  it('台本を文ごとの字幕に分け、時間に応じて進み、最後の字幕で止まる', () => {
    const s = splitSubtitles('最初の文です。次の文です！最後の文');
    expect(s).toEqual(['最初の文です。', '次の文です！', '最後の文']);
    expect(subtitleIndexAt(s, 0)).toBe(0);
    expect(subtitleIndexAt(s, subtitleDurationMs(s[0]!) + 1)).toBe(1);
    expect(subtitleIndexAt(s, 10 ** 9)).toBe(2);
    expect(splitSubtitles('')).toEqual([]);
  });
  it('字幕の時間は 2.5〜8 秒に収まる', () => {
    expect(subtitleDurationMs('あ')).toBe(2_500);
    expect(subtitleDurationMs('あ'.repeat(500))).toBe(8_000);
  });
});

describe('FR-081 AC-099 ショート動画', () => {
  it('9:16・約 60 秒（PARAM-013）', () => {
    expect(SHORT_VIDEO_WIDTH / SHORT_VIDEO_HEIGHT).toBeCloseTo(9 / 16, 4);
    expect(SHORT_VIDEO_SECONDS).toBe(60);
  });
  it('スライドを全体で等分して巡り、範囲外は端に収める', () => {
    expect(slideIndexAt(0, 5)).toBe(-1);
    expect(slideIndexAt(4, 0)).toBe(0);
    expect(slideIndexAt(4, 15)).toBe(1);
    expect(slideIndexAt(4, 59.9)).toBe(3);
    expect(slideIndexAt(4, 1000)).toBe(3);
    expect(slideIndexAt(4, -5)).toBe(0);
  });
  it('ファイル名に使えない文字を除き、空なら既定の名前', () => {
    expect(shortVideoFileName('A/B: C*?')).toBe('A-B-C-short.webm');
    expect(shortVideoFileName('')).toBe('show-short.webm');
  });
  it('文字を幅で折り返す', () => {
    const lines = wrapText('あいうえおかきくけこ', 5, (t) => t.length);
    expect(lines).toEqual(['あいうえお', 'かきくけこ']);
    expect(wrapText('a\nb', 10, (t) => t.length)).toEqual(['a', 'b']);
  });
});

describe('FR-082 AC-100 クイズとリアクション', () => {
  const topic = {
    quiz: {
      title: 'クイズ',
      questions: [
        { id: 'a', text: 'Q1', options: [{ label: 'x', score: 0 }, { label: 'y', score: 2 }] },
        { id: 'b', text: 'Q2', options: [{ label: 'x', score: 0 }, { label: 'y', score: 3 }] },
      ],
      levels: [{ minScore: 0, label: 'L1', description: '' }, { minScore: 3, label: 'L2', description: 'd' }],
    },
  };
  it('質問と選択肢を読み、質問がなければ null', () => {
    const q = readQuiz(topic)!;
    expect(q.questions).toHaveLength(2);
    expect(quizMaxScore(q.questions)).toBe(5);
    expect(readQuiz({ quiz: { questions: [] } })).toBeNull();
    expect(readQuiz({})).toBeNull();
  });
  it('全問に答えるまで結果は出ず、点の合計から成熟度のレベルを決める', () => {
    const q = readQuiz(topic)!;
    expect(scoreQuiz(q, { a: 1 })).toBeNull();
    expect(scoreQuiz(q, { a: 9, b: 0 })).toBeNull();
    expect(scoreQuiz(q, { a: 0, b: 0 })).toMatchObject({ score: 0, levelNumber: 1 });
    expect(scoreQuiz(q, { a: 1, b: 1 })).toMatchObject({ score: 5, max: 5, levelNumber: 2 });
  });
  it('levels がなければ、満点に対する割合の既定の 4 段階を使う', () => {
    const q = readQuiz({ quiz: { questions: [{ text: 'Q', options: [{ label: 'a', score: 0 }, { label: 'b', score: 10 }] }] } })!;
    expect(q.levels).toEqual(defaultLevels(10));
    expect(scoreQuiz(q, { q1: 1 })).toMatchObject({ levelNumber: 4 });
  });
  it('リアクションは 1 種類以上ある', () => {
    expect(REACTIONS.length).toBeGreaterThan(0);
  });
});

describe('FR-084 AC-102 ショーコントロールバー', () => {
  it('自動で隠れるまでの時間は 3 秒（PARAM-026）', () => {
    expect(SHOW_BAR_HIDE_SECONDS).toBe(3);
  });
});

describe('FR-085 AC-103 ショートカット一覧', () => {
  it('←・→ を含む、コマンドにならない操作のキーを載せている', () => {
    const keys = STATIC_SHORTCUTS.map((s) => s.shortcut);
    for (const k of ['?', '←', '→', 'Shift+F', 'H']) expect(keys).toContain(k);
    for (const s of STATIC_SHORTCUTS) expect(s.label.length).toBeGreaterThan(1);
  });
});

describe('FR-080 FR-082 お手本パックの show.json', () => {
  it('台本のある議題とクイズの議題があり、スキーマに合う', () => {
    const root = path.resolve(__dirname, '../../examples/mono/public/data');
    const show = JSON.parse(fs.readFileSync(path.join(root, 'show.json'), 'utf8'));
    const topics = show.chapters.flatMap((c: { topics: unknown[] }) => c.topics) as Array<Record<string, unknown>>;
    expect(topics.some((t) => readNarration(t) !== null)).toBe(true);
    const quiz = topics.find((t) => t.type === 'quiz');
    expect(quiz && readQuiz(quiz)).toBeTruthy();
    expect(DATA_SCHEMAS.show.safeParse(show).success).toBe(true);
  });
});
