// 画面上部の AI の状態表示に出す、生成AIの共通接続（POST /foundry/*）の接続先と有効／モック（FR-275 AC-773）。
// POST /ask（FR-132）の接続状態は含めない（監査 C-01）。キー・トークンの値は扱わない（中継の GET /ai/provider?packId= の provider・enabled だけを使う）。
// 読むだけで、/foundry/* には要求を送らない（実接続の既定のままでは /foundry/* への要求 0 回。FR-285 AC-739）。
import { useEffect, useState } from 'react';
import { usePackStore } from '../store/pack';
import { useSettingsModal } from '../store/settingsModal';
import { isLoopbackUrl } from './client';
import { FOUNDRY_CHANGED_EVENT } from './foundryClient';

export type GenAiProvider = 'foundry' | 'copilot';

export interface GenAiProviderState {
  provider: GenAiProvider;
  /** 共通接続の実接続が有効か（この案件で有効化済み） */
  enabled: boolean;
}

/** 接続先の表示名（FR-275: 「Microsoft Foundry」または「GitHub Copilot」） */
export function providerDisplayName(p: GenAiProvider): string {
  return p === 'copilot' ? 'GitHub Copilot' : 'Microsoft Foundry';
}

/** 上部の状態表示の文言。実接続が無効なら「モック」、有効なら「有効」（「接続済み」は POST /ask の表示と区別するため使わない） */
export function genAiStatusLabel(s: GenAiProviderState): string {
  return `生成AI: ${providerDisplayName(s.provider)}（${s.enabled ? '有効' : 'モック'}）`;
}

/** 中継の応答を状態に直す。中継に届かない・旧中継は Microsoft Foundry・モックとして扱う */
export function toGenAiState(v: { provider?: unknown; enabled?: unknown } | null): GenAiProviderState {
  return { provider: v?.provider === 'copilot' ? 'copilot' : 'foundry', enabled: v?.enabled === true };
}

/** 中継の GET /ai/provider?packId= から状態を読む。中継がない・localhost でない・失敗は Microsoft Foundry・モック */
export async function fetchGenAiState(relayUrl: string | undefined, packId: string, f: typeof fetch = (u, i) => fetch(u, i)): Promise<GenAiProviderState> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return toGenAiState(null);
  try {
    const r = await f(`${relayUrl}/ai/provider?packId=${encodeURIComponent(packId)}`);
    if (!r.ok) return toGenAiState(null);
    return toGenAiState((await r.json()) as { provider?: unknown; enabled?: unknown });
  } catch {
    return toGenAiState(null);
  }
}

/** 共通接続の状態を中継から読み、設定の変更（FOUNDRY_CHANGED_EVENT）・設定を閉じたとき・案件の切替で読み直す */
export function useGenAiProviderStatus(): GenAiProviderState {
  const relay = usePackStore((s) => s.runtime.relayUrl);
  const pack = usePackStore((s) => s.state);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const settingsOpen = useSettingsModal((s) => s.open);
  const [state, setState] = useState<GenAiProviderState>({ provider: 'foundry', enabled: false });
  useEffect(() => {
    let alive = true;
    let seq = 0;
    const load = (): void => {
      const my = ++seq;
      void fetchGenAiState(relay, packId).then((v) => { if (alive && my === seq) setState(v); });
    };
    load();
    window.addEventListener(FOUNDRY_CHANGED_EVENT, load);
    return () => { alive = false; window.removeEventListener(FOUNDRY_CHANGED_EVENT, load); };
  }, [relay, packId, settingsOpen]);
  return state;
}
