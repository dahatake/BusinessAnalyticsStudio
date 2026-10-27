// 画面の中の既存の 2D/3D の切替（FR-037 ナレッジグラフ・FR-040 アーキテクチャ図・FR-022 ガントの 2D/2.5D）を、
// 見出しの「ビュー」と同じ 1 つの状態・同じ規則で出す共通の部品（FR-217 AC-500・AC-507）。
// 選べない選択肢（3D の表現がない・この環境では描画できない）は無効にし、理由を文字で示す。
import { Field, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { useT } from '../i18n';
import { useComponentView } from './useView';
import { modeOptions, type ViewMode } from './viewModel';

const useStyles = makeStyles({
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  reason: { color: tokens.colorNeutralForeground2 },
});

export interface ModeRadioProps {
  /** コンポーネントのキー（見出しの「ビュー」と同じ状態を使う） */
  viewKey: string;
  /** 選択肢の表示名（例: ガントの 3D 相当は「2.5D」） */
  labels?: Partial<Record<ViewMode, string>>;
}

export function ModeRadio({ viewKey, labels }: ModeRadioProps) {
  const s = useStyles();
  const t = useT();
  const v = useComponentView(viewKey);
  // Graph は、Graph の表現を持つ画面だけの選択肢（ほかの画面の「ビュー」のメニューでは理由つきで無効にして示す。FR-238）
  const opts = modeOptions(v.decl, v.can3D).filter((o) => o.value !== 'graph' || v.decl.hasGraph);
  const reasons = opts.filter((o) => !o.enabled && o.reason).map((o) => o.reason!);
  return (
    <Field label={t('表示')}>
      <span className={s.row}>
        <RadioGroup
          layout="horizontal"
          value={v.mode}
          onChange={(_, d) => { const o = opts.find((x) => x.value === d.value); if (o?.enabled) v.setMode(o.value); }}
        >
          {opts.map((o) => <Radio key={o.value} value={o.value} label={labels?.[o.value] ?? t(o.label)} disabled={!o.enabled} />)}
        </RadioGroup>
        {reasons.map((r) => <Text key={r} size={200} className={s.reason} data-testid="mode-reason">{t(r)}</Text>)}
      </span>
    </Field>
  );
}
