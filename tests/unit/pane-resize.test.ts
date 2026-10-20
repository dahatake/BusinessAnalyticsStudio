// FR-224（コンポーネントの縦横の独立したサイズ変更）・FR-222（見出しの操作）の単体テスト。
// FR-224 AC-521 AC-522 / FR-222 AC-518
import { describe, expect, it, vi } from 'vitest';
import { MIN_H, MIN_W, resizeRect } from '../../src/workspace/freeLayout';
import { paneCommands } from '../../src/workspace/paneCommands';
import { PIN_RESIZE_REASON } from '../../src/workspace/paneActions';
import type { PaneInfo } from '../../src/workspace/PaneContext';

const B = { w: 1000, h: 600 };
const R = { x: 100, y: 100, w: 400, h: 300 };

describe('FR-224 AC-521 縦横を独立に変える', () => {
  // FR-224 AC-521
  it('FR-224 AC-521 右の縁は横だけ、下の縁は縦だけ、角は両方を変え、左上は動かない', () => {
    expect(resizeRect(R, 'e', 50, 80, B)).toEqual({ ...R, w: 450 });
    expect(resizeRect(R, 's', 50, 80, B)).toEqual({ ...R, h: 380 });
    expect(resizeRect(R, 'se', 50, 80, B)).toEqual({ ...R, w: 450, h: 380 });
  });

  // FR-224 AC-521
  it('FR-224 AC-521 最小の大きさを下回らず、作業領域からはみ出さない', () => {
    expect(resizeRect(R, 'se', -5000, -5000, B)).toEqual({ ...R, w: MIN_W, h: MIN_H });
    expect(resizeRect(R, 'se', 5000, 5000, B)).toEqual({ ...R, w: B.w - R.x, h: B.h - R.y });
  });
});

describe('FR-224 AC-522 コマンドでの変更とピン止め', () => {
  const pane = (pinned: boolean): PaneInfo => ({ pinned, resizeBy: vi.fn() }) as unknown as PaneInfo;

  // FR-224 AC-522
  it('FR-224 AC-522 コマンドで縦・横それぞれを広げる・狭める', () => {
    const p = pane(false);
    const cmds = paneCommands(() => p, vi.fn());
    for (const id of ['pane.resize.w.grow', 'pane.resize.w.shrink', 'pane.resize.h.grow', 'pane.resize.h.shrink']) cmds.find((c) => c.id === id)!.run();
    expect(p.resizeBy).toHaveBeenNthCalledWith(1, 'w', 1);
    expect(p.resizeBy).toHaveBeenNthCalledWith(2, 'w', -1);
    expect(p.resizeBy).toHaveBeenNthCalledWith(3, 'h', 1);
    expect(p.resizeBy).toHaveBeenNthCalledWith(4, 'h', -1);
  });

  // FR-224 AC-522
  it('FR-224 AC-522 ピン止めしたコンポーネントは変更せず、理由を示す', () => {
    const p = pane(true);
    const notify = vi.fn();
    paneCommands(() => p, notify).find((c) => c.id === 'pane.resize.w.grow')!.run();
    expect(p.resizeBy).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(PIN_RESIZE_REASON);
  });
});
