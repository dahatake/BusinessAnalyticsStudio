// アニメーション停止の部品（FR-071）。コントローラーは、アプリに 1 つだけ置く。表示は、いつでも見える場所（ヘッダー）に置く。
import { useEffect } from 'react';
import { Button } from '@fluentui/react-components';
import { Play24Regular, Pause24Regular } from '@fluentui/react-icons';
import { useAnimation } from '../store/animation';
import { installAnimationControl } from './control';
import { useMotionProfile } from './useMotion';

/** P キー・CSS の停止・動画の停止を有効にし、モーションのテンポを CSS の変数にも渡す */
export function AnimationController() {
  const profile = useMotionProfile();
  useEffect(() => installAnimationControl(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--edb-tempo', String(profile.tempo));
  }, [profile.tempo]);
  return null;
}

/** 「アニメーション: 再生中／停止中」の表示と切替ボタン（P キーと同じ） */
export function AnimationStatus() {
  const playing = useAnimation((s) => s.playing);
  const toggle = useAnimation((s) => s.toggle);
  return (
    <Button
      appearance="subtle"
      size="small"
      data-testid="animation-state"
      icon={playing ? <Pause24Regular aria-hidden /> : <Play24Regular aria-hidden />}
      title="アニメーションの再生／停止（P キー）"
      onClick={toggle}
    >
      アニメーション: {playing ? '再生中' : '停止中'}
    </Button>
  );
}
