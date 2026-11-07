// @vitest-environment jsdom
// FR-295 AC-887 ⑨ Q-103 A: 最大化中にモードの切替・ゾーンの結合を行うと、先に最大化が解かれてから切替・結合が行われる（最大化は残らない）
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { WorkspacePanel } from '../../src/workspace/WorkspacePanel';
import { useLayout } from '../../src/store/layout';
import { useTaskWorkspaces } from '../../src/store/taskWorkspaces';

afterEach(() => cleanup());
beforeEach(() => { useLayout.setState({ maximized: null }); });

const mount = () => render(<FluentProvider theme={webLightTheme}><WorkspacePanel /></FluentProvider>);

describe('FR-295 AC-887 ⑨ 最大化中のモード切替・ゾーン結合', () => {
  it('FR-295 AC-887 ⑨ 最大化中にモードを切り替えると、最大化が解けてからモードが切り替わる', () => {
    mount();
    useLayout.setState({ maximized: 'summary' });
    const before = useTaskWorkspaces.getState().items.find((w) => w.id === useTaskWorkspaces.getState().active)?.mode;
    const radios = screen.getAllByRole('radio');
    const other = radios.find((r) => !(r as HTMLInputElement).checked);
    expect(other).toBeTruthy();
    fireEvent.click(other!);
    expect(useLayout.getState().maximized).toBeNull();
    const after = useTaskWorkspaces.getState().items.find((w) => w.id === useTaskWorkspaces.getState().active)?.mode;
    expect(after).not.toBe(before);
  });
  it('FR-295 AC-887 ⑨ 最大化していないときのモード切替は最大化に触れない（最大化なしのまま）', () => {
    mount();
    const other = screen.getAllByRole('radio').find((r) => !(r as HTMLInputElement).checked);
    fireEvent.click(other!);
    expect(useLayout.getState().maximized).toBeNull();
  });
});
