// 起動時の自動表示（FR-267）。オープニングが終わり、メイン画面が出ているときに 1 回だけ、確認済みでなければ開く。
import { useEffect } from 'react';
import { useGuide } from './guideStore';

export function WelcomeAuto({ ready }: { ready: boolean }) {
  const autoOpen = useGuide((g) => g.autoOpen);
  useEffect(() => { if (ready) autoOpen(); }, [ready, autoOpen]);
  return null;
}