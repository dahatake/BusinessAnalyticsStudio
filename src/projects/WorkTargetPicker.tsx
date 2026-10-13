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
  /** 選択画面にデモを出すか（既定 true。AC-240） */
  showDemo?: boolean;
  /** 前回の作業先（最初の候補にする。AC-238） */
  currentId?: string | null;
  /** false なら、何も選ばずには閉じられない（起動時。AC-237） */
  dismissable?: boolean;
}) {
  const s = useStyles();
  const options = targetOptions(props.projects, props.companies, { showDemo: props.showDemo, currentId: props.currentId });
  const noProject = !options.some((o) => o.kind === 'project');
  const dismissable = props.dismissable !== false;
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open && dismissable) props.onClose(); }}>
      <DialogSurface aria-label="作業先の選択">
        <DialogBody>
          <DialogTitle>作業先の選択</DialogTitle>
          <DialogContent>
            <Text className={s.hint}>矢印キーで選び、Enter で確定します。デモの内容と実際の Project の内容は混ざりません。</Text>
            {props.showDemo === false && noProject ? (
              <Text className={s.hint} role="note">デモは選択画面に表示しない設定です。「実際の Project を登録」を選ぶか、設定の「選択画面にデモを表示」をオンにしてください。</Text>
            ) : null}
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
