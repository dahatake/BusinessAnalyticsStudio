// 図の 3D 表示の共通の枠（FR-037 ナレッジグラフ 3D、FR-040 アーキテクチャの 3D レイヤー積層図）。
// 3D の基盤（品質プリセット・業種プリセットの背景・アニメーションの再生/停止）をそのまま使う。モデルは手続きで作り、外部から取得しない（FR-068）。
import { Component, Suspense, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useAnimation } from '../store/animation';
import { countFrame, useIndustryPreset, useView3D } from '../store/view3d';
import { QUALITY_PROFILES } from './quality';
import { tokens } from '../theme/tokens';
import { tr } from '../i18n';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed) return <span role="alert">{tr('3D を表示できませんでした。2D の表示に切り替えてください。')}</span>;
    return this.props.children;
  }
}

function FrameCounter() {
  useFrame(() => countFrame());
  return null;
}

export interface DiagramCanvasProps {
  children: ReactNode;
  cameraPosition?: [number, number, number];
  label: string;
}

/** 3D の図の枠。背景は業種プリセット、アニメーションは再生中だけ連続で描く（止めているときは必要なときだけ描く）。 */
export function DiagramCanvas({ children, cameraPosition = [9, 8, 11], label }: DiagramCanvasProps) {
  const quality = useView3D((s) => s.quality);
  const playing = useAnimation((s) => s.playing);
  const preset = useIndustryPreset();
  const setRenderer = useView3D((s) => s.setRenderer);
  const profile = QUALITY_PROFILES[quality];
  return (
    <div style={{ position: 'relative', width: '100%', height: '60vh', minHeight: 320, flexShrink: 0, overflow: 'hidden', borderRadius: tokens.borderRadiusMedium }} role="img" aria-label={label} data-testid="diagram-3d">
      <Boundary>
        <Canvas
          gl={{ antialias: profile.antialias, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
          dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, profile.maxDpr)}
          frameloop={playing ? 'always' : 'demand'}
          // この枠は WebGL2 で描く（FR-065 AC-080）。設定パネルの描画方式に反映する
          onCreated={() => setRenderer('WebGL2')}
          camera={{ position: cameraPosition, fov: 45 }}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <color attach="background" args={[preset.scene.background]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[6, 10, 6]} intensity={1.4} />
          <Suspense fallback={null}>{children}</Suspense>
          <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2.02} />
          <FrameCounter />
        </Canvas>
      </Boundary>
    </div>
  );
}
