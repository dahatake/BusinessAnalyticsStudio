// 3D の状態（シーン・品質・描画方式・FPS）。FR-065 / FR-066 / FR-069 / NFR-PERF-002
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { registerTestHook } from '../testing/hook';
import { QUALITIES, QualityMonitor, QUALITY_PROFILES, type Quality } from '../three/quality';
import { INDUSTRY_PRESETS, objectCount, resolvePreset, type IndustryPreset, type SceneKey } from '../three/presets';
import { useAnimation } from './animation';
import { usePackStore } from './pack';

export type RendererKind = 'WebGPU' | 'WebGL2' | '判定中';

interface View3DState {
  quality: Quality;
  /** 利用者が選んだ業種プリセット（null は顧客パックの customer.json に従う） */
  industryId: string | null;
  scene: SceneKey;
  renderer: RendererKind;
  fps: number;
  frame: number;
  /** 3D のキャンバスが表示中か（FPS の監視はこのときだけ品質を下げる） */
  active: boolean;
  /** 自動で品質を下げたことの表示 */
  autoNotice: string | null;
  setQuality: (q: Quality) => void;
  setIndustry: (id: string) => void;
  setScene: (s: SceneKey) => void;
  setRenderer: (r: RendererKind) => void;
  setActive: (a: boolean) => void;
}

export const useView3D = create<View3DState>()(
  persist(
    (set) => ({
      quality: 'High',
      industryId: null,
      scene: 'hero',
      renderer: '判定中',
      fps: 0,
      frame: 0,
      active: false,
      autoNotice: null,
      setQuality: (quality) => set({ quality, autoNotice: null }),
      setIndustry: (industryId) => set({ industryId }),
      setScene: (scene) => set({ scene }),
      setRenderer: (renderer) => set({ renderer }),
      setActive: (active) => set({ active }),
    }),
    { name: 'edb.view3d', version: 1, partialize: (s) => ({ quality: s.quality, industryId: s.industryId }) },
  ),
);

/** 現在の業種プリセット（利用者の選択 → 顧客パックの業種 → 製造） */
export function currentPreset(): IndustryPreset {
  const chosen = useView3D.getState().industryId;
  if (chosen) return resolvePreset(chosen);
  const st = usePackStore.getState().state;
  return resolvePreset(st.status === 'ready' ? st.pack.data.customer.industryPreset : undefined);
}

export function useIndustryPreset(): IndustryPreset {
  const chosen = useView3D((s) => s.industryId);
  const packPreset = usePackStore((s) => (s.state.status === 'ready' ? s.state.pack.data.customer.industryPreset : undefined));
  return chosen ? resolvePreset(chosen) : resolvePreset(packPreset);
}

export function countFrame(): void {
  useView3D.setState((s) => ({ frame: s.frame + 1 }));
}

// ---- FPS の計測（アプリ全体で 1 つ。設定パネルでも読めるように常時動かす） ----
const monitor = new QualityMonitor();
let meterStarted = false;

export function startFpsMeter(): void {
  if (meterStarted || typeof requestAnimationFrame === 'undefined') return;
  meterStarted = true;
  let last = performance.now();
  let frames = 0;
  const loop = (now: number) => {
    frames += 1;
    const dt = now - last;
    if (dt >= 500) {
      const fps = (frames * 1000) / dt;
      useView3D.setState({ fps: Math.round(fps * 10) / 10 });
      const s = useView3D.getState();
      if (s.active && useAnimation.getState().playing && document.visibilityState === 'visible') {
        const next = monitor.feed(fps, dt / 1000, s.quality);
        if (next) {
          useView3D.setState({ quality: next, autoNotice: `FPS が低いため、品質を ${s.quality} から ${next} に自動で下げました。` });
        }
      } else {
        monitor.reset();
      }
      frames = 0;
      last = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

registerTestHook('scene', {
  info: () => {
    const s = useView3D.getState();
    return {
      renderer: s.renderer,
      scene: s.scene,
      frame: s.frame,
      quality: s.quality,
      fps: s.fps,
      industryPreset: currentPreset().label,
      objectCount: objectCount(s.scene, currentPreset(), QUALITY_PROFILES[s.quality].particles),
    };
  },
  objects: () => [],
  camera: () => ({ position: [0, 0, 0], target: [0, 0, 0], moving: false }),
});

export { QUALITIES, INDUSTRY_PRESETS };
startFpsMeter();
