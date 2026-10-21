// 分析画面のツールバーの「使い方」ボタン（FR-272。入口は 1 つ）。ウェルカムと同じカードを再表示する。分析中の状態は触らない。
import { Button } from '@fluentui/react-components';
import { useGuide } from './guideStore';

export function GuideButton() {
  const openGuide = useGuide((g) => g.openGuide);
  return <Button size="small" data-testid="guide-button" onClick={() => openGuide('workspace')}>使い方</Button>;
}