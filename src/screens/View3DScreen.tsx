// 3D ビュー（4 つの必須シーン）。FR-065 / FR-066 / FR-069
import { useEffect, useMemo, useState } from 'react';
import { Button, Tab, TabList, Text, makeStyles, tokens } from '@fluentui/react-components';
import { VideoClip20Regular, ZoomFit20Regular } from '@fluentui/react-icons';
import { Panel } from '../components/Panel';
import { ViewAsTableButton, ViewTable, type ViewTableRow } from '../components/ViewTable';
import { AnnotationControls, AnnotationLayer } from '../ink/AnnotationLayer';
import { usePane } from '../workspace/PaneContext';
import { useIndustryPreset, useView3D } from '../store/view3d';
import { cameraPathPoses, flyPath, goHome, useCameraRig } from '../three/cameraRig';
import { SCENE_KEYS, SCENE_LABELS, type SceneKey } from '../three/presets';
import { SceneCanvas } from '../three/SceneCanvas';
import { Breadcrumb, Minimap, useLodNavigation } from '../three/LodNavigator';
import { useTwinLayout, twinTableRows } from '../three/twin';
import { sceneObjects } from '../three/twinProbe';
import { registerSceneArea } from '../three/sceneViewport';
import { twinPairsOf } from '../three/twinLinks';
import { useSelection } from '../selection/hooks';
import { useLod } from '../store/lod';
import { useComponentView, usePublishViewItems } from '../view/useView';
import { isShownInWorld } from '../view/viewModel';

const useStyles = makeStyles({
  tabs: { marginBottom: tokens.spacingVerticalM },
  stage: {
    position: 'relative',
    height: '60vh',
    minHeight: '320px',
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  bar: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalM, marginTop: tokens.spacingVerticalM, flexWrap: 'wrap' },
});

export function View3DScreen() {
  const s = useStyles();
  const scene = useView3D((st) => st.scene);
  const setScene = useView3D((st) => st.setScene);
  const setActive = useView3D((st) => st.setActive);
  const notice = useView3D((st) => st.autoNotice);
  const preset = useIndustryPreset();
  const [toBe, setToBe] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const layout = useTwinLayout();
  const lod = useLodNavigation();
  const moving = useCameraRig((st) => st.moving);
  // 「表で見る」（NFR-A11Y-003）: 表にした時点で 3D ビューに見えていた項目（ほかの項目に隠れる・画面の外の項目は除く）
  const [asTable, setAsTable] = useState(false);
  const [shownIds, setShownIds] = useState<string[]>([]);
  const toggleTable = (): void => {
    if (!asTable) setShownIds(sceneObjects().filter((o) => o.visible).map((o) => o.entityId));
    setAsTable((v) => !v);
  };
  const shownRows = useMemo<ViewTableRow[]>(() => twinTableRows(layout, shownIds), [shownIds, layout]);

  // 世界の表示（FR-218）で描いている項目と、線で結んでいるツイン関係（t.view.state）
  const { world } = useComponentView('view3d');
  const { graph } = useSelection();
  const lodKey = useLod((st) => st.key);
  const itemIds = useMemo(() => (layout?.objects ?? []).filter((o) => isShownInWorld(o.world, world)).map((o) => o.entityId), [layout, world]);
  const twinLinks = useMemo(
    () => (layout && world === 'both' ? twinPairsOf(graph, layout, (o) => lodKey[o.depth] === '1') : []),
    [layout, world, graph, lodKey],
  );
  usePublishViewItems('view3d', itemIds, twinLinks);

  const pane = usePane();
  // ワークスペースのタブで隠れているときは、3D を表示していないものとして扱う（FPS の計測・自動の品質低下の対象にしない）
  const visible = pane ? pane.visible : true;

  useEffect(() => {
    setActive(visible);
    return () => setActive(false);
  }, [setActive, visible]);

  // P キーの再生／停止と「アニメーション: 再生中／停止中」の表示は、アプリ全体で 1 つ（src/motion/AnimationController.tsx。FR-071）

  return (
    <Panel testId="component-view3d" title="3D ビュー" description={`業種プリセット: ${preset.label}。ドラッグで回転、ホイールで拡大縮小できます。「表で見る」で、見えている項目を表で読めます。`}>
      <TabList className={s.tabs} selectedValue={scene} onTabSelect={(_, d) => setScene(d.value as SceneKey)} aria-label="3D シーン">
        {SCENE_KEYS.map((k) => <Tab key={k} value={k}>{SCENE_LABELS[k]}</Tab>)}
      </TabList>
      <div className={s.bar}>
        <ViewAsTableButton asTable={asTable} onToggle={toggleTable} />
      </div>
      {asTable ? (
        scene === 'hero' ? (
          <>
            <Text role="status" size={200}>3D ビューに見えている項目: {shownRows.length} 件（ほかの項目に隠れている項目・画面の外の項目は含みません）。</Text>
            <ViewTable label="3D ビューの項目" origin="view3d" columns={['名称', '種別', '上位の項目', '下位の項目数']} rows={shownRows} />
          </>
        ) : (
          <Text role="status">
            このシーン（{SCENE_LABELS[scene]}）は業種プリセット「{preset.label}」の演出で、項目の一覧はありません。項目（デジタルツイン）は「{SCENE_LABELS.hero}」のシーンで表にできます。
          </Text>
        )
      ) : (
        <>
          {scene === 'hero' && lod.layout && lod.layout.objects.length > 0 && <Breadcrumb chain={lod.chain} />}
          <div className={s.stage} ref={registerSceneArea} data-zoom-surface="3d">
            <SceneCanvas toBe={toBe} />
            {scene === 'hero' && lod.layout && lod.layout.objects.length > 0 && <Minimap layout={lod.layout} chain={lod.chain} />}
            <AnnotationLayer viewKey="view3d" label="3D ビュー" active={annotating} />
          </div>
          <AnnotationControls viewKey="view3d" active={annotating} onToggle={setAnnotating} />
          <div className={s.bar}>
            {scene === 'asis-tobe' && (
              <Button appearance="primary" onClick={() => setToBe((v) => !v)}>{toBe ? 'AsIs に戻す' : 'ToBe へ変形'}</Button>
            )}
            {scene === 'hero' && (
              <>
                <Button icon={<VideoClip20Regular aria-hidden />} disabled={moving} onClick={() => flyPath(cameraPathPoses(preset.cameraPath, layout), () => goHome(true))}>
                  カメラパスを再生
                </Button>
                <Button icon={<ZoomFit20Regular aria-hidden />} disabled={moving} onClick={() => goHome(true)}>全体を見渡す</Button>
              </>
            )}
            {notice && <Text role="status" data-testid="quality-notice">{notice}</Text>}
          </div>
        </>
      )}
    </Panel>
  );
}
