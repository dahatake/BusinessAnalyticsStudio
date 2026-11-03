// メイン画面の右上の、ウィザードの起動アイコン（FR-267）。ツールチップと表示ラベル「使い方を見る」を持ち、キーボードでも操作できる。
// 開いたダイアログを閉じると、焦点はこのボタンへ戻る（components/Dialog が開く前の操作位置へ戻す）。
import { Button, Tooltip } from '@fluentui/react-components';
import { QuestionCircle20Regular } from '@fluentui/react-icons';
import { useGuide } from './guideStore';
import { useT } from '../i18n';

export function WelcomeIconButton() {
  const t = useT();
  const openGuide = useGuide((g) => g.openGuide);
  return (
    <Tooltip content={t('はじめての方向けの使い方（ウェルカム）を見る')} relationship="description" withArrow>
      <Button icon={<QuestionCircle20Regular />} data-testid="welcome-icon" onClick={() => openGuide('main')}>{t('使い方を見る')}</Button>
    </Tooltip>
  );
}
