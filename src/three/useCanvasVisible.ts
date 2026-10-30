// 3D の描画面が画面に見えているか（FR-070 AC-086: 非表示・背面の可視化では不要な連続描画を行わない）。
// 表示領域と交わらない（display:none・別画面の背面・画面外）あいだは、連続描画も要求描画も止める（frameloop=never）。
import { useCallback, useEffect, useState } from 'react';

export function useCanvasVisible(): { visible: boolean; attach: (canvas: HTMLCanvasElement) => void } {
  const [el, setEl] = useState<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(true);
  const attach = useCallback((canvas: HTMLCanvasElement) => setEl(canvas), []);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setVisible(last.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return { visible, attach };
}
