// パンくずリストとミニマップ（FR-033）。3D ビューの上に置き、現在の階層を示し、クリックまたは Enter でその場所へフライスルーする。
// 階層の判定はカメラの注視点と、表示中のレベル（src/store/lod.ts）から。キャンバスが非表示でも同じ値を読める。
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useLod } from '../store/lod';
import { CAMERA_FOV, currentPose, flyTo, framePose, useCameraRig } from '../three/cameraRig';
import type { TwinLayout, TwinObject } from '../three/entityLayout';
import { focusChain, minimapModel, minimapNeighbor } from '../three/lod';
import { viewportAspect } from '../three/sceneViewport';
import { useTwinLayout } from '../three/twin';

const useStyles = makeStyles({
  nav: { marginBottom: tokens.spacingVerticalS },
  list: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', listStyleType: 'none', margin: 0, padding: 0, columnGap: tokens.spacingHorizontalXS },
  item: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS },
  sep: { color: tokens.colorNeutralForeground3 },
  chip: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, border: `1px solid ${tokens.colorNeutralStroke1}` },
  link: {
    color: tokens.colorBrandForegroundLink,
    textDecorationLine: 'underline',
    cursor: 'pointer',
    ':hover': { color: tokens.colorBrandForegroundLinkHover },
  },
  current: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  minimap: {
    position: 'absolute',
    right: tokens.spacingHorizontalM,
    bottom: tokens.spacingVerticalM,
    zIndex: 3,
    padding: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow8,
  },
  mapSvg: { display: 'block', cursor: 'pointer' },
  srOnly: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
});

/** 項目の階層の視点へ移動する（フライスルー。アニメーション停止中は即座に切り替わる）。選択は変えない。 */
export function flyToEntity(o: TwinObject): void {
  flyTo(framePose(o, currentPose()));
}

/** 今の階層（最上位から順の親子の列） */
export function useFocusChain(layout: TwinLayout | null): TwinObject[] {
  const target = useCameraRig((s) => s.target);
  const shown = useLod((s) => s.shownDepth);
  return useMemo(() => (layout ? focusChain(layout, target, shown) : []), [layout, target, shown]);
}

export function Breadcrumb({ chain }: { chain: readonly TwinObject[] }) {
  const s = useStyles();
  const specs = useLod((st) => st.specs);
  return (
    <nav aria-label="パンくずリスト" data-testid="breadcrumb" className={s.nav}>
      <ol className={s.list}>
        {chain.map((o, i) => {
          const meta = specs[o.depth]?.meta;
          const last = i === chain.length - 1;
          const title = meta ? `${meta.name ?? `階層 ${o.depth}`}: ${meta.description}（KPI: ${meta.kpi}）` : undefined;
          return (
            <li key={o.entityId} className={s.item}>
              {i > 0 && <span className={s.sep} aria-hidden="true">›</span>}
              {meta && <span className={s.chip} style={{ backgroundColor: meta.color }} aria-hidden="true" />}
              <a
                href={`#${o.entityId}`}
                title={title}
                aria-current={last ? 'location' : undefined}
                className={mergeClasses(s.link, last && s.current)}
                onClick={(e: MouseEvent) => { e.preventDefault(); flyToEntity(o); }}
              >
                {o.name}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** 真上から見た配置図。現在の表示範囲（視野）を枠で示し、場所をクリックするとそこへ移動する。 */
export function Minimap({ layout, chain }: { layout: TwinLayout; chain: readonly TwinObject[] }) {
  const s = useStyles();
  const position = useCameraRig((st) => st.position);
  const target = useCameraRig((st) => st.target);
  const shown = useLod((st) => st.shownDepth);
  const specs = useLod((st) => st.specs);
  const model = useMemo(
    () => minimapModel(layout, { position, target }, { aspect: viewportAspect(), fovDeg: CAMERA_FOV, maxDepth: shown }),
    [layout, position, target, shown],
  );
  const current = new Set(chain.map((o) => o.entityId));
  // キーボード操作: ミニマップにフォーカスして、矢印キーで場所を選び、Enter でその場所へ移動する。選択中の場所と表示範囲は、テキストでも読み上げる
  const [cursor, setCursor] = useState<string | null>(null);
  const tail = chain[chain.length - 1];
  const cursorObj = cursor ? layout.byId.get(cursor) : undefined;
  const status = cursorObj && cursorObj.depth <= shown
    ? `ミニマップの選択: ${cursorObj.name}。Enter でその場所へ移動します。`
    : `現在の表示範囲: ${chain.map((o) => o.name).join('、')}。`;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const from = cursorObj && cursorObj.depth <= shown ? cursorObj.entityId : tail?.entityId;
    if (!from) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setCursor(minimapNeighbor(layout, shown, from, e.key));
    } else if (e.key === 'Enter' || e.key === ' ') {
      const o = layout.byId.get(from);
      if (!o) return;
      e.preventDefault();
      e.stopPropagation();
      flyToEntity(o);
    }
  };
  const goTo = (px: number, py: number): void => {
    const [x, z] = model.toWorld(px, py);
    const hit = focusChain(layout, [x, 0, z], shown);
    const last = hit[hit.length - 1];
    if (last) flyToEntity(last);
  };
  return (
    <div
      className={s.minimap}
      data-testid="minimap"
      role="group"
      tabIndex={0}
      aria-label="ミニマップ。矢印キーで場所を選び、Enter でその場所へ移動します"
      onKeyDown={onKeyDown}
      onBlur={() => setCursor(null)}
    >
      <span className={s.srOnly} role="status" aria-live="polite" data-testid="minimap-status">{status}</span>
      <svg
        className={s.mapSvg}
        width={model.width}
        height={model.height}
        viewBox={`0 0 ${model.width} ${model.height}`}
        aria-hidden="true"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          goTo(((e.clientX - r.left) / r.width) * model.width, ((e.clientY - r.top) / r.height) * model.height);
        }}
      >
        {model.rects.map((r) => {
          const o = layout.byId.get(r.entityId)!;
          const fill = specs[r.depth]?.meta?.color ?? (o.platform ? tokens.colorNeutralBackground5 : tokens.colorBrandBackground2);
          const picked = cursor === r.entityId;
          return (
            <rect
              key={r.entityId}
              data-minimap-id={r.entityId}
              x={r.x}
              y={r.y}
              width={Math.max(1.5, r.w)}
              height={Math.max(1.5, r.h)}
              style={{
                fill,
                fillOpacity: o.platform ? 0.35 : 0.9,
                stroke: picked ? tokens.colorStatusWarningBorder1 : current.has(r.entityId) ? tokens.colorBrandStroke1 : tokens.colorNeutralStroke2,
                strokeWidth: picked ? 3 : current.has(r.entityId) ? 2 : 1,
              }}
            >
              <title>{o.name}</title>
            </rect>
          );
        })}
        <polygon
          data-testid="minimap-viewport"
          points={model.viewport.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
          style={{ fill: tokens.colorBrandBackground, fillOpacity: 0.15, stroke: tokens.colorBrandStroke1, strokeWidth: 2, pointerEvents: 'none' }}
        />
      </svg>
    </div>
  );
}

/** パンくずリスト（3D の上）。ミニマップは、キャンバスの上に重ねるため別に置く。 */
export function useLodNavigation(): { layout: TwinLayout | null; chain: TwinObject[] } {
  const layout = useTwinLayout();
  const chain = useFocusChain(layout);
  return { layout, chain };
}
