// チャットの Foundry 送信の 1 回分の流れ（FR-286）。判定の順: 回数・予算の上限（FR-276）→ 種別「人」の確認（FR-219）→ /foundry/ask。
// どの失敗でも別の送信先（Copilot・モック）へは切り替えない。呼んだ分（失敗も）は利用量に数える。送る内容は呼び出し側が組み立てる（foundryChat.ts）。
import { askFoundry, type FoundryUnavailableReason } from './foundryClient';
import { foundryReasonText, type FoundryPrompt } from './foundryChat';
import type { UsageGate } from './foundryUsage';
import { tr } from '../i18n';

export interface FoundryChatDeps {
  relayUrl: string | undefined;
  packId: string;
  /** 起動中の案件に了承の記録（FR-181）がある */
  consent: boolean;
  /** 顧客パックが種別「人」を含む */
  includesPerson: boolean;
  /** 種別「人」の確認（FR-219）。含まないときは呼ばれない */
  confirmPerson: () => Promise<{ allowed: boolean; reason?: string }>;
  usage: { check: () => UsageGate; count: (tokensIn: number) => void };
  ask?: typeof askFoundry;
}

export type FoundryChatOutcome =
  | { kind: 'answer'; answer: string; warning?: string }
  | { kind: 'blocked'; text: string }
  | { kind: 'failed'; reason: FoundryUnavailableReason; text: string };

export async function sendFoundryChat(deps: FoundryChatDeps, built: FoundryPrompt): Promise<FoundryChatOutcome> {
  const gate = deps.usage.check();
  if (!gate.allowed) return { kind: 'blocked', text: gate.reason };
  if (deps.includesPerson) {
    const g = await deps.confirmPerson();
    if (!g.allowed) return { kind: 'blocked', text: g.reason ?? tr('種別「人」の確認が済んでいないため、送信しませんでした。') };
  }
  const r = await (deps.ask ?? askFoundry)(deps.relayUrl, {
    packId: deps.packId, prompt: built.prompt, consent: deps.consent,
    ...(deps.includesPerson ? { includesPerson: true, personConfirmed: true } : {}),
  });
  deps.usage.count(built.tokens);
  if (r.mode === 'unavailable') return { kind: 'failed', reason: r.reason, text: foundryReasonText(r.reason) };
  return { kind: 'answer', answer: r.answer, ...(gate.warning ? { warning: gate.warning } : {}) };
}
