// 3D ビュー（4 つの必須シーン）。FR-065 / FR-066 / FR-069
import { useEffect, useState } from 'react';
import { Button, Tab, TabList, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { useAnimation } from '../store/animation';
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
  const playing = useAnimation((st) => st.playing);
  const toggle = useAnimation((st) => st.toggle);
  const preset = useIndustryPreset();
  const [toBe, setToBe] = useState(false);

  useEffect(() => {
    setActive(true);
    return () => setActive(false);
  }, [setActive]);

  // P キーでアニメーションの再生／停止
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'p' || e.key === 'P') toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

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
        <Text data-testid="animation-state">アニメーション: {playing ? '再生中' : '停止中'}（P キーで切替）</Text>
        {notice && <Text role="status" data-testid="quality-notice">{notice}</Text>}
      </div>
    </Panel>
  );
}
