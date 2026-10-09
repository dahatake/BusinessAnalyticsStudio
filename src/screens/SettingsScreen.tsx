// 設定パネル（テーマ・3D の品質・業種プリセット）。FR-058 / FR-065 / FR-066 / FR-069
import { Dropdown, Field, Option, Radio, RadioGroup, Text } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { THEME_MODES, useSettings, type ThemeMode } from '../store/settings';
import { INDUSTRY_PRESETS, useIndustryPreset, useView3D } from '../store/view3d';
import { QUALITIES, type Quality } from '../three/quality';

const LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'システムに合わせる' };

export function SettingsScreen() {
  const mode = useSettings((s) => s.themeMode);
  const setMode = useSettings((s) => s.setThemeMode);
  const quality = useView3D((s) => s.quality);
  const setQuality = useView3D((s) => s.setQuality);
  const renderer = useView3D((s) => s.renderer);
  const fps = useView3D((s) => s.fps);
  const notice = useView3D((s) => s.autoNotice);
  const setIndustry = useView3D((s) => s.setIndustry);
  const preset = useIndustryPreset();
  return (
    <Panel testId="component-settings" title="設定パネル" description="表示の設定です。ハイコントラストは OS の設定に従います。">
      <Field label="テーマ">
        <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as ThemeMode)}>
          {THEME_MODES.map((m) => <Radio key={m} value={m} label={LABELS[m]} />)}
        </RadioGroup>
      </Field>
      <Field label="3D の品質">
        <RadioGroup layout="horizontal" value={quality} onChange={(_, d) => setQuality(d.value as Quality)}>
          {QUALITIES.map((q) => <Radio key={q} value={q} label={q} />)}
        </RadioGroup>
      </Field>
      <Field label="業種プリセット">
        <Dropdown
          value={preset.label}
          selectedOptions={[preset.id]}
          onOptionSelect={(_, d) => { if (d.optionValue) setIndustry(d.optionValue); }}
        >
          {INDUSTRY_PRESETS.map((p) => <Option key={p.id} value={p.id}>{p.label}</Option>)}
        </Dropdown>
      </Field>
      <Text as="p" data-testid="quality-current">現在の品質: {quality}</Text>
      <Text as="p" data-testid="fps">FPS: {fps.toFixed(1)} fps</Text>
      <Text as="p" data-testid="renderer">描画方式: {renderer}</Text>
      {notice && <Text as="p" role="status">{notice}</Text>}
    </Panel>
  );
}
