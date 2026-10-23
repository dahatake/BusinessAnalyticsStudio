// FR-223 AC-519・AC-520: 設定はモーダルの画面で、ワークスペースのコンポーネント（レイアウトの対象）にならない。
import { describe, expect, it } from 'vitest';
import { SCREENS } from '../../src/screens/registry';
import { useSettingsModal } from '../../src/store/settingsModal';
import { setAvailableComponents, isComponentVisible } from '../../src/store/layout';

describe('FR-223 設定のモーダル表示', () => {
  // FR-223 AC-519
  it('FR-223 AC-519 設定はモーダルの画面として登録され、レイアウトの対象のキーに含まれない', () => {
    const settings = SCREENS.find((s) => s.key === 'settings');
    expect(settings?.modal).toBe(true);
    setAvailableComponents(SCREENS.filter((s) => !s.modal).map((s) => s.key));
    expect(isComponentVisible('settings')).toBe(false);
    expect(isComponentVisible('matrix')).toBe(true);
  });

  // FR-223 AC-520
  it('FR-223 AC-520 開閉の状態は保存せず、閉じると false に戻る', () => {
    useSettingsModal.getState().setOpen(true);
    expect(useSettingsModal.getState().open).toBe(true);
    useSettingsModal.getState().setOpen(false);
    expect(useSettingsModal.getState().open).toBe(false);
  });
});
