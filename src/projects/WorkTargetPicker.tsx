// 作業先の選択画面（FR-144）。キーボードだけで、開き・候補を矢印キーで選び・Enter で確定できる（AC-232）。
import { Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, Listbox, Option, Text, makeStyles, tokens } from '@fluentui/react-components';
import type { Company, Project } from '../store/projects';
import { parseChoice, targetOptions, type TargetChoice } from './workTarget';

const useStyles = makeStyles({
  hint: { color: tokens.colorNeutralForeground2, marginBottom: tokens.spacingVerticalS, display: 'block', fontSize: tokens.fontSizeBase200 },
  list: { minWidth: '320px', maxHeight: '60vh' },
});

export function WorkTargetPicker(props: {
  projects: readonly Project[];
  companies: readonly Company[];
  onChoose: (c: TargetChoice) => void;
  onClose: () => void;
}) {
  const s = useStyles();
  const options = targetOptions(props.projects, props.companies);
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) props.onClose(); }}>
      <DialogSurface aria-label="作業先の選択">
        <DialogBody>
          <DialogTitle>作業先の選択</DialogTitle>
          <DialogContent>
            <Text className={s.hint}>矢印キーで選び、Enter で確定します。デモの内容と実際の Project の内容は混ざりません。</Text>
            <Listbox
              className={s.list}
              aria-label="作業先の候補"
              selectedOptions={[]}
              onOptionSelect={(_, d) => {
                const c = d.optionValue ? parseChoice(d.optionValue) : null;
                if (c) props.onChoose(c);
              }}
            >
              {options.map((o) => <Option key={o.value} value={o.value} text={o.label}>{o.label}</Option>)}
            </Listbox>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
