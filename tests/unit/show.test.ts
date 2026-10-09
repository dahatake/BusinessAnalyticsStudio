// 番組（ショー）の単体テスト: オープニング・チャプター・テロップ・Before/After・TOP5・ROI・演出強度（FR-076〜FR-079・FR-083）
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ShowSchema } from '../../src/schema';
import {
  COUNTDOWN_STEPS, COUNTDOWN_STEP_MS, LOGO_REVEAL_MS, OPENING_MAX_MS, OPENING_MIN_MS, OPENING_TOTAL_MS,
  clampOpeningMs, clampSlider, nextChapterOf, nextIntensity, openingPhaseAt, openingTitle, readBeforeAfter, readRoi, readTelop,
  showsConfetti, topFive, topicTypeOf, usesEnterMotion,
} from '../../src/show/model';
import { flattenTopics } from '../../src/presentation/model';
import { INTENSITIES } from '../../src/motion/tone';

/** お手本パック（examples/mono）の JSON を読む小さな窓口 */
function examplePack(kind: 'mono') {
  const json = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../../examples', kind, 'public/data', `${name}.json`), 'utf8'));
  const chapters = (): Array<{ id: string; title: string; topics: Array<Record<string, unknown> & { id: string; title: string }> }> => json('show').chapters;
  return {
    json,
    chapters,
    topics: () => chapters().flatMap((c) => c.topics.map((topic) => ({ chapter: c, topic }))),
    sources: (): Array<{ id: string }> => json('sources').sources,
    issues: (): unknown[] => json('issues').issues,
  };
}

describe('FR-076 オープニング', () => {
  // FR-076 AC-093
  it('FR-076 AC-093 オープニングの全体の長さは PARAM-011（15 秒）以上 PARAM-012（30 秒）以下で、範囲外は範囲に収める', () => {
    expect(OPENING_MIN_MS).toBe(15_000);
    expect(OPENING_MAX_MS).toBe(30_000);
    expect(OPENING_TOTAL_MS).toBeGreaterThanOrEqual(OPENING_MIN_MS);
    expect(OPENING_TOTAL_MS).toBeLessThanOrEqual(OPENING_MAX_MS);
    expect(clampOpeningMs(1_000)).toBe(OPENING_MIN_MS);
    expect(clampOpeningMs(99_000)).toBe(OPENING_MAX_MS);
    expect(clampOpeningMs(Number.NaN)).toBe(OPENING_TOTAL_MS);
  });

  // FR-076 AC-093
  it('FR-076 AC-093 タイトルは「{顧客名} × Microsoft — {Project名}: The Future Ahead」', () => {
    expect(openingTitle('架空製作所', '予兆保全')).toBe('架空製作所 × Microsoft — 予兆保全: The Future Ahead');
  });

  // FR-076 AC-093
  it('FR-076 AC-093 カウントダウン → ロゴのリビール → タイトルの順に進み、動かさない版は最初からタイトル', () => {
    expect(openingPhaseAt(0, true)).toEqual({ phase: 'countdown', count: 3 });
    expect(openingPhaseAt(COUNTDOWN_STEP_MS, true)).toEqual({ phase: 'countdown', count: 2 });
    expect(openingPhaseAt(COUNTDOWN_STEP_MS * 2, true)).toEqual({ phase: 'countdown', count: 1 });
    const countdownEnd = COUNTDOWN_STEPS * COUNTDOWN_STEP_MS;
    expect(openingPhaseAt(countdownEnd, true).phase).toBe('logo');
    expect(openingPhaseAt(countdownEnd + LOGO_REVEAL_MS, true).phase).toBe('title');
    expect(openingPhaseAt(OPENING_TOTAL_MS - 1, true).phase).toBe('title');
    expect(openingPhaseAt(0, false).phase).toBe('title');
  });
});

describe('FR-077 番組構成（チャプター）', () => {
  const mono = examplePack('mono');
  const topics = flattenTopics(mono.chapters());

  // FR-077 AC-094
  it('FR-077 AC-094 次のチャプターは、現在のチャプターの次の章（最後の章なら null）', () => {
    const chapters = mono.chapters();
    expect(chapters.length).toBeGreaterThan(2);
    expect(nextChapterOf(topics, 0)?.chapterTitle).toBe(chapters[1]!.title);
    const lastIndex = topics.length - 1;
    expect(nextChapterOf(topics, lastIndex)).toBeNull();
    expect(nextChapterOf(topics, 999)).toBeNull();
    // 同じチャプターの中の議題は、同じ次のチャプターを指す
    const firstOfSecond = topics.findIndex((t) => t.chapterIndex === 1);
    expect(nextChapterOf(topics, firstOfSecond)?.chapterTitle).toBe(chapters[2]!.title);
  });
});

describe('FR-078 テロップ/ローワーサード', () => {
  const mono = examplePack('mono');

  // FR-078 AC-095
  it('FR-078 AC-095 テロップは本文と出典 ID を読み、本文が空・欠けていれば出さない', () => {
    expect(readTelop({ telop: { text: '本文', sourceIds: ['src-a', 'src-b'] } })).toEqual({ text: '本文', sourceIds: ['src-a', 'src-b'] });
    expect(readTelop({ telop: { text: '本文' } })).toEqual({ text: '本文', sourceIds: [] });
    expect(readTelop({ telop: { text: '  ' } })).toBeNull();
    expect(readTelop({})).toBeNull();
    expect(readTelop(null)).toBeNull();
  });

  // FR-078 AC-095
  it('FR-078 AC-095 お手本パックのテロップは、実在する出典を指す', () => {
    const withTelop = mono.topics().filter((t) => readTelop(t.topic) !== null);
    expect(withTelop.length).toBeGreaterThan(0);
    const ids = new Set(mono.sources().map((s) => s.id));
    for (const t of withTelop) {
      const telop = readTelop(t.topic)!;
      expect(telop.sourceIds.length).toBeGreaterThan(0);
      for (const id of telop.sourceIds) expect(ids.has(id)).toBe(true);
    }
  });
});

describe('FR-079 Before/After・ランキング・ROI の演出', () => {
  const mono = examplePack('mono');

  // FR-079 AC-096
  it('FR-079 AC-096 Before/After は両側の本文がそろっているときだけ読み、ラベルの既定は Before / After', () => {
    expect(readBeforeAfter({ beforeAfter: { before: { text: 'a' }, after: { label: '後', text: 'b' } } }))
      .toEqual({ before: { label: 'Before', text: 'a' }, after: { label: '後', text: 'b' } });
    expect(readBeforeAfter({ beforeAfter: { before: { text: 'a' } } })).toBeNull();
    expect(readBeforeAfter({})).toBeNull();
  });

  // FR-079 AC-096
  it('FR-079 AC-096 スライダーの値は 0〜100 の整数に収める', () => {
    expect(clampSlider(-5)).toBe(0);
    expect(clampSlider(130)).toBe(100);
    expect(clampSlider(33.4)).toBe(33);
    expect(clampSlider(Number.NaN)).toBe(50);
  });

  // FR-079 AC-096
  it('FR-079 AC-096 TOP5 は順位の昇順で上位 5 件だけを返し、同順位は元の並びを保つ', () => {
    const rows = [
      { id: 'g', rank: 7 }, { id: 'a', rank: 1 }, { id: 'c', rank: 3 }, { id: 'b', rank: 2 },
      { id: 'e', rank: 5 }, { id: 'd', rank: 4 }, { id: 'f', rank: 6 },
    ];
    expect(topFive(rows).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(topFive([{ id: 'x', rank: 1 }, { id: 'y', rank: 1 }]).map((r) => r.id)).toEqual(['x', 'y']);
    expect(topFive([])).toEqual([]);
  });

  // FR-079 AC-096
  it('FR-079 AC-096 ROI 発表は数値と出典 ID を読み、数値でなければ出さない', () => {
    expect(readRoi({ roi: { value: 180, unit: '%', sourceIds: ['s'] } })).toEqual({ label: 'ROI', value: 180, unit: '%', caption: undefined, sourceIds: ['s'] });
    expect(readRoi({ roi: { value: '180' } })).toBeNull();
    expect(readRoi({})).toBeNull();
  });

  // FR-079 AC-096
  it('FR-079 AC-096 紙吹雪は ROI 発表で、演出強度が Entertainment のときだけ', () => {
    for (const i of INTENSITIES) expect(showsConfetti('roi', i)).toBe(i === 'Entertainment');
    for (const i of INTENSITIES) expect(showsConfetti('ranking', i)).toBe(false);
    expect(showsConfetti(undefined, 'Entertainment')).toBe(false);
  });

  // FR-079 AC-096
  it('FR-079 AC-096 お手本パックに before-after・ranking・roi の議題があり、スキーマに合う', () => {
    const types = mono.topics().map((t) => topicTypeOf(t.topic));
    for (const t of ['before-after', 'ranking', 'roi']) expect(types).toContain(t);
    expect(ShowSchema.safeParse(mono.json('show')).success).toBe(true);
    const ba = mono.topics().find((t) => t.topic.type === 'before-after')!;
    expect(readBeforeAfter(ba.topic)).not.toBeNull();
    const roi = mono.topics().find((t) => t.topic.type === 'roi')!;
    expect(readRoi(roi.topic)?.sourceIds.length).toBeGreaterThan(0);
    // 順位表（優先順位分析）が TOP5 を作れる件数の課題を持つ
    expect(mono.issues().length).toBeGreaterThanOrEqual(5);
  });

  // FR-079 AC-096
  it('FR-079 AC-096 ROI の数値は出典 ID が必須（FR-115）', () => {
    const bad = { chapters: [{ id: 'c', createdBy: 'sample', title: 'c', topics: [{ id: 't', createdBy: 'sample', title: 't', type: 'roi', roi: { value: 1, sourceIds: [] } }] }] };
    expect(ShowSchema.safeParse(bad).success).toBe(false);
  });
});

describe('FR-083 演出強度の切替', () => {
  // FR-083 AC-101
  it('FR-083 AC-101 演出強度は Executive→Showcase→Entertainment→Executive の順に変わる', () => {
    expect(nextIntensity('Executive')).toBe('Showcase');
    expect(nextIntensity('Showcase')).toBe('Entertainment');
    expect(nextIntensity('Entertainment')).toBe('Executive');
    let cur = nextIntensity('Executive');
    for (let i = 0; i < 5; i++) cur = nextIntensity(cur);
    expect(INTENSITIES).toContain(cur);
  });

  // FR-083 AC-101
  it('FR-083 AC-101 Executive は動きを足さず、Showcase・Entertainment は動きを付ける', () => {
    expect(usesEnterMotion('Executive')).toBe(false);
    expect(usesEnterMotion('Showcase')).toBe(true);
    expect(usesEnterMotion('Entertainment')).toBe(true);
  });
});
