// 設定パネル（テーマの切替、ブランドの確認と上書き）。FR-058、FR-059、FR-060、FR-064
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Radio, RadioGroup, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { THEME_MODES, useSettings, type ThemeMode } from '../store/settings';
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
  const override = useSettings((st) => st.brandPrimaryOverride);
  const setOverride = useSettings((st) => st.setBrandPrimaryOverride);
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

  return (
    <Panel testId="component-settings" title="設定パネル" description="表示の設定です。ハイコントラストは OS の設定に従います。">
      <Field label="テーマ">
        <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as ThemeMode)}>
          {THEME_MODES.map((m) => <Radio key={m} value={m} label={LABELS[m]} />)}
        </RadioGroup>
      </Field>

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
            <Button appearance="primary" data-testid="primary-action" onClick={commit}>反映する</Button>
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
    </Panel>
  );
}
