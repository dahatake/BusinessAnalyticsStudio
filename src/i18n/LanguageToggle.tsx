// 表示言語のトグル（FR-293 AC-786）。ボタン名は常に "日本語" / "English"（現在の言語は aria-pressed で伝える）。
import { Button } from '@fluentui/react-components';
import { useLang, type Lang } from './store';
import { useT } from './useT';

const OPTIONS: ReadonlyArray<{ lang: Lang; label: string }> = [
  { lang: 'ja', label: '日本語' },
  { lang: 'en', label: 'English' },
];

export function LanguageToggle() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();
  return (
    <div role="group" aria-label={t('表示言語')} data-testid="language-toggle" style={{ display: 'inline-flex', gap: 2 }}>
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
