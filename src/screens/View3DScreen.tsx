// 3D ビュー（4 つの必須シーン）。FR-065 / FR-066 / FR-069
import { useEffect, useState } from 'react';
import { Button, Tab, TabList, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { usePane } from '../workspace/PaneContext';
import { useIndustryPreset, useView3D } from '../store/view3d';
import { SCENE_KEYS, SCENE_LABELS, type SceneKey } from '../three/presets';
import { SceneCanvas } from '../three/SceneCanvas';

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

  const pane = usePane();
  // ワークスペースのタブで隠れているときは、3D を表示していないものとして扱う（FPS の計測・自動の品質低下の対象にしない）
  const visible = pane ? pane.visible : true;

  useEffect(() => {
    setActive(visible);
    return () => setActive(false);
  }, [setActive, visible]);

  // P キーの再生／停止と「アニメーション: 再生中／停止中」の表示は、アプリ全体で 1 つ（src/motion/AnimationController.tsx。FR-071）

  return (
    <Panel testId="component-view3d" title="3D ビュー" description={`業種プリセット: ${preset.label}。ドラッグで回転、ホイールで拡大縮小できます。`}>
      <TabList className={s.tabs} selectedValue={scene} onTabSelect={(_, d) => setScene(d.value as SceneKey)} aria-label="3D シーン">
        {SCENE_KEYS.map((k) => <Tab key={k} value={k}>{SCENE_LABELS[k]}</Tab>)}
      </TabList>
      <div className={s.stage}>
        <SceneCanvas toBe={toBe} />
      </div>
      <div className={s.bar}>
        {scene === 'asis-tobe' && (
          <Button appearance="primary" onClick={() => setToBe((v) => !v)}>{toBe ? 'AsIs に戻す' : 'ToBe へ変形'}</Button>
        )}
        {notice && <Text role="status" data-testid="quality-notice">{notice}</Text>}
      </div>
    </Panel>
  );
}
