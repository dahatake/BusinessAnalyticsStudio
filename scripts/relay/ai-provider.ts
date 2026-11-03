// FR-275 AC-769 / FR-011 AC-772: only public configuration is stored as JSON.
import fs from 'node:fs';
import path from 'node:path';
import { openFoundryVault } from './foundry-vault';
import { defaultDataDir, type VaultOptions } from './speech-vault';
export type Provider = 'foundry' | 'copilot';
export interface CopilotConfig { authMethod: 'signin' | 'token'; model: string; token?: string }
export function openAiProvider(dataDir = defaultDataDir(), options: VaultOptions = {}) {
  const file = path.join(dataDir, 'ai-provider.json');
  // Reuse the existing AES-GCM vault, key protection and ACL implementation, isolated from Foundry.
  const vault = openFoundryVault(path.join(dataDir, 'copilot'), options);
  const read = (): { provider: Provider; authMethod: 'signin' | 'token'; model: string } => {
    try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return { provider: v.provider === 'copilot' ? 'copilot' : 'foundry', authMethod: v.authMethod === 'token' ? 'token' : 'signin', model: typeof v.model === 'string' ? v.model : '' }; }
    catch { return { provider: 'foundry', authMethod: 'signin', model: '' }; }
  };
  // FR-011 AC-817/818: true only when the user explicitly saved a provider (ai-provider.json has "provider").
  const explicit = (): boolean => { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v.provider === 'copilot' || v.provider === 'foundry'; } catch { return false; } };
  let auto: Provider | null = null; // in-memory default only; never persisted
  const write = (v: ReturnType<typeof read>, withProvider = true) => {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const { provider, ...rest } = v;
    fs.writeFileSync(file, JSON.stringify(withProvider ? v : rest), { mode: 0o600 });
  };
  return {
    provider: (): Provider => (explicit() ? read().provider : auto ?? read().provider),
    isExplicit: explicit,
    /** Auto-select a provider in memory only when none was explicitly saved. Returns whether it was applied. */
    autoSelect(provider: Provider): boolean { if (explicit()) return false; auto = provider; return true; },
    setProvider(provider: Provider) { auto = null; write({ ...read(), provider }); },
    view() { const v = read(); const tokenConfigured = !!vault.secret(); return { authMethod: v.authMethod, model: v.model, tokenConfigured, tokenMask: tokenConfigured ? '••••••••' : '' }; },
    config(): CopilotConfig { const v = read(); return { authMethod: v.authMethod, model: v.model, ...(v.authMethod === 'token' ? { token: vault.secret()?.key } : {}) }; },
    save(input: { authMethod: 'signin' | 'token'; model: string; token?: string }) {
      if (input.model.length > 200 || /[\r\n\x00]/.test(input.model)) throw new Error('モデル名を確認してください');
      if (input.authMethod === 'token' && input.token !== undefined && input.token.trim()) vault.save({ endpoint: 'https://github.com', deployment: 'copilot', key: input.token });
      write({ ...read(), authMethod: input.authMethod, model: input.model.trim() }, explicit());
    },
    removeToken() { vault.remove(); },
  };
}
export type AiProviderStore = ReturnType<typeof openAiProvider>;
