// 設定の「作業先」欄（FR-144 AC-240・AC-241）。選択画面にデモを出すかの switch と、デモへ切り替えるボタン。
import { Button, Switch, Text } from '@fluentui/react-components';
import { useSettings } from '../store/settings';
import { switchToDemo } from './workTargetUi';
import { useT } from '../i18n';

export function WorkTargetSettings() {
  const t = useT();
  const show = useSettings((s) => s.showDemoInPicker);
  const setShow = useSettings((s) => s.setShowDemoInPicker);
  return (
    <div role="group" aria-labelledby="work-target-settings-title">
      <Text id="work-target-settings-title" as="p" weight="semibold">{t('作業先（FR-144）')}</Text>
      <Switch label={t('選択画面にデモを表示')} checked={show} onChange={(_, d) => setShow(d.checked)} />
      <Button size="small" onClick={switchToDemo}>{t('デモへ切り替える')}</Button>
    </div>
  );
}
