// ミュートボタンと音量スライダー（FR-074）。ショーコントロールバー（src/show/ShowControlBar.tsx）に置く。
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { Speaker220Regular, SpeakerMute20Regular } from '@fluentui/react-icons';
import { useSettings } from '../store/settings';

const useStyles = makeStyles({
  slider: {
    width: '110px',
    // 当たり判定は 24px 以上（NFR-A11Y-009 AC-485・PARAM-040）
    height: '24px',
    accentColor: tokens.colorBrandForeground1,
    cursor: 'pointer',
    // Windows のハイコントラストでも、OS の色で描く
    forcedColorAdjust: 'auto',
  },
  group: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
});

/** ミュートの切替（M キーと同じ）。表示と名前が、ミュート中／ミュート解除中で変わる */
export function MuteButton() {
  const muted = useSettings((s) => s.muted);
  const setMuted = useSettings((s) => s.setMuted);
  return (
    <Button
      size="small"
      appearance="subtle"
      aria-pressed={muted}
      aria-label={muted ? 'ミュートを解除する（現在: ミュート中）' : 'ミュートにする（現在: ミュート解除中）'}
      title="ミュートの切替（M キー）"
      icon={muted ? <SpeakerMute20Regular aria-hidden /> : <Speaker220Regular aria-hidden />}
      onClick={() => setMuted(!muted)}
    >
      {muted ? 'ミュート中' : 'ミュート解除中'}
    </Button>
  );
}

/** 音量のスライダー（0〜100）。キーボードは矢印・Home・End */
export function VolumeSlider() {
  const s = useStyles();
  const volume = useSettings((st) => st.volume);
  const setVolume = useSettings((st) => st.setVolume);
  const percent = Math.round(volume * 100);
  return (
    <input
      className={s.slider}
      type="range"
      min={0}
      max={100}
      step={5}
      value={percent}
      aria-label="音量"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      onChange={(e) => setVolume(Number(e.currentTarget.value) / 100)}
    />
  );
}

export function AudioControls() {
  const s = useStyles();
  return (
    <span className={s.group} role="group" aria-label="音声">
      <MuteButton />
      <VolumeSlider />
    </span>
  );
}
