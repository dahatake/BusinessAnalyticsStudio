// 表示言語のトグル（FR-293 AC-786）。ボタン名は常に "日本語" / "English"（現在の言語は aria-pressed で伝える）。
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { useLang, type Lang } from './store';
import { useT } from './useT';

const useStyles = makeStyles({
  group: { display: 'inline-flex', gap: tokens.spacingHorizontalXXS },
  floating: { position: 'fixed', top: tokens.spacingVerticalS, right: tokens.spacingHorizontalM, zIndex: 10 },
});

/** メイン画面（ヘッダーのない画面）の右上に置くトグル。 */
export function FloatingLanguageToggle() {
  const s = useStyles();
  return <div className={s.floating}><LanguageToggle /></div>;
}

const OPTIONS: ReadonlyArray<{ lang: Lang; label: string }> = [
  { lang: 'ja', label: '日本語' },
  { lang: 'en', label: 'English' },
];

export function LanguageToggle() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();
  const s = useStyles();
  return (
    <div role="group" aria-label={t('表示言語')} data-testid="language-toggle" className={s.group}>
      {OPTIONS.map((o) => (
        <Button
          key={o.lang}
          size="small"
          appearance={lang === o.lang ? 'primary' : 'subtle'}
          aria-pressed={lang === o.lang}
          lang={o.lang}
          data-testid={`language-${o.lang}`}
          onClick={() => setLang(o.lang)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
