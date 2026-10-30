// 没入（Immersive）の操作（FR-299・FR-300）: Focus の切替、最近使った Task Context への切替、ゾーン間の移動の計算。
//  - Focus に入る前のモードを覚え、解除（Ctrl+Alt+Enter・⌃⌥Enter、または別のモードの選択）で、直前の配置に戻す。
//  - Esc では解除しない（Esc は最大化の解除など既存の用途がある。FR-013）。
import { activeWorkspace, recentWorkspaces, useTaskWorkspaces } from '../store/taskWorkspaces';
import { useImmersion } from '../store/immersion';
import { DEFAULT_MODE, ZONE_NAMES, type ZoneLayout, type ZoneName } from './zones';
import { switchWorkspace } from './taskContext';

let booted = false;
/** 起動時に 1 回: モードが Focus になった（どの手段でも）ときに直前のモードを覚え、Focus を出たら呼び出したゾーンを戻す */
export function bootImmersion(): void {
  if (booted) return;
  booted = true;
  let prev = new Map<string, string>();
  const snapshot = (): Map<string, string> => new Map(useTaskWorkspaces.getState().items.map((w) => [w.id, w.mode]));
  prev = snapshot();
  useTaskWorkspaces.subscribe((s) => {
    for (const w of s.items) {
      const was = prev.get(w.id);
      if (was !== undefined && was !== w.mode) {
        if (w.mode === 'focus') useImmersion.getState().remember(w.id, was as never);
        else if (was === 'focus') useImmersion.getState().clearRecall();
      }
    }
    prev = new Map(s.items.map((w) => [w.id, w.mode]));
  });
}

/** Focus の切替。Focus なら直前のモード（なければ既定）へ戻し、そうでなければ Focus にする */
export function toggleFocus(): 'entered' | 'left' {
  const st = useTaskWorkspaces.getState();
  const w = activeWorkspace(st);
  if (w.mode === 'focus') {
    const back = useImmersion.getState().before[w.id];
    st.setMode(back && back !== 'focus' ? back : DEFAULT_MODE);
    return 'left';
  }
  st.setMode('focus');
  return 'entered';
}

/** 最近使った Task Context のうち、いまの次のもの（最近使った順の、いまの 1 つ後。最後なら先頭）へ切り替える。切り替えた先の名前、なければ null */
export function switchToNextRecent(): string | null {
  const st = useTaskWorkspaces.getState();
  const list = recentWorkspaces(st.items);
  if (list.length < 2) return null;
  const i = list.findIndex((w) => w.id === st.active);
  const next = list[(i + 1) % list.length]!;
  switchWorkspace(next.id);
  return next.name;
}

/** いま出しているゾーン（結合したものは代表だけ）。ゾーン間の移動の候補 */
export function shownZones(layout: ZoneLayout): ZoneName[] {
  return ZONE_NAMES.filter((n) => layout[n].rect !== null && layout[n].host === n);
}

/** 現在のゾーンから dir（+1 次・-1 前）のゾーン。出しているゾーンが 2 つ未満なら null */
export function stepZone(layout: ZoneLayout, current: ZoneName | undefined, dir: 1 | -1): ZoneName | null {
  const list = shownZones(layout);
  if (list.length < 2) return null;
  const cur = current ? layout[current].host : list[0]!;
  const i = Math.max(0, list.indexOf(cur));
  return list[(i + dir + list.length) % list.length]!;
}
