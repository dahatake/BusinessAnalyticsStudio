// FR-011 AC-771: no shell, no raw CLI output, bounded process lifetime.
import { spawn } from 'node:child_process';
export const SIGNIN_HELP = 'Copilot CLI を起動し /login でサインインしてから「認証状態を再確認」を押すか、トークン方式を使ってください。GitHub CLI の成功だけでは SDK の認証は保証されません。';
export function createCopilotSignin(spawnFn: typeof spawn = spawn, timeoutMs = 300_000) {
  let child: ReturnType<typeof spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: { status: string; code?: string; url?: string; message: string } = { status: 'idle', message: SIGNIN_HELP };
  let closed = false;
  return {
    view: () => ({ ...state }),
    start(onComplete: () => Promise<unknown>) {
      if (closed || child) return { ...state };
      state = { status: 'pending', message: SIGNIN_HELP };
      try {
        const proc = spawnFn('gh', ['auth', 'login', '--web'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_HOST: 'github.com' } });
        child = proc;
        let tail = '';
        const parse = (chunk: Buffer | string) => { tail = (tail + chunk.toString()).slice(-4096); const m = tail.match(/(?:code[:\s]+)([A-Z0-9]{4}-[A-Z0-9]{4})\b/i); if (m) state = { ...state, code: m[1]!.toUpperCase(), url: 'https://github.com/login/device' }; };
        proc.stdout?.on('data', parse); proc.stderr?.on('data', parse);
        let done = false;
        const finish = (status: string) => { if (done) return; done = true; clearTimeout(timer); child = undefined; tail = ''; state = { ...state, status, message: (status === 'completed' ? '' : 'GitHub CLI がない、失敗した、またはタイムアウトしました。') + SIGNIN_HELP }; if (!closed) void onComplete().catch(() => undefined); };
        proc.once('error', () => { proc.kill(); finish('failed'); });
        proc.once('close', (code) => finish(code === 0 ? 'completed' : 'failed'));
        timer = setTimeout(() => { proc.kill(); finish('timeout'); }, timeoutMs);
      } catch { state = { status: 'failed', message: SIGNIN_HELP }; if (!closed) void onComplete().catch(() => undefined); }
      return { ...state };
    },
    close() { closed = true; clearTimeout(timer); child?.kill(); child = undefined; },
  };
}
export type CopilotSignin = ReturnType<typeof createCopilotSignin>;
