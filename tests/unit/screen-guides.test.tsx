// @vitest-environment jsdom
// FR-287 AC-748・AC-749・AC-750・AC-751・AC-752（デモの screenGuides・議論ツリー）。単体・結合テスト。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import fs from 'node:fs';
import path from 'node:path';
import { Panel } from '../../src/components/Panel';
import { demoTreeDoc } from '../../src/analysis/tree';
import { CustomerSchema, SCREEN_GUIDE_KEYS, SCREEN_GUIDE_MAX } from '../../src/schema/files';
import { usePackStore } from '../../src/store/pack';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';

const registry = fs.readFileSync(path.join(REPO_ROOT, 'src', 'screens', 'registry.ts'), 'utf8');
const customer = (kind: string) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'examples', kind, 'public', 'data', 'customer.json'), 'utf8'));

afterEach(cleanup);

describe('FR-287 screenGuides', () => {
  // FR-287 AC-748
  it('FR-287 AC-748 SCREEN_GUIDE_KEYS は登録簿の対象 23 キーと一致し、memo は残す', () => {
    const registered = [...registry.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(registered).toContain('memo');
    expect(registered).not.toContain('mock-app');
    const keys = registered.filter((key) => key !== 'memo');
    expect([...SCREEN_GUIDE_KEYS].sort()).toEqual([...keys].sort());
    expect(keys).toHaveLength(23);
  });

  for (const kind of ['mono', 'koto']) {
    // FR-287 AC-748
    it(`FR-287 AC-748 ${kind}: 23 件すべての説明が上限以内`, () => {
      const g = customer(kind).screenGuides as Record<string, string>;
      expect(SCREEN_GUIDE_KEYS.every((key) => typeof g[key] === 'string' && g[key].trim().length > 0)).toBe(true);
      expect(CustomerSchema.safeParse(customer(kind)).success).toBe(true);
      for (const v of Object.values(g)) expect([...v].length).toBeLessThanOrEqual(SCREEN_GUIDE_MAX);
    });
  }

  // FR-287 AC-749（見出し・補足への表示）と AC-752（ないパックでは出さない）
  it('FR-287 AC-749 Panel は screenGuides の説明を表示し、AC-752 持たないパックでは表示しない', () => {
    const base = { customer: { name: 'x', projectName: 'y', screenGuides: { canvas: 'この画面で見えるもの' } } };
    usePackStore.setState({ state: { status: 'ready', pack: { data: base } } } as never);
    const ui = <FluentProvider theme={webLightTheme}><Panel testId="component-canvas" title="T"><p>b</p></Panel></FluentProvider>;
    const r = render(ui);
    expect(screen.getByTestId('screen-guide').textContent).toBe('この画面で見えるもの');
    r.unmount();
    usePackStore.setState({ state: { status: 'ready', pack: { data: { customer: { name: 'x', projectName: 'y' } } } } } as never);
    render(ui);
    expect(screen.queryByTestId('screen-guide')).toBeNull();
  });

  // FR-287 AC-750
  it('FR-287 AC-750 demoTreeDoc は discussionTheme からノードを作り、持たない実際の Project では undefined', () => {
    expect(demoTreeDoc({ customer: { name: 'x' } } as never)).toBeUndefined();
    for (const kind of ['mono', 'koto']) {
      const f = (n: string) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'examples', kind, 'public', 'data', n + '.json'), 'utf8'));
      const doc = demoTreeDoc({ customer: customer(kind), issues: f('issues'), products: f('products'), sources: f('sources') } as never);
      expect(doc?.nodes.length ?? 0).toBeGreaterThan(0);
    }
  });
});
