// Twin ビューのミニマップ（FR-033 AC-040）。項目の配置を真上から見た小さな図にし、今の階層で見ている範囲（全体・塊・項目）を枠で示す。
import { tokens } from '@fluentui/react-components';
import type { Item3D } from '../view/items3d';

const W = 140;
const H = 80;
const PAD = 6;

export interface TwinMinimapProps {
  items: readonly Item3D[];
  /** 今の表示範囲に入る項目の ID。空なら全体 */
  inView: ReadonlySet<string>;
  /** 表示範囲の説明（支援技術向け） */
  status: string;
}

export function TwinMinimap({ items, inView, status }: TwinMinimapProps) {
  const px = (v: number): number => PAD + v * (W - PAD * 2);
  const py = (v: number): number => PAD + v * (H - PAD * 2);
  const picked = inView.size > 0 ? items.filter((i) => inView.has(i.id)) : items;
  const xs = picked.map((i) => i.x);
  const zs = picked.map((i) => i.z);
  const x0 = px(Math.min(...xs, 1)) - 4;
  const x1 = px(Math.max(...xs, 0)) + 4;
  const y0 = py(Math.min(...zs, 1)) - 4;
  const y1 = py(Math.max(...zs, 0)) + 4;
  const whole = picked.length === 0;
  return (
    <div
      data-testid="minimap"
      role="group"
      aria-label={`ミニマップ。${status}`}
      style={{ position: 'absolute', top: 0, right: 0, zIndex: 3, padding: tokens.spacingHorizontalXS, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}` }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block' }}>
        {items.map((i) => <circle key={i.id} cx={px(i.x)} cy={py(i.z)} r={2} style={{ fill: inView.size === 0 || inView.has(i.id) ? tokens.colorBrandBackground : tokens.colorNeutralForeground4 }} />)}
        <rect
          data-testid="minimap-viewport"
          x={whole ? 1 : Math.max(1, x0)}
          y={whole ? 1 : Math.max(1, y0)}
          width={whole ? W - 2 : Math.max(8, Math.min(W - 1, x1) - Math.max(1, x0))}
          height={whole ? H - 2 : Math.max(8, Math.min(H - 1, y1) - Math.max(1, y0))}
          style={{ fill: tokens.colorBrandBackground, fillOpacity: 0.15, stroke: tokens.colorBrandStroke1, strokeWidth: 2, pointerEvents: 'none' }}
        />
      </svg>
    </div>
  );
}
