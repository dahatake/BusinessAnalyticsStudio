// 設定画面の「音声設定」の枠（FR-167）。接続先が「設定済み／未設定」かを文字で示し、字幕の読み上げの有効・無効を切り替える。
// 接続先とキーは実行時の設定から受け取る（モックのキー受け渡し枠）。キーの入力・保存・削除は FR-168（承認待ち）なので、ここには置かない。
import { Field, Switch, Text } from '@fluentui/react-components';
import { usePackStore } from '../store/pack';
import { useSettings } from '../store/settings';
import { isSpeechConfigured, speechHost } from './speech';

export function SpeechSettings() {
  const speech = usePackStore((s) => s.runtime.speech);
  const enabled = useSettings((s) => s.speechEnabled);
  const setEnabled = useSettings((s) => s.setSpeechEnabled);
  const configured = isSpeechConfigured(speech);
  return (
    <section role="region" aria-labelledby="speech-settings-title" data-testid="speech-settings">
      <Text id="speech-settings-title" as="h3" weight="semibold">音声設定</Text>
      <Field hint="再生中の字幕の文言を、音声合成の接続先（Azure AI Speech など）へ送って読み上げます。音はミュートを解除したときだけ鳴ります。">
        <Text size={200}>
          接続先の状態: <b data-testid="speech-status">{configured ? '設定済み' : '未設定'}</b>
          {configured ? `（送信先: ${speechHost(speech)}）` : null}
        </Text>
        <Switch
          checked={enabled}
          label="字幕の読み上げ"
          aria-label="字幕の読み上げ"
          onChange={(_, d) => setEnabled(d.checked)}
        />
        <Text size={200}>接続先とキーは実行時の設定（runtime-config.json の speech、または .env）から受け取ります。キーはここには表示せず、保存もしません。</Text>
        {enabled && !configured ? (
          <Text role="alert" size={200}>音声合成の接続先が未設定です。実行時の設定に接続先とキーを入れて再読み込みしてください。再生は字幕だけで進みます。</Text>
        ) : null}
      </Field>
    </section>
  );
}
