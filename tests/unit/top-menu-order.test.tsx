// @vitest-environment jsdom
// FR-176 AC-355: 作業先・企業・Project の段が、ヘッダーの最初（DOM・Tab 順で、ほかのメニューより先）にある。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AppShell } from '../../src/components/AppShell';

afterEach(() => cleanup());

describe('FR-176 AC-355 最上位のメニューが最初に来る', () => {
  it('FR-176 AC-355 作業先の段（projects-head-slot）が、ヘッダーの最初の子・ナビゲーションより前にある', () => {
    const { container } = render(
      <FluentProvider theme={webLightTheme}>
        <AppShell title="t" screens={[]} onSelect={() => undefined} actions={<button>ペルソナ</button>} stepper={<button>工程</button>}>x</AppShell>
      </FluentProvider>,
    );
    const header = container.querySelector('header');
    const slot = container.querySelector('#projects-head-slot');
    expect(header?.firstElementChild).toBe(slot);
    const nav = container.querySelector('nav');
    expect(slot!.compareDocumentPosition(nav!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const persona = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'ペルソナ')!;
    expect(slot!.compareDocumentPosition(persona) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
