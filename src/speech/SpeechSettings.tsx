// 設定画面の「音声設定」の枠（FR-167）。接続先が「設定済み／未設定」かを文字で示し、字幕の読み上げの有効・無効を切り替える。
// 接続先とキーは、中継プロセスが暗号化して保管する（FR-168・NFR-SEC-005）。ここで入力して保存・削除でき、保存後は値を再表示しない。
import { useEffect, useState } from 'react';
import { Button, Field, Input, Switch, Text } from '@fluentui/react-components';
import { usePackStore } from '../store/pack';
import { useSettings } from '../store/settings';
import { isSpeechConfigured, speechHost } from './speech';
import { deleteSpeechConfig, putSpeechConfig, useSpeechRelay } from './relayKey';

export function SpeechSettings() {
  const speech = usePackStore((s) => s.runtime.speech);
  const relayUrl = usePackStore((s) => s.runtime.relayUrl);
  const view = useSpeechRelay((s) => s.view);
  const refresh = useSpeechRelay((s) => s.refresh);
  const setView = useSpeechRelay((s) => s.setView);
  const enabled = useSettings((s) => s.speechEnabled);
  const setEnabled = useSettings((s) => s.setSpeechEnabled);
  // 入力欄の値は保存の直後に消す（キーは画面にも state にも残さない）
  const [endpoint, setEndpoint] = useState('');
  const [region, setRegion] = useState('');
  const [key, setKey] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { void refresh(relayUrl); }, [relayUrl, refresh]);
  useEffect(() => { if (view) { setEndpoint(view.endpoint); setRegion(view.region); } }, [view]);
  const viaRelay = !!relayUrl && !!view?.configured;
  const configured = viaRelay || isSpeechConfigured(speech);
  const save = async () => {
    const r = await putSpeechConfig(relayUrl as string, { endpoint, region, key });
    setKey('');
    if (r.ok) { setView(r.view); setResult({ ok: true, text: 'API キーを保存しました（画面には再表示しません）。' }); }
    else setResult({ ok: false, text: `保存できませんでした。${r.message}` });
  };
  const remove = async () => {
    const v = await deleteSpeechConfig(relayUrl as string);
    setKey('');
    if (v) { setView(v); setEndpoint(''); setRegion(''); setResult({ ok: true, text: 'API キーを削除しました。接続先は未設定です。' }); }
    else setResult({ ok: false, text: '削除できませんでした。中継プロセスが起動しているか確認してください。' });
  };
  return (
    <section role="region" aria-labelledby="speech-settings-title" data-testid="speech-settings">
      <Text id="speech-settings-title" as="h3" weight="semibold">音声設定</Text>
      <Field hint="再生中の字幕の文言を、音声合成の接続先（Azure AI Speech など）へ送って読み上げます。音はミュートを解除したときだけ鳴ります。">
        <Text size={200}>
          接続先の状態: <b data-testid="speech-status">{configured ? '設定済み' : '未設定'}</b>
          {configured ? `（送信先: ${viaRelay ? view?.host : speechHost(speech)}）` : null}
        </Text>
        {viaRelay ? <Text size={200} data-testid="speech-key-mask">API キー: 設定済み（{view?.keyMask}）</Text> : null}
        <Switch
          checked={enabled}
          label="字幕の読み上げ"
          aria-label="字幕の読み上げ"
          onChange={(_, d) => setEnabled(d.checked)}
        />
        {relayUrl ? (
          <form
            data-testid="speech-key-form"
            onSubmit={(e) => { e.preventDefault(); void save(); }}
          >
            <Field label="接続先の URL">
              <Input value={endpoint} aria-label="接続先の URL" onChange={(_, d) => setEndpoint(d.value)} />
            </Field>
            <Field label="リージョン">
              <Input value={region} aria-label="リージョン" onChange={(_, d) => setRegion(d.value)} />
            </Field>
            <Field label="API キー" hint="入力したキーは手元の中継プロセスが暗号化して保管します。保存後は再表示しません。変更するときは新しいキーを入れて保存してください。">
              <Input type="password" value={key} aria-label="API キー" autoComplete="off" onChange={(_, d) => setKey(d.value)} />
            </Field>
            <Button type="submit" appearance="primary" aria-label="API キーを保存">保存</Button>
            <Button type="button" aria-label="API キーを削除" disabled={!view?.configured} onClick={() => void remove()}>削除</Button>
            {result ? <Text role={result.ok ? 'status' : 'alert'} size={200} data-testid="speech-key-result">{result.text}</Text> : null}
          </form>
        ) : (
          <Text size={200}>キーの保存には、手元の中継プロセス（npm run relay）と relayUrl の設定が必要です。キーはブラウザーには保存しません。</Text>
        )}
        {enabled && !configured ? (
          <Text role="alert" size={200}>音声合成の接続先が未設定です。実行時の設定に接続先とキーを入れて再読み込みしてください。再生は字幕だけで進みます。</Text>
        ) : null}
      </Field>
    </section>
  );
}
