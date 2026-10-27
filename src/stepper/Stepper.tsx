// 業務改善ステッパー（FR-136・FR-228）。画面の上部に全ステップと現在位置を常に出し、選ぶと作業画面へ移り、関連するコンポーネントを再配置する。
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Checkmark16Regular, ChevronRight20Regular } from '@fluentui/react-icons';
import { STEPS, STEP_STATE_LABEL, stepState } from './model';
import { useStepper } from '../store/stepper';
import { useStepFlow } from '../store/stepFlow';
import { useT } from '../i18n';

/** 操作の大きさの下限（px。FR-228 AC-528・WCAG 2.2 の目標サイズ） */
const TARGET = 44;

const useStyles = makeStyles({
  root: { width: '100%', display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    rowGap: tokens.spacingVerticalXS,
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  item: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS },
  step: {
    minHeight: `${TARGET}px`,
    minWidth: '120px',
    columnGap: tokens.spacingHorizontalS,
    paddingInline: tokens.spacingHorizontalM,
    fontWeight: tokens.fontWeightSemibold,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: tokens.borderRadiusCircular,
    border: `${tokens.strokeWidthThick} solid currentColor`,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200, // NFR-UX-015 AC-476: 12px は 16px の行の高さ（文字の段）
    flexShrink: 0,
  },
  flow: { display: 'inline-flex', alignItems: 'center', color: tokens.colorNeutralForeground3 },
  done: { color: tokens.colorPaletteGreenForeground1 },
  pending: { color: tokens.colorNeutralForeground3 },
});

export interface StepperProps {
  /** ステップの作業画面へ移る（画面の登録の key） */
  onNavigate: (screenKey: string) => void;
}

export function Stepper({ onNavigate }: StepperProps) {
  const s = useStyles();
  const t = useT();
  const current = useStepper((st) => st.current);
  const setCurrent = useStepper((st) => st.setCurrent);
  const tracked = useStepper((st) => st.projectId !== null); // FR-136 AC-372: Project を開いていないデモは完了済みを持たない
  return (
    <nav aria-label={t('業務改善ステップ')} data-testid="stepper" className={s.root}>
      <ol className={s.list}>
        {STEPS.map((step, i) => {
          const state = stepState(i, current, tracked);
          return (
            <li key={step.key} className={s.item} data-step-state={state}>
              <Button
                size="large"
                appearance={state === 'current' ? 'primary' : 'secondary'}
                className={mergeClasses(s.step, state === 'done' && s.done, state === 'not-started' && s.pending)}
                aria-current={state === 'current' ? 'step' : undefined}
                title={t(STEP_STATE_LABEL[state])}
                onClick={() => {
                  setCurrent(i);
                  onNavigate(step.screen);
                  step.also?.forEach(onNavigate);
                  useStepFlow.getState().request(i); // FR-228: 関連するコンポーネントの再配置
                }}
              >
                <span data-step-number aria-hidden className={s.badge}>{i + 1}</span>
                {t(step.label)}
                {state === 'done' ? <Checkmark16Regular aria-hidden /> : null}
              </Button>
              {i < STEPS.length - 1 ? (
                <span data-testid="step-flow" aria-hidden className={s.flow}><ChevronRight20Regular /></span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
