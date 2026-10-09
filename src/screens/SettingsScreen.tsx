// 設定パネル（テーマの切替）。FR-058
import { Field, Radio, RadioGroup } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { THEME_MODES, useSettings, type ThemeMode } from '../store/settings';

const LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'システムに合わせる' };

export function SettingsScreen() {
  const mode = useSettings((s) => s.themeMode);
  const setMode = useSettings((s) => s.setThemeMode);
  return (
    <Panel testId="component-settings" title="設定パネル" description="表示の設定です。ハイコントラストは OS の設定に従います。">
      <Field label="テーマ">
        <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as ThemeMode)}>
          {THEME_MODES.map((m) => <Radio key={m} value={m} label={LABELS[m]} />)}
        </RadioGroup>
      </Field>
    </Panel>
  );
}
