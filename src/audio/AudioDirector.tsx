// 音声を、設定・シーン・操作・ブランドのトーンにつなぐ部品（FR-073・FR-074）。アプリに 1 つだけ置く。表示はしない。
import { useEffect } from 'react';
import { registerCommands } from '../commands/registry';
import { useMotionProfile } from '../motion/useMotion';
import { usePresentationStore } from '../store/presentation';
import { useSelectionStore } from '../store/selection';
import { useSettings } from '../store/settings';
import { registerTestHook } from '../testing/hook';
import { audio } from './engine';
import { isMuteKey } from './keys';
import { MuteAnnouncer } from './MuteAnnouncer';

/** 設定の変更を、音声制御に渡す */
function pushSettings(): void {
  const s = useSettings.getState();
  audio.setSettings({ muted: s.muted, volume: s.volume, bgmEnabled: s.bgmEnabled, seEnabled: s.seEnabled });
}

export function toggleMute(): void {
  const s = useSettings.getState();
  s.setMuted(!s.muted);
}

/**
 * @param scene 今のシーン（オープニング・通常・プレゼンテーションの章など）。変わるとクロスフェードする
 */
export function AudioDirector({ scene }: { scene: string }) {
  const profile = useMotionProfile();

  // 自動再生ポリシー: 利用者の最初の操作で音声を有効にする。ミュートの状態は変えない
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    const on = () => {
      audio.activate();
      for (const e of events) document.removeEventListener(e, on, true);
    };
    for (const e of events) document.addEventListener(e, on, true);
    return () => { for (const e of events) document.removeEventListener(e, on, true); };
  }, []);

  // 設定（ミュート・音量・BGM と効果音の ON/OFF）の反映。ミュートを解除した瞬間に、確認の効果音を鳴らす
  useEffect(() => {
    pushSettings();
    return useSettings.subscribe((s, prev) => {
      pushSettings();
      if (prev.muted && !s.muted) audio.playSe('unmute');
    });
  }, []);

  useEffect(() => { audio.setStyle(profile.bgmMood, profile.tempo); }, [profile.bgmMood, profile.tempo]);
  useEffect(() => { audio.setScene(scene); }, [scene]);

  // M キーでミュートを切り替える（入力欄の中では受けない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLInputElement | null;
      const hit = isMuteKey({
        key: e.key, repeat: e.repeat, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        target: t ? { tagName: t.tagName, type: t.type, isContentEditable: t.isContentEditable } : null,
      });
      if (hit) toggleMute();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => registerCommands(() => [{
    id: 'audio.toggle-mute',
    label: 'ミュートを切り替える',
    keywords: ['音', 'ミュート', '消音', 'mute', 'sound'],
    shortcut: 'M',
    run: toggleMute,
  }]), []);

  // 効果音: プレゼンテーションの議題の移動、項目の選択
  useEffect(() => usePresentationStore.subscribe((s, prev) => {
    if (s.active !== prev.active || (s.active && s.index !== prev.index)) audio.playSe('transition');
  }), []);
  useEffect(() => useSelectionStore.subscribe((s, prev) => {
    if (s.selectedIds !== prev.selectedIds && s.selectedIds.length > 0) audio.playSe('select');
  }), []);

  useEffect(() => registerTestHook('audio', {
    /** 音が出ている状態か（ミュート・操作の前・BGM OFF・音量 0 では false） */
    isAudible: () => audio.isAudible(),
    snapshot: () => audio.snapshot(),
  }), []);

  return <MuteAnnouncer />;
}
