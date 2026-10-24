// @vitest-environment jsdom
// FR-275 AC-769/770, FR-011 AC-771/772, FR-289 AC-757. Stub relay only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import { ProviderSettings } from '../../src/ai/ProviderSettings';
import { AiImport } from '../../src/ai/AiImport';
const state = { runtime:{relayUrl:'http://127.0.0.1:8787'},state:{status:'ready',pack:{data:{customer:{name:'P'},entities:[]}}} };
vi.mock('../../src/store/pack',()=>({usePackStore:(select:(s:unknown)=>unknown)=>select(state)}));
vi.mock('../../src/ai/useConsent',()=>({useConsent:()=>({granted:true})}));
vi.mock('../../src/ai/FoundrySettings',()=>({FoundrySettings:()=> <section data-testid="foundry-settings">Foundry 接続情報</section>}));
let provider='foundry';let authMethod='signin';let model='';let tokenConfigured=false;let signedIn=false;let enabled=false;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(()=>{
 vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} });
 provider='foundry';authMethod='signin';model='';tokenConfigured=false;signedIn=false;enabled=false;
 window.matchMedia=vi.fn().mockImplementation((media:string)=>({matches:false,media,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{}}));
 fetchMock=vi.fn(async(input:string,init?:RequestInit)=>{
   const b=init?.body ? JSON.parse(String(init.body)) : {};
   if(input.endsWith('/ai/provider')){if(init?.method==='PUT')provider=b.provider;return new Response(JSON.stringify({provider}));}
   if(input.endsWith('/copilot/config')){if(init?.method==='PUT'){authMethod=b.authMethod;model=b.model;if(b.token)tokenConfigured=true;}if(init?.method==='DELETE')tokenConfigured=false;return new Response(JSON.stringify({authMethod,model,tokenConfigured,tokenMask:tokenConfigured?'••••••••':'',signedIn}));}
   if(input.includes('/foundry/config'))return new Response(JSON.stringify({provider,configured:true,enabled,endpoint:'',deployment:'',host:'',keyMask:''}));
   if(input.endsWith('/foundry/connection')){enabled=!!b.enable;return new Response(JSON.stringify({mode:enabled?'connected':'mock'}));}
   if(input.endsWith('/copilot/signin'))return new Response(JSON.stringify({status:'completed',code:'ABCD-1234',url:'https://github.com/login/device',signedIn:false,message:'Copilot CLI で /login またはトークン方式を使ってください'}));
   throw new Error('unexpected request');
 });vi.stubGlobal('fetch',fetchMock);localStorage.clear();sessionStorage.clear();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const renderUi=(dark=false)=>(render(<FluentProvider theme={dark?webDarkTheme:webLightTheme}><ProviderSettings/></FluentProvider>));
describe('生成AIの共通接続設定',()=>{
 for(const dark of [false,true])it(`FR-275 AC-769 single persisted selector and provider-specific fields (${dark?'dark':'light'})`,async()=>{
  renderUi(dark);await waitFor(()=>expect(fetchMock).toHaveBeenCalled());expect(screen.getAllByRole('radiogroup',{name:'生成AIの接続先'})).toHaveLength(1);
  const group=screen.getByRole('radiogroup',{name:'生成AIの接続先'});expect(within(group).getAllByRole('radio')).toHaveLength(2);expect((screen.getByRole('radio',{name:'Microsoft Foundry'}) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('radio',{name:'GitHub Copilot SDK'}));await screen.findByTestId('copilot-settings');expect(provider).toBe('copilot');expect(screen.queryByTestId('foundry-settings')).toBeNull();
  expect(screen.getByRole('radiogroup',{name:'認証方式'})).toBeTruthy();expect((screen.getByRole('textbox',{name:'モデル名（任意）'}) as HTMLInputElement).value).toBe('');
  await screen.findByText(/未サインイン・利用不可/);expect(screen.getByText(/費用は利用者の GitHub Copilot/)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio',{name:'Microsoft Foundry'}));await screen.findByTestId('foundry-settings');expect(provider).toBe('foundry');
 });
 it('FR-011 AC-771 successful gh action shows only code/fixed URL and never claims SDK signed in',async()=>{
  provider='copilot';renderUi();await screen.findByTestId('copilot-settings');await waitFor(()=>expect((screen.getByRole('button',{name:'GitHub にサインイン'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'GitHub にサインイン'}));await screen.findByText('ワンタイムコード: ABCD-1234');expect(screen.getByRole('link',{name:'https://github.com/login/device'}).getAttribute('href')).toBe('https://github.com/login/device');expect(screen.getByTestId('copilot-signin-status').textContent).toContain('未サインイン');expect((screen.getByRole('switch',{name:'実接続を有効にする'}) as HTMLInputElement).disabled).toBe(true);
 });
 it('FR-011 AC-772 password token clears after save, fixed mask is shown and deletion leaves token mode',async()=>{
  provider='copilot';renderUi();await screen.findByTestId('copilot-settings');await waitFor(()=>expect((screen.getByRole('radio',{name:'トークン'}) as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('radio',{name:'トークン'}));const input=await screen.findByLabelText('GitHub トークン') as HTMLInputElement;expect(input.type).toBe('password');
  fireEvent.change(input,{target:{value:'dummy-ui-token'}});fireEvent.change(screen.getByRole('textbox',{name:'モデル名（任意）'}),{target:{value:'chosen-model'}});fireEvent.click(screen.getByRole('button',{name:'Copilot の接続情報を保存'}));
  await screen.findByText('トークン: 設定済み（••••••••）');expect(input.value).toBe('');expect(document.body.textContent).not.toContain('dummy-ui-token');expect(JSON.stringify(localStorage)).not.toContain('dummy-ui-token');expect(JSON.stringify(sessionStorage)).not.toContain('dummy-ui-token');expect(model).toBe('chosen-model');
  fireEvent.click(screen.getByRole('button',{name:'トークンを削除'}));await screen.findByText('トークン: 未保存');expect(authMethod).toBe('token');
 });
 it('FR-275 AC-770 re-enabling requires explicit destination, subscription cost and sent-content confirmation; model save revokes',async()=>{
  provider='copilot';signedIn=true;model='chosen-model';renderUi();await screen.findByTestId('copilot-settings');
  const toggle=screen.getByRole('switch',{name:'実接続を有効にする'}) as HTMLInputElement;
  await waitFor(()=>expect(toggle.disabled).toBe(false));fireEvent.click(toggle);
  const dialog=await screen.findByRole('dialog');expect(dialog.textContent).toContain('GitHub Copilot SDK');expect(dialog.textContent).toContain('chosen-model');expect(dialog.textContent).toContain('費用は利用者の GitHub Copilot の契約');expect(dialog.textContent).toContain('チャットの質問・履歴');
  expect(fetchMock.mock.calls.some(c=>String(c[0]).endsWith('/foundry/connection'))).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'確認して有効にする'}));await waitFor(()=>expect(toggle.checked).toBe(true));expect(enabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox',{name:'モデル名（任意）'}),{target:{value:'new-model'}});fireEvent.click(screen.getByRole('button',{name:'Copilot の接続情報を保存'}));await waitFor(()=>expect(toggle.checked).toBe(false));
 });
 it('FR-289 AC-757 Copilot disables actual AI import UI, explains unsupported and makes zero import requests',async()=>{
  provider='copilot';render(<FluentProvider theme={webLightTheme}><AiImport projectId="p"/></FluentProvider>);
  await waitFor(()=>expect(screen.getByTestId('ai-import-guide').textContent).toContain('Copilot SDK では未対応'));
  const button=screen.getByRole('button',{name:'AI 取り込み'}) as HTMLButtonElement;expect(button.disabled).toBe(true);fireEvent.click(button);expect(screen.queryByLabelText('AI 取り込みのファイル')).toBeNull();expect(fetchMock.mock.calls.some(c=>String(c[0]).includes('/foundry/import'))).toBe(false);
 });
});
