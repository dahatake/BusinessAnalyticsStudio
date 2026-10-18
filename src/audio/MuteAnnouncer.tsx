// ミュートの切替をスクリーンリーダーに知らせる aria-live の領域（FR-074・NFR-A11Y-002）。SelectionAnnouncer と同じ方式。
// M キー・コマンド・ボタンのどれで切り替えても「ミュートにしました／ミュートを解除しました」と通知する。画面には出さない（視覚的に隠す）。
import { useEffect, useRef, useState } from 'react';
import { makeStyles } from '@fluentui/react-components';
import { useSettings } from '../store/settings';
import { muteAnnouncement } from './model';

const useStyles = makeStyles({
  hidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

/** 通知の文言（純粋） */
export { muteAnnouncement };

export function MuteAnnouncer() {
  const s = useStyles();
  const muted = useSettings((st) => st.muted);
  const prev = useRef(muted);
  const [text, setText] = useState('');
  useEffect(() => {
    // 起動時の状態は通知しない。切り替わったときだけ通知する
    if (prev.current !== muted) setText(muteAnnouncement(muted));
    prev.current = muted;
  }, [muted]);
  return <div className={s.hidden} data-testid="mute-announcer" aria-live="polite" aria-atomic="true">{text}</div>;
}
