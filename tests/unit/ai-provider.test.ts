// FR-275 AC-705/706/707/769/770, FR-011 AC-771/772, FR-285 AC-737/738/739, FR-289 AC-757/758/759.
// All SDK, fetch and CLI dependencies are stubs; no external service or actual login is invoked.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRelay, type Relay, type CopilotSdk } from '../../scripts/relay/relay';
import { openAiProvider, type CopilotConfig } from '../../scripts/relay/ai-provider';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { CopilotError } from '../../scripts/relay/copilot-adapter';
const dirs: string[] = []; const relays: Relay[] = [];
const opts = { protector: fileProtector, restrict: () => {}, warn: () => {} };
const TOKEN = ['dummy', 'copilot', 'secret', '772'].join('-');
const payload = { packId: 'P', consent: true, prompt: '質問', solution: '解決策', components: [{ id: 'x', data: '表示中の内容' }] };
const review = { reviews: [{ id: 'x', proposal: '案' }] };
const result = { conclusion: 'conditional', criteria: [], reason: '根拠', alternatives: [] };
afterEach(async () => { await Promise.all(relays.splice(0).map(r => r.close())); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
async function setup(signedIn = true, suppliedSdk?: CopilotSdk | null, foundryToken?: () => Promise<string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-unit-')); dirs.push(dir);
  const store = openAiProvider(dir, opts);
  const sdk = suppliedSdk === undefined ? { status: vi.fn(async (_c?: CopilotConfig) => ({ signedIn })), complete: vi.fn(async (_k: string, prompt: string, _c?: CopilotConfig) => prompt.includes('コンポーネント') ? JSON.stringify(review) : prompt.includes('判断基準') ? JSON.stringify(result) : '回答') } : suppliedSdk;
  const foundryFetch = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(review) })));
  const analyze = vi.fn(async () => result);
  const foundryVault = openFoundryVault(path.join(dir, 'foundry'), opts);
  const r = await startRelay({ sdk, aiProvider: store, foundryVault, foundryFetch: foundryFetch as typeof fetch, foundryToken, foundry: { analyze } }); relays.push(r);
  const request = async (url: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => { const response = await fetch(r.url + url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) }); return { status: response.status, body: await response.json() }; };
  const select = (provider: string) => request('/ai/provider', {provider}, 'PUT');
  const enable = (over = {}) => request('/foundry/connection', { packId: 'P', enable: true, consent: true, confirmed: true, ...over });
  const saveFoundry = (over = {}) => request('/foundry/config', { endpoint: 'https://x.openai.azure.com/openai/v1', deployment: 'd', key: 'dummy-key', ...over }, 'PUT');
  return { dir, store, sdk, r, request, select, enable, saveFoundry, foundryFetch, analyze };
}
describe('FR-275 common provider integration', () => {
  it('FR-275 AC-769 persists only the whitelisted provider and retains it after relay restart', async () => {
    const s = await setup(); expect((await s.request('/ai/provider')).body).toEqual({ provider: 'foundry' });
    expect((await s.select('bad')).status).toBe(400);
    expect((await s.request('/ai/provider', { provider: 'copilot', token: TOKEN, key: TOKEN }, 'PUT')).body).toEqual({provider:'copilot'});
    expect(fs.readFileSync(path.join(s.dir,'ai-provider.json'),'utf8')).not.toContain(TOKEN);
    await s.r.close(); relays.splice(relays.indexOf(s.r),1);
    const restarted = await startRelay({sdk:s.sdk, aiProvider:openAiProvider(s.dir,opts)}); relays.push(restarted);
    expect(await (await fetch(restarted.url + '/ai/provider')).json()).toEqual({provider:'copilot'});
  });
  it('FR-275 AC-770 routes all three operations exclusively, keeps /ask fixed, and rejects import with zero calls (FR-289 AC-757)', async () => {
    const s = await setup(); await s.select('copilot'); expect((await s.enable()).status).toBe(200);
    expect((await s.request('/foundry/ask',payload)).body).toMatchObject({mode:'connected',answer:'回答'});
    expect((await s.request('/foundry/review',payload)).body).toMatchObject({mode:'connected',...review});
    expect((await s.request('/foundry/analyze',payload)).body).toEqual(result);
    expect(s.sdk!.complete).toHaveBeenCalledTimes(3); expect(s.foundryFetch).not.toHaveBeenCalled(); expect(s.analyze).not.toHaveBeenCalled();
    const unsupported = await s.request('/foundry/import',{...payload,fileName:'a.txt',dataBase64:'YQ=='});
    expect(unsupported.status).toBe(409); expect(JSON.stringify(unsupported.body)).toContain('Copilot SDK では未対応'); expect(s.sdk!.complete).toHaveBeenCalledTimes(3);
    await s.select('foundry'); await s.saveFoundry(); await s.enable();
    await s.request('/foundry/ask',payload); await s.request('/foundry/review',payload); await s.request('/foundry/analyze',payload);
    expect(s.foundryFetch).toHaveBeenCalledTimes(2); expect(s.analyze).toHaveBeenCalledTimes(1); expect(s.sdk!.complete).toHaveBeenCalledTimes(3);
    await s.request('/connection',{packId:'P',enable:true,consent:true,confirmed:true});
    for (const kind of ['structure','summary','recommend','chat','exec-summary']) await s.request('/ask',{packId:'P',kind,prompt:'従来'});
    expect(s.sdk!.complete).toHaveBeenCalledTimes(8);
  });
  it('FR-275 AC-705/770 revokes on each provider/auth/model/token change or deletion until explicit reconfirmation', async () => {
    const s = await setup(); await s.saveFoundry(); await s.enable(); await s.select('copilot');
    const assertDisabled = async () => { const n = vi.mocked(s.sdk!.complete).mock.calls.length; await s.request('/foundry/ask',payload); await s.request('/foundry/review',payload); await s.request('/foundry/analyze',payload); await s.request('/foundry/import',payload); expect(s.sdk!.complete).toHaveBeenCalledTimes(n); expect(s.foundryFetch).not.toHaveBeenCalled(); expect(s.analyze).not.toHaveBeenCalled(); };
    await assertDisabled();
    for (const cfg of [{authMethod:'token',model:'',token:TOKEN},{authMethod:'token',model:'model-x'},{authMethod:'token',model:'model-x',token:TOKEN+'-new'},{authMethod:'signin',model:''}]) {
      await s.enable(); await s.request('/copilot/config',cfg,'PUT'); await assertDisabled();
      expect((await s.enable({confirmed:false})).status).toBe(400);
    }
    await s.enable(); await s.request('/copilot/config',undefined,'DELETE'); await assertDisabled();
    await s.enable(); expect((await s.request('/foundry/ask',payload)).body.mode).toBe('connected');
    expect(s.sdk!.complete).toHaveBeenCalledTimes(1);
  });
  it('FR-275 AC-706/770 refuses unauthorized SDK, missing tokens or SDK and enforces every generation guard', async () => {
    for (const sdk of [undefined,null]) { const s=await setup(false,sdk); await s.select('copilot'); expect((await s.enable()).status).toBe(409); expect((await s.request('/foundry/ask',payload)).body.mode).toBe('unavailable'); }
    const s=await setup(); await s.select('copilot'); await s.request('/copilot/config',{authMethod:'token',model:''},'PUT'); expect((await s.enable()).status).toBe(409);
    await s.request('/copilot/config',{authMethod:'signin',model:''},'PUT'); expect((await s.enable({consent:false})).status).toBe(403); await s.enable();
    for (const guard of [{consent:false},{includesPerson:true,personConfirmed:false}]) for (const route of ['ask','review','analyze']) await s.request('/foundry/'+route,{...payload,...guard});
    expect(s.sdk!.complete).not.toHaveBeenCalled();
    await s.request('/foundry/ask',payload); expect(s.sdk!.complete).toHaveBeenCalledTimes(1);
    await s.request('/foundry/ask',{...payload,consent:false}); expect(s.sdk!.complete).toHaveBeenCalledTimes(1);
  });
  it('FR-011 AC-772 encrypts tokens, returns fixed masks, passes tokens only to SDK and never falls back after deletion', async () => {
    const s=await setup(); await s.select('copilot');
    const saved=await s.request('/copilot/config',{authMethod:'token',model:'model-x',token:TOKEN},'PUT');
    expect(saved.body).toMatchObject({tokenConfigured:true,tokenMask:'••••••••'}); expect(JSON.stringify(saved.body)).not.toContain(TOKEN);
    expect(fs.readFileSync(path.join(s.dir,'copilot','foundry.enc'),'utf8')).not.toContain(TOKEN);
    expect(JSON.stringify((await s.request('/copilot/config')).body)).not.toContain(TOKEN);
    await s.enable(); await s.request('/foundry/ask',payload); expect(s.sdk!.complete).toHaveBeenLastCalledWith('chat','質問',{authMethod:'token',model:'model-x',token:TOKEN});
    await s.request('/copilot/config',undefined,'DELETE'); expect(s.store.config().token).toBeUndefined(); expect(s.store.config().authMethod).toBe('token');
    expect((await s.enable()).status).toBe(409); expect((await s.request('/foundry/ask',payload)).body.mode).toBe('unavailable'); expect(s.sdk!.complete).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(s.dir,'copilot','foundry.enc'))).toBe(false);
  });
  it('FR-275 AC-707 / FR-285 AC-739 sanitizes SDK errors/timeouts and never silently uses Foundry', async () => {
    for (const failure of [new Error(TOKEN),new CopilotError('timeout')]) {
      const sdk={status:async()=>({signedIn:true}),complete:vi.fn(async()=>{throw failure;})}; const s=await setup(true,sdk); await s.select('copilot'); await s.enable();
      for (const route of ['ask','review','analyze']) { const r=await s.request('/foundry/'+route,payload); expect(JSON.stringify(r.body)).not.toContain(TOKEN); expect(route==='analyze' ? r.body.error.cause : r.body.reason).toBe(failure instanceof CopilotError ? 'timeout' : route==='analyze' ? 'unreachable' : 'error'); }
      expect(s.foundryFetch).not.toHaveBeenCalled(); expect(s.analyze).not.toHaveBeenCalled();
    }
  });
  it('FR-275 AC-707 settings storage failures never expose raw error diagnostics or credentials', async () => {
    const s=await setup();vi.spyOn(s.store,'setProvider').mockImplementation(()=>{throw new Error(TOKEN);});
    const r=await s.select('copilot');expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain(TOKEN);
  });
  it('FR-275 AC-706 Foundry Entra forwards bearer only to Foundry and supports all three generation paths without a key', async () => {
    const getToken=vi.fn(async()=> 'dummy-entra-bearer'); const s=await setup(true,undefined,getToken);
    await s.saveFoundry({authMethod:'entra',key:undefined}); expect((await s.enable()).status).toBe(200);
    for(const route of ['ask','review','analyze']) { const r=await s.request('/foundry/'+route,payload); expect(r.status).toBe(200);expect(JSON.stringify(r.body)).not.toContain('dummy-entra-bearer'); }
    expect(getToken).toHaveBeenCalledTimes(3);expect(s.sdk!.complete).not.toHaveBeenCalled();expect(s.foundryFetch).toHaveBeenCalledTimes(3);
    for(const call of s.foundryFetch.mock.calls as unknown as Array<[string,RequestInit]>) {expect(call[0]).toContain('x.openai.azure.com');expect(call[1].headers).toMatchObject({authorization:'Bearer dummy-entra-bearer'});expect(call[1].headers).not.toHaveProperty('api-key');}
  });
  it('FR-275 AC-706 preserves Foundry Entra without an API key for ask, review and analysis', async () => {
    const s=await setup(); await s.saveFoundry({authMethod:'entra',key:undefined});
    expect((await s.enable()).status).toBe(200);
    // No token provider was installed: safe failure, and no Copilot fallback.
    for (const route of ['ask','review','analyze']) expect(JSON.stringify((await s.request('/foundry/'+route,payload)).body)).not.toContain(TOKEN);
    expect(s.sdk!.complete).not.toHaveBeenCalled();
  });
});
