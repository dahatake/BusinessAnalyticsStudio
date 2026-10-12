// 業務改善ステッパー（FR-136）。画面の上部に全ステップと現在位置を常に出し、選ぶと作業画面へ移る。
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Checkmark16Regular } from '@fluentui/react-icons';
import { STEPS, STEP_STATE_LABEL, stepState } from './model';
import { useStepper } from '../store/stepper';

const useStyles = makeStyles({
  root: { width: '100%' },
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXS,
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  item: { display: 'flex', alignItems: 'center' },
  done: { color: tokens.colorPaletteGreenForeground1 },
  pending: { color: tokens.colorNeutralForeground3 },
});

export interface StepperProps {
  /** ステップの作業画面へ移る（画面の登録の key） */
  onNavigate: (screenKey: string) => void;
}

export function Stepper({ onNavigate }: StepperProps) {
  const s = useStyles();
  const current = useStepper((st) => st.current);
  const setCurrent = useStepper((st) => st.setCurrent);
  return (
    <nav aria-label="業務改善ステップ" data-testid="stepper" className={s.root}>
      <ol className={s.list}>
        {STEPS.map((step, i) => {
          const state = stepState(i, current);
          return (
            <li key={step.key} className={s.item} data-step-state={state}>
              <Button
                size="small"
                appearance={state === 'current' ? 'primary' : 'subtle'}
                className={mergeClasses(state === 'done' && s.done, state === 'not-started' && s.pending)}
                icon={state === 'done' ? <Checkmark16Regular aria-hidden /> : undefined}
                aria-current={state === 'current' ? 'step' : undefined}
                title={STEP_STATE_LABEL[state]}
                onClick={() => { setCurrent(i); onNavigate(step.screen); }}
              >
                {step.label}
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
