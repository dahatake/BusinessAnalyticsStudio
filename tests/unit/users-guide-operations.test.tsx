// @vitest-environment jsdom
// FR-149 AC-254・AC-255・AC-256（結合）: users-guide の操作の照合表（docs/users-guide-operations.md）と、今回加えた常時見える操作部品。
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MuteButton } from '../../src/audio/AudioControls';
import { Dock } from '../../src/workspace/Controls';
import { useSettings } from '../../src/store/settings';
import { setAvailableComponents, useLayout } from '../../src/store/layout';

afterEach(cleanup);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const rows = fs.readFileSync('docs/users-guide-operations.md', 'utf8').split('\n')
  .filter((l) => l.startsWith('| ') && !l.startsWith('| 操作名') && !l.startsWith('|---'))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

describe('FR-149 AC-254 users-guide の操作の照合表', () => {
  // FR-149 AC-254
  it('FR-149 AC-254 一覧は 50 行以上で、すべての行に節・画面上の手段・部品の名前があり、手段のない操作が 0 件', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50);
    for (const [name, section, means, part] of rows) {
      expect(name, '操作名').toBeTruthy();
      expect(section, `${name}: 節`).toMatch(/\d\d §|01 §|02/);
      expect(means, `${name}: 画面上の手段`).toBeTruthy();
      expect(means, `${name}: キー操作だけは手段にならない`).not.toMatch(/^(キー|ショートカット)/);
      expect(part, `${name}: 部品の名前`).toMatch(/^`.+`$/);
    }
  });

  // FR-149 AC-254
  it('FR-149 AC-254 各行の部品の名前が src の中にある（画面に出る文字・aria-label・role）', () => {
    const text = walk('src').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const missing = rows.map((r) => r[3]!.replace(/`/g, '')).filter((n) => !text.includes(n));
    expect(missing).toEqual([]);
  });
});

describe('FR-149 AC-255 常時見える操作部品の追加', () => {
  // FR-149 AC-255
  it('FR-149 AC-255 ミュートのボタンは、切り替えるたびに名前（aria-label）が変わり、空にならない', () => {
    useSettings.setState({ muted: true });
    render(<FluentProvider theme={webLightTheme}><MuteButton /></FluentProvider>);
    const before = screen.getByRole('button', { name: /ミュート/ }).getAttribute('aria-label');
    expect(before).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ミュート/ }));
    const after = screen.getByRole('button', { name: /ミュート/ }).getAttribute('aria-label');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  // FR-149 AC-255 AC-256
  it('FR-149 AC-255 非表示のコンポーネントを開くボタンがドックにあり、キーボードで操作できる（button）', () => {
    setAvailableComponents(['a', 'b']);
    useLayout.setState({ persona: '経営層' });
    const screens = [{ key: 'a', label: 'A', icon: () => null }, { key: 'b', label: 'B', icon: () => null }] as never;
    act(() => { render(<FluentProvider theme={webLightTheme}><Dock screens={screens} /></FluentProvider>); });
    const b = screen.getByRole('button', { name: /非表示のコンポーネント/ });
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('aria-haspopup')).toBe('menu');
  });
});

describe('FR-149 AC-256 当たり判定', () => {
  // FR-149 AC-256: 追加した部品は、既定で 24 CSS px（PARAM-040）以上の高さの Fluent の Button（small は 24px）かそれより大きい
  it('FR-149 AC-256 ドックのボタンの最小の高さは 32px 以上で指定されている', () => {
    const src = fs.readFileSync('src/workspace/Controls.tsx', 'utf8');
    expect(src).toMatch(/dockButton: \{[^}]*minHeight: '32px'/);
  });
});
