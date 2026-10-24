// FR-011 AC-771: fake CLI only. No login, shell, browser or network is launched.
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createCopilotSignin } from '../../scripts/relay/copilot-signin';
function setup(timeout=300_000){
 const proc=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
 const spawnFn=vi.fn(()=>proc); const complete=vi.fn(async()=>({signedIn:false}));
 const signin=createCopilotSignin(spawnFn as unknown as typeof spawn,timeout);
 return {proc,spawnFn,signin,complete};
}
describe('FR-011 AC-771 bounded web signin',()=>{
 it('FR-011 AC-771 fixed shell-free arguments, only code and fixed URL, never raw output; completion rechecks SDK',async()=>{
  const s=setup();s.signin.start(s.complete);expect(s.spawnFn).toHaveBeenCalledWith('gh',['auth','login','--web'],expect.objectContaining({shell:false,windowsHide:true}));
  s.proc.stderr.write('secret-token and arbitrary https://evil.invalid\nFirst copy your one-time code: ABCD-1234\n');
  expect(s.signin.view()).toMatchObject({status:'pending',code:'ABCD-1234',url:'https://github.com/login/device'});expect(JSON.stringify(s.signin.view())).not.toContain('secret-token');expect(JSON.stringify(s.signin.view())).not.toContain('evil.invalid');
  s.signin.start(s.complete);expect(s.spawnFn).toHaveBeenCalledOnce();s.proc.emit('close',0);await Promise.resolve();expect(s.complete).toHaveBeenCalledOnce();expect(s.signin.view().message).toContain('保証されません');s.signin.close();
 });
 it('FR-011 AC-771 absent/failed CLI provides safe alternative instructions',()=>{
  const s=setup();s.signin.start(s.complete);s.proc.emit('error',new Error('secret diagnostic'));expect(s.signin.view().status).toBe('failed');expect(s.signin.view().message).toContain('/login');expect(JSON.stringify(s.signin.view())).not.toContain('secret diagnostic');s.signin.close();
 });
 it('FR-011 AC-771 timeout kills only the process this action launched and does not retain raw output',async()=>{
  const s=setup(10);s.signin.start(s.complete);await new Promise(r=>setTimeout(r,25));expect(s.proc.kill).toHaveBeenCalledOnce();expect(s.signin.view().status).toBe('timeout');expect(s.complete).toHaveBeenCalledOnce();s.signin.close();
 });
 it('FR-011 AC-771 closing relay cancels its pending login process without starting another auth check',()=>{
  const s=setup();s.signin.start(s.complete);s.signin.close();s.proc.emit('close',null);expect(s.proc.kill).toHaveBeenCalledOnce();expect(s.complete).not.toHaveBeenCalled();
 });
});
