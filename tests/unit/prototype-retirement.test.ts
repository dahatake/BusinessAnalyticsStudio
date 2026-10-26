// @vitest-environment jsdom
// FR-043 AC-054 / FR-287 AC-748: 廃止画面の導線と既存データの互換性。
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';
import { SCREENS } from '../../src/screens/registry';
import { STEPS } from '../../src/stepper/model';
import { CustomerSchema, SCREEN_GUIDE_KEYS, SCREEN_GUIDE_MAX } from '../../src/schema/files';
import { defaultLayout, keysOf, leaf, prune, split } from '../../src/workspace/layoutModel';
import { effectiveLayout, setAvailableComponents } from '../../src/store/layout';
import { GROUP_OF, ROLE_OF } from '../../src/workspace/tiers';

const available = new Set(SCREENS.map((screen) => screen.key));
const customer = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'examples/mono/public/data/customer.json'), 'utf8'));

describe('FR-043 AC-054 prototype retirement', () => {
  it('FR-043 AC-054 keeps every other registered screen and removes all stepper/default-layout routes', () => {
    expect(available.size).toBe(24);
    expect(available.has('memo')).toBe(true);
    expect(available.has('mock-app')).toBe(false);
    for (const key of ['issue-solution', 'usecase', 'whiteboard', 'chat']) expect(available.has(key)).toBe(true);
    for (const step of STEPS) {
      expect([step.screen, ...step.screens, ...(step.also ?? [])]).not.toContain('mock-app');
    }
    expect(STEPS.find((step) => step.key === 'usecase')?.screen).toBe('usecase');
    for (const persona of ['経営層', '事業部門', 'IT', '現場'] as const) expect(keysOf(defaultLayout(persona))).not.toContain('mock-app');
    expect(ROLE_OF).not.toHaveProperty('mock-app');
    expect(GROUP_OF).not.toHaveProperty('mock-app');
  });

  it('FR-043 AC-054 prunes legacy-only branches and repairs mixed active tabs without mutating saved input', () => {
    const legacy = split('row', [leaf('mock-app'), { kind: 'tabs', tabs: ['mock-app', 'usecase', 'whiteboard'], active: 'mock-app' }]);
    const initial = structuredClone(legacy);
    expect(prune(legacy, available)).toEqual({ kind: 'tabs', tabs: ['usecase', 'whiteboard'], active: 'usecase' });
    expect(legacy).toEqual(initial);
    setAvailableComponents([...available]);
    const restored = effectiveLayout({ persona: '現場', layouts: { 現場: leaf('mock-app') } });
    expect(keysOf(restored).length).toBeGreaterThan(0);
    expect(keysOf(restored).every((key) => available.has(key))).toBe(true);
    expect(keysOf(restored)).not.toContain('mock-app');
    // Deliberately hidden workspaces remain hidden rather than being reset.
    expect(effectiveLayout({ persona: '現場', layouts: { 現場: null } })).toBeNull();
  });
});

describe('FR-287 AC-748 current guides and optional legacy compatibility', () => {
  it('FR-287 AC-748 requires all 23 in-scope guides without adding a requirement for memo', () => {
    expect([...SCREEN_GUIDE_KEYS].sort()).toEqual([...available].filter((key) => key !== 'memo').sort());
    expect(CustomerSchema.safeParse(customer).success).toBe(true);
    for (const key of SCREEN_GUIDE_KEYS) {
      const input = structuredClone(customer);
      delete input.screenGuides[key];
      expect(CustomerSchema.safeParse(input).success, key).toBe(false);
    }
  });

  it('FR-043 AC-054 FR-287 AC-748 accepts both legacy guide variants and retains every supplied field', () => {
    for (const legacy of [false, true]) {
      const input = structuredClone(customer);
      if (legacy) input.screenGuides['mock-app'] = '保存済みの試作説明';
      else delete input.screenGuides['mock-app'];
      expect(CustomerSchema.parse(input).screenGuides).toEqual(input.screenGuides);
    }
    const invalid = structuredClone(customer);
    invalid.screenGuides.chat = 'あ'.repeat(SCREEN_GUIDE_MAX + 1);
    expect(CustomerSchema.safeParse(invalid).success).toBe(false);
    invalid.screenGuides.chat = ' ';
    expect(CustomerSchema.safeParse(invalid).success).toBe(false);
  });
});
