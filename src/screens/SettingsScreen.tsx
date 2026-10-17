// 設定パネル（テーマ、ブランドの確認と上書き、3D の品質・業種プリセット、AI）。FR-058、FR-059、FR-060、FR-064、FR-065、FR-066、FR-069
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Dropdown, Field, Input, Option, Switch, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { Panel } from '../components/Panel';
import { AiSettings } from '../ai/AiSettings';
import { SpeechSettings } from '../speech/SpeechSettings';
import { WorkTargetSettings } from '../projects/WorkTargetSettings';
import { DEFAULT_EXPAND_POSITION, EXPAND_LABEL, EXPAND_POSITIONS, THEME_MODES, useSettings, type ExpandPosition, type Handedness, type ThemeMode } from '../store/settings';
import { INDUSTRY_PRESETS, useIndustryPreset, useView3D } from '../store/view3d';
import { QUALITIES, type Quality } from '../three/quality';
import { PresetIcon } from '../three/presetIcons';
import { TEMPLATE_VERSION } from '../version';
import { usePackStore } from '../store/pack';
import { isHexColor } from '../theme/brand';
import { buildBrandTheme } from '../theme/brandTheme';
import { useEffectiveBrand } from '../theme/useBrand';

const LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'システムに合わせる' };

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, marginTop: tokens.spacingVerticalXL },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(80px, 120px) 1fr',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
    padding: tokens.spacingVerticalS,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    alignItems: 'baseline',
  },
  meta: { color: tokens.colorNeutralForeground2 },
  ramp: { display: 'grid', gridTemplateColumns: 'repeat(16, minmax(12px, 1fr))', maxWidth: '640px', borderRadius: tokens.borderRadiusMedium, overflow: 'hidden' },
  step: { height: '32px' },
  editor: { display: 'flex', alignItems: 'flex-end', columnGap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  error: { color: tokens.colorPaletteRedForeground1 },
  // Fluent の primary ボタンは強制カラーを無効にする。OS の色で描くため既定（auto）に戻す（FR-058 AC-071）
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

type Conf = '高' | '中' | '低' | '推定';
/** 確度が低い値は「推定」と表示する（FR-064） */
const isLow = (c: Conf): boolean => c === '低' || c === '推定';

function BrandRow({ testId, label, value, source, retrievedAt, confidence }: {
  testId: string; label: string; value: React.ReactNode; source: string; retrievedAt: string; confidence: Conf;
}) {
  const s = useStyles();
  return (
    <div className={s.row} data-testid={testId}>
      <Text weight="semibold">{label}</Text>
      <div>
        <div>{value}</div>
        <Text className={s.meta} size={200} block>
          出典: {source}／確認日: {retrievedAt}／確度: {confidence}
        </Text>
        {isLow(confidence) ? <Badge appearance="outline" color="warning">推定</Badge> : null}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const s = useStyles();
  const mode = useSettings((st) => st.themeMode);
  const setMode = useSettings((st) => st.setThemeMode);
  const handedness = useSettings((st) => st.handedness);
  const setHandedness = useSettings((st) => st.setHandedness);
  const expandPosition = useSettings((st) => st.expandPosition);
  const setExpandPosition = useSettings((st) => st.setExpandPosition);
  const override = useSettings((st) => st.brandPrimaryOverride);
  const setOverride = useSettings((st) => st.setBrandPrimaryOverride);
  const bgmEnabled = useSettings((st) => st.bgmEnabled);
  const setBgmEnabled = useSettings((st) => st.setBgmEnabled);
  const seEnabled = useSettings((st) => st.seEnabled);
  const setSeEnabled = useSettings((st) => st.setSeEnabled);
  const packState = usePackStore((st) => st.state);
  const brand = useEffectiveBrand();
  const primary = brand?.colors.primary;

  const [draft, setDraft] = useState(primary ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (primary) setDraft(primary); }, [primary]);

  const themes = useMemo(
    () => (primary ? (['light', 'dark'] as const).map((m) => ({ m, t: buildBrandTheme(m, primary, brand?.fonts.primary) })) : []),
    [primary, brand?.fonts.primary],
  );

  const commit = () => {
    const v = (draft.startsWith('#') ? draft : `#${draft}`).trim();
    if (!isHexColor(v)) {
      setError(`「${draft}」は色として読めません。#RRGGBB の形（例: #2E7D32）で入力してください。`);
      return;
    }
    setError(null);
    setOverride(v.toUpperCase());
  };
  const revert = () => { setError(null); setDraft(primary ?? ''); };

  const packPrimary = packState.status === 'ready' ? packState.pack.brand.colors.primary : undefined;

  const quality = useView3D((st) => st.quality);
  const setQuality = useView3D((st) => st.setQuality);
  const renderer = useView3D((st) => st.renderer);
  const fps = useView3D((st) => st.fps);
  const notice = useView3D((st) => st.autoNotice);
  const setIndustry = useView3D((st) => st.setIndustry);
  const preset = useIndustryPreset();
  return (
    <Panel testId="component-settings" title="設定パネル" description="表示の設定です。ハイコントラストは OS の設定に従います。">
      <Field label="テーマ">
        <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as ThemeMode)}>
          {THEME_MODES.map((m) => <Radio key={m} value={m} label={LABELS[m]} />)}
        </RadioGroup>
      </Field>
      <Field label="利き手（インクのツールバーを置く側）">
        <RadioGroup layout="horizontal" value={handedness} onChange={(_, d) => setHandedness(d.value as Handedness)}>
          <Radio value="right" label="右利き" />
          <Radio value="left" label="左利き" />
        </RadioGroup>
      </Field>
      <Field label="拡大表示の位置" hint="コンポーネントの見出しをダブルクリック（またはメニュー・Shift+E）したときに、作業領域の 75% を使って表示する位置です。">
        <RadioGroup layout="horizontal" value={expandPosition} onChange={(_, d) => setExpandPosition(d.value as ExpandPosition)}>
          {EXPAND_POSITIONS.map((p) => <Radio key={p} value={p} label={EXPAND_LABEL[p]} />)}
        </RadioGroup>
        <Button size="small" appearance="subtle" disabled={expandPosition === DEFAULT_EXPAND_POSITION} onClick={() => setExpandPosition(DEFAULT_EXPAND_POSITION)}>拡大表示の位置を既定（上）に戻す</Button>
      </Field>
      <WorkTargetSettings />
      <SpeechSettings />
      <div role="group" aria-labelledby="audio-settings-title">
        <Text id="audio-settings-title" as="p" weight="semibold">音声</Text>
        <Switch label="BGM" checked={bgmEnabled} onChange={(_, d) => setBgmEnabled(d.checked)} />
        <Switch label="効果音" checked={seEnabled} onChange={(_, d) => setSeEnabled(d.checked)} />
        <Text as="p" block size={200}>ミュートと音量は、画面下のショーコントロールバー（M キー）で操作します。</Text>
      </div>
      <Field label="3D の品質">
        <RadioGroup layout="horizontal" value={quality} onChange={(_, d) => setQuality(d.value as Quality)}>
          {QUALITIES.map((q) => <Radio key={q} value={q} label={q} />)}
        </RadioGroup>
      </Field>
      <Field label="業種プリセット">
        <Dropdown
          value={preset.label}
          selectedOptions={[preset.id]}
          onOptionSelect={(_, d) => { if (d.optionValue) setIndustry(d.optionValue); }}
        >
          {INDUSTRY_PRESETS.map((p) => <Option key={p.id} value={p.id} text={p.label}><PresetIcon preset={p} /> {p.label}</Option>)}
        </Dropdown>
      </Field>
      <Text as="p" data-testid="preset-description"><PresetIcon preset={preset} /> {preset.label}: {preset.scene.description}</Text>
      <Text as="p" data-testid="template-version">雛形のバージョン: {TEMPLATE_VERSION}</Text>
      <Text as="p" data-testid="quality-current">現在の品質: {quality}</Text>
      <Text as="p" data-testid="fps">FPS: {fps.toFixed(1)} fps（3D 表示中の最後の計測値）</Text>
      <Text as="p" data-testid="renderer">描画方式: {renderer}</Text>
      {notice && <Text as="p" role="status">{notice}</Text>}

      {brand ? (
        <section className={s.section} aria-label="ブランド">
          <Text as="h3" size={400} weight="semibold">ブランド</Text>
          <BrandRow testId="brand-color" label="色" value={<>Primary {brand.colors.primary}{override ? '（手動で上書き中）' : ''}</>}
            source={override ? '利用者が設定パネルで上書き' : brand.colors.source} retrievedAt={override ? '—' : brand.colors.retrievedAt}
            confidence={override ? '高' : brand.colors.confidence} />
          <BrandRow testId="brand-logo" label="ロゴ"
            value={brand.logo.status === 'confirmed' ? '利用条件: 確認済み（同梱のロゴを表示）' : '利用条件: 不明（プレースホルダーを表示）'}
            source={brand.logo.source} retrievedAt={brand.logo.retrievedAt} confidence={brand.logo.confidence} />
          <BrandRow testId="brand-font" label="フォント" value={`${brand.fonts.primary} → Segoe UI Variable → Noto Sans JP`}
            source={brand.fonts.source} retrievedAt={brand.fonts.retrievedAt} confidence={brand.fonts.confidence} />
          <BrandRow testId="brand-tone" label="トーン" value={brand.tone.value}
            source={brand.tone.source} retrievedAt={brand.tone.retrievedAt} confidence={brand.tone.confidence} />

          <div className={s.editor}>
            <Field label="Primary 色" validationState={error ? 'error' : 'none'} hint="#RRGGBB。Enter で反映、Esc で元に戻します。">
              <Input
                value={draft}
                onChange={(_, d) => { setDraft(d.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') revert(); }}
              />
            </Field>
            <Button appearance="primary" className={s.forcedAuto} data-testid="primary-action" onClick={commit}>反映する</Button>
            {override ? <Button onClick={() => { setOverride(null); setError(null); }}>パックの値{packPrimary ? `（${packPrimary}）` : ''}に戻す</Button> : null}
          </div>
          {error ? <div role="alert" className={s.error}>{error}</div> : null}

          <Field label={`ブランドランプ（${themes[0]?.t.ramp.length ?? 16} 段階。濃い方が左）`}>
            <div className={s.ramp} data-testid="brand-ramp">
              {themes[0]?.t.ramp.map((r) => (
                <span key={r.step} className={s.step} data-step={r.step} data-color={r.color} data-primary={r.primary ? 'true' : 'false'}
                  style={{ backgroundColor: r.color }} title={`${r.step}: ${r.color}`} />
              ))}
            </div>
          </Field>
          <div data-testid="brand-corrections">
            {themes.flatMap(({ m, t }) => t.corrections.map((c) => (
              <Text key={`${m}-${c.original}-${c.color}`} size={200} block className={s.meta}>
                コントラストを補正: {m === 'light' ? 'Light' : 'Dark'} {c.original} → {c.color}（比 {c.ratio.toFixed(2)}、基準 {c.required}）
              </Text>
            )))}
            {themes.every(({ t }) => t.corrections.length === 0) ? <Text size={200} className={s.meta}>コントラストの補正は不要です（AA を満たしています）。</Text> : null}
          </div>
        </section>
      ) : null}
      <AiSettings />
    </Panel>
  );
}
