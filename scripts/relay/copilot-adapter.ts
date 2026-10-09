// GitHub Copilot SDK の実体のつなぎ込み。利用者の PC のサインイン（Copilot CLI）を使い、API キーは持たない。
// SDK（@github/copilot-sdk）は任意の依存で、入っていないときは「利用できない」として扱い、中継プロセスはモックで動く。
import type { AiKind, CopilotSdk } from './relay';

const SYSTEM: Record<AiKind, string> = {
  structure: '議論の内容を、課題・解決策・根拠の木構造に整理してください。',
  summary: '次の内容を簡潔に要約してください。',
  recommend: '次の状況に対する提言を、根拠とともに示してください。',
  chat: '顧客パックの内容を根拠に、質問に答えてください。',
  'exec-summary': '次の内容でエグゼクティブサマリーを更新してください。',
};

interface SdkSession { sendAndWait(o: { prompt: string }): Promise<{ data?: { content?: string } } | undefined> }
interface SdkClient {
  start(): Promise<void>;
  createSession(o?: Record<string, unknown>): Promise<SdkSession>;
}

export async function loadCopilotSdk(): Promise<CopilotSdk | null> {
  const name = '@github/copilot-sdk';
  let mod: { CopilotClient?: new () => SdkClient };
  try {
    mod = (await import(/* @vite-ignore */ name)) as typeof mod;
  } catch {
    return null;
  }
  if (!mod.CopilotClient) return null;
  const Ctor = mod.CopilotClient;
  let client: SdkClient | null = null;
  const ensure = async (): Promise<SdkClient> => {
    if (!client) {
      const c = new Ctor();
      await c.start();
      client = c;
    }
    return client;
  };
  return {
    async status() {
      try { await ensure(); return { signedIn: true }; } catch { return { signedIn: false }; }
    },
    async complete(kind, prompt) {
      const session = await (await ensure()).createSession({});
      const r = await session.sendAndWait({ prompt: `${SYSTEM[kind]}\n\n${prompt}` });
      return r?.data?.content ?? '';
    },
  };
}
