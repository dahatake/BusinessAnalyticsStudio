// 再生中の字幕を読み上げる（FR-167）。有効かつミュート解除のときだけ接続先へ送る。失敗しても例外にせず、字幕だけで続ける。
import { useEffect, useRef, useState } from 'react';
import { usePackStore } from '../store/pack';
import { useSettings } from '../store/settings';
import { useSpeechRelay, requestSpeechViaRelay } from './relayKey';
import { explainFailure, isSpeechConfigured, requestSpeech, speechHost, type SpeechConfig } from './speech';

export interface CaptionSpeech {
  /** 字幕を接続先へ送って読み上げる状態か（送信を画面に明示するため） */
  sending: boolean;
  /** 送信先のホスト名 */
  host: string;
  /** 失敗の原因と直し方。なければ null */
  error: string | null;
}

function playBlob(audio: Blob, volume: number): void {
  try {
    if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(audio);
    const el = new Audio(url);
    el.volume = Math.min(1, Math.max(0, volume));
    el.addEventListener('ended', () => URL.revokeObjectURL(url));
    void el.play().catch(() => URL.revokeObjectURL(url));
  } catch {
    // 鳴らせなくても、字幕で続ける
  }
}

export function useCaptionSpeech(caption: string, cfgOverride?: SpeechConfig): CaptionSpeech {
  const runtimeSpeech = usePackStore((s) => s.runtime.speech);
  const cfg = cfgOverride ?? runtimeSpeech;
  const enabled = useSettings((s) => s.speechEnabled);
  const muted = useSettings((s) => s.muted);
  const volume = useSettings((s) => s.volume);
  const active = enabled && !muted;
  const relayUrl = usePackStore((s) => s.runtime.relayUrl);
  const relayView = useSpeechRelay((s) => s.view);
  const refreshRelay = useSpeechRelay((s) => s.refresh);
  useEffect(() => { void refreshRelay(relayUrl); }, [relayUrl, refreshRelay]);
  const viaRelay = !!relayUrl && !!relayView?.configured;
  const configured = viaRelay || isSpeechConfigured(cfg);
  const [error, setError] = useState<string | null>(null);
  const failed = useRef(false);

  // 設定が変わったら、失敗の記録を戻す
  useEffect(() => {
    failed.current = false;
    setError(null);
  }, [active, configured, viaRelay]);

  useEffect(() => {
    if (!active) return undefined;
    if (!configured) { setError(explainFailure('unconfigured')); return undefined; }
    if (failed.current) return undefined;
    const ctl = new AbortController();
    const req = viaRelay ? requestSpeechViaRelay(relayUrl as string, caption, { signal: ctl.signal }) : requestSpeech(cfg, caption, { signal: ctl.signal });
    void req.then((r) => {
      if (ctl.signal.aborted) return;
      if (r.ok) playBlob(r.audio, volume);
      else { failed.current = true; setError(r.message); }
    });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, active, configured]);

  return { sending: active && configured && error === null, host: (viaRelay ? relayView?.host ?? '' : speechHost(cfg)), error: active ? error : null };
}
