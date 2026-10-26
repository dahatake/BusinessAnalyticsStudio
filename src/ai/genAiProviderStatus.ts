// 画面上部の AI の状態表示に出す、生成AIの共通接続（POST /foundry/*）の接続先と有効／モック（FR-275 AC-773）。
// POST /ask（FR-132）の接続状態は含めない（監査 C-01）。キー・トークンの値は扱わない（中継の GET /ai/provider?packId= の provider・enabled だけを使う）。
// 読むだけで、/foundry/* には要求を送らない（実接続の既定のままでは /foundry/* への要求 0 回。FR-285 AC-739）。
import { useEffect, useRef, useState } from 'react';
import { usePackStore } from '../store/pack';
import { useSettingsModal } from '../store/settingsModal';
import { isLoopbackUrl } from './client';
import { FOUNDRY_CHANGED_EVENT } from './foundryClient';
import { confirmedSendKinds } from './sendKinds';

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

/**
 * 起動時・案件の切替で中継に状態を問い合わせてよいか（NFR-SEC-004 AC-218）。
 * この端末で共通接続を確認して有効化した記録（sendKinds）がある案件だけ問い合わせる。
 * 記録がない既定の状態では中継への要求 0 回で、ローカルの既定（Microsoft Foundry・モック）を表示する
 */
export function mayQueryProviderOnLoad(packId: string): boolean {
  return !!packId && confirmedSendKinds(packId).length > 0;
}

/**
 * 共通接続の状態を中継から読む（FR-275 AC-773）。起動時・案件の切替では有効化の記録があるときだけ読み（AC-218）、
 * 利用者が設定を操作したとき（FOUNDRY_CHANGED_EVENT・設定を閉じたとき）に読み直す
 */
export function useGenAiProviderStatus(): GenAiProviderState {
  const relay = usePackStore((s) => s.runtime.relayUrl);
  const pack = usePackStore((s) => s.state);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const settingsOpen = useSettingsModal((s) => s.open);
  const [state, setState] = useState<GenAiProviderState>({ provider: 'foundry', enabled: false });
  const seq = useRef(0);
  const prevOpen = useRef(settingsOpen);
  const load = useRef<() => void>(() => {});
  load.current = (): void => {
    const my = ++seq.current;
    void fetchGenAiState(relay, packId).then((v) => { if (my === seq.current) setState(v); });
  };
  // 起動時・案件の切替: 有効化の記録がなければ問い合わせずに既定を表示する
  useEffect(() => {
    seq.current++;
    if (mayQueryProviderOnLoad(packId)) load.current();
    else setState(toGenAiState(null));
  }, [relay, packId]);
  // 設定の変更（接続先の選択・有効化・解除）で読み直す
  useEffect(() => {
    const on = (): void => load.current();
    window.addEventListener(FOUNDRY_CHANGED_EVENT, on);
    return () => { seq.current++; window.removeEventListener(FOUNDRY_CHANGED_EVENT, on); };
  }, []);
  // 設定を閉じたときに読み直す（開いている間に選んだ接続先を反映する）
  useEffect(() => {
    if (prevOpen.current && !settingsOpen) load.current();
    prevOpen.current = settingsOpen;
  }, [settingsOpen]);
  return state;
}
