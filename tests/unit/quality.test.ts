import { describe, expect, it } from 'vitest';
import { FPS_DURATION_SEC, FPS_THRESHOLD, QUALITIES, QualityMonitor, lowerQuality } from '../../src/three/quality';

describe('品質監視（FR-069）', () => {
  // FR-069 AC-084
  it('AC-084 PARAM-027 未満の FPS を PARAM-028 続けると 1 段階下がる', () => {
    expect(FPS_THRESHOLD).toBe(45);
    expect(FPS_DURATION_SEC).toBe(2);
    const m = new QualityMonitor();
    expect(m.feed(30, 1, 'High')).toBeNull();
    expect(m.feed(30, 1, 'High')).toBe('Medium');
  });

  // FR-069 AC-084
  it('AC-084 しきい値以上に戻っても自動では上がらず、継続は途切れたらやり直す', () => {
    const m = new QualityMonitor();
    expect(m.feed(30, 1.5, 'High')).toBeNull();
    expect(m.feed(60, 0.5, 'High')).toBeNull();
    expect(m.feed(30, 1.5, 'High')).toBeNull();
    expect(m.feed(60, 10, 'Medium')).toBeNull();
    expect(m.feed(45, 10, 'Medium')).toBeNull();
  });

  // FR-069 AC-084
  it('AC-084 さらに続けるとさらに 1 段階ずつ下がり、Low より下には下がらない', () => {
    const m = new QualityMonitor();
    let q: (typeof QUALITIES)[number] = 'Ultra';
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const n = m.feed(10, 1, q);
      if (n) { q = n; seen.push(n); }
    }
    expect(seen).toEqual(['High', 'Medium', 'Low']);
    expect(lowerQuality('Low')).toBeNull();
  });
});
