// 演出強度の切替と表示（FR-083）。`E` キー、または表示のボタンで、Executive → Showcase → Entertainment → Executive の順に変わる。
// 現在の強度は文字で表示する（色だけに頼らない）。選んだ値は store/settings.ts に保存する（FR-057）。
import { useEffect } from 'react';
import { Button } from '@fluentui/react-components';
import { Sparkle24Regular } from '@fluentui/react-icons';
import { isShortcutTarget } from '../motion/control';
import { useIntensity } from '../motion/useMotion';
import { useSettings } from '../store/settings';
import { nextIntensity } from './model';
import { useT } from '../i18n';

/** 演出強度を 1 つ進める（ボタン・`E` キー・コマンドから使う） */
export function cycleIntensity(current: ReturnType<typeof useIntensity>): void {
  useSettings.getState().setIntensity(nextIntensity(current));
}

/** `E`（修飾キーなし）で演出強度を切り替える。アプリで 1 回だけ使う */
function useIntensityKey(): void {
  const current = useIntensity();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.shiftKey || e.key.toLowerCase() !== 'e' || !isShortcutTarget(e)) return;
      cycleIntensity(current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current]);
}

/** 「演出強度: Executive」の表示と切替ボタン（E キーと同じ）。常に見える場所（ヘッダー）に置く */
export function IntensityIndicator() {
  const current = useIntensity();
  const t = useT();
  useIntensityKey();
  return (
    <Button
      appearance="subtle"
      size="small"
      data-testid="intensity"
      icon={<Sparkle24Regular aria-hidden />}
      title={t('演出強度の切替（E キー）: Executive → Showcase → Entertainment')}
      onClick={() => cycleIntensity(current)}
    >
      {t('演出強度: {value}', { value: current })}
    </Button>
  );
}
