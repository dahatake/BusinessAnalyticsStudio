// ミニ・モックアプリ（FR-043）。選んだ解決策の動くモックを、スマホ・タブレット・PC の枠で見せる。画面は 1〜3 枚（PARAM-022）で、
// 画面間のボタンで遷移できる。モックは解決策の選択（共通の選択状態）と連動し、実際の製品ではないので「モック（イメージ）」と明示する。
import { useMemo, useState } from 'react';
import {
  Badge, Button, Field, Input, Radio, RadioGroup, Select, Text, Textarea, makeStyles, tokens,
} from '@fluentui/react-components';
import { PhoneDesktop24Regular } from '@fluentui/react-icons';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { useSelection } from '../selection/hooks';
import { usePackStore } from '../store/pack';
import type { PackData } from '../schema';

type Mock = PackData['mocks']['mocks'][number];
type MockScreen = NonNullable<Mock['screens']>[number];
type MockField = NonNullable<MockScreen['fields']>[number];

const ORIGIN = 'mock-app';

type Device = 'phone' | 'tablet' | 'pc';
const DEVICES: ReadonlyArray<{ key: Device; label: string }> = [
  { key: 'phone', label: 'スマホ' },
  { key: 'tablet', label: 'タブレット' },
  { key: 'pc', label: 'PC' },
];

const useStyles = makeStyles({
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalS },
  list: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS },
  stage: { display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalL, backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusLarge },
  frame: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow16,
  },
  phone: { width: 'min(100%, 320px)', aspectRatio: '9 / 17', borderRadius: tokens.borderRadiusXLarge },
  tablet: { width: 'min(100%, 520px)', aspectRatio: '4 / 5', borderRadius: tokens.borderRadiusLarge },
  pc: { width: '100%', aspectRatio: '16 / 10', borderRadius: tokens.borderRadiusMedium },
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  screen: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL, flexGrow: 1, overflow: 'auto', minHeight: 0 },
  items: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  nav: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalS, marginTop: 'auto' },
});

function MockFieldView({ field }: { field: MockField }) {
  const kind = field.kind ?? 'text';
  const value = field.value ?? '';
  return (
    <Field label={field.label}>
      {kind === 'select' ? (
        <Select defaultValue={value}>
          {(field.options ?? [value]).map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      ) : kind === 'textarea' ? (
        <Textarea defaultValue={value} resize="vertical" />
      ) : (
        <Input type={kind === 'date' ? 'date' : 'text'} inputMode={kind === 'number' ? 'numeric' : undefined} defaultValue={value} />
      )}
    </Field>
  );
}

/** 選んだモックの 1 画面と、他の画面へ移るボタン */
function MockScreenView({ mock, index, onGo }: { mock: Mock; index: number; onGo: (i: number) => void }) {
  const s = useStyles();
  const screens = mock.screens ?? [];
  const screen = screens[index] ?? screens[0];
  if (!screen) return <Text>このモックには画面がありません。</Text>;
  return (
    <div className={s.screen} data-testid="mock-screen">
      <Text as="h3" size={500} weight="semibold">{screen.title}</Text>
      {screen.description ? <Text>{screen.description}</Text> : null}
      {(screen.fields ?? []).map((f, i) => <MockFieldView key={`${screen.title}-${i}`} field={f} />)}
      {screen.items && screen.items.length > 0 ? <ul className={s.items}>{screen.items.map((t, i) => <li key={i}><Text>{t}</Text></li>)}</ul> : null}
      {screens.length > 1 ? (
        <nav className={s.nav} aria-label="画面の遷移">
          {screens.map((sc, i) => (i === index ? null : <Button key={`${sc.title}-${i}`} appearance="primary" onClick={() => onGo(i)}>{sc.title}</Button>))}
        </nav>
      ) : null}
    </div>
  );
}

/** 選択（課題・解決策）から、見せるモックを決める。主の選択が解決策ならその解決策、課題ならその課題の解決策のうち最初にモックがあるもの */
function pickMock(data: PackData, selectedIds: readonly string[]): { mock?: Mock; solutionTitle?: string; selected: boolean } {
  const mocks = data.mocks.mocks;
  const bySolution = new Map<string, Mock>();
  for (const m of mocks) if (m.solutionId && !bySolution.has(m.solutionId)) bySolution.set(m.solutionId, m);
  for (const id of [...selectedIds].reverse()) {
    const sol = data.issues.solutions.find((x) => x.id === id);
    if (sol) return { mock: bySolution.get(sol.id), solutionTitle: sol.title, selected: true };
    const own = mocks.find((m) => m.id === id);
    if (own) return { mock: own, solutionTitle: data.issues.solutions.find((x) => x.id === own.solutionId)?.title, selected: true };
    if (data.issues.issues.some((i) => i.id === id)) {
      for (const sol2 of data.issues.solutions) {
        if (sol2.issueId === id || sol2.issueIds?.includes(id)) {
          const m = bySolution.get(sol2.id);
          if (m) return { mock: m, solutionTitle: sol2.title, selected: true };
        }
      }
      return { selected: true };
    }
  }
  return { selected: selectedIds.length > 0 };
}

function MockAppScreen() {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const { selectedIds, select } = useSelection();
  const [device, setDevice] = useState<Device>('phone');
  const [at, setAt] = useState<{ mockId: string; index: number }>({ mockId: '', index: 0 });
  const data = state.status === 'ready' ? state.pack.data : undefined;
  const picked = useMemo(() => (data ? pickMock(data, selectedIds) : undefined), [data, selectedIds]);

  if (!data || !picked) return <LoadingView label="モックを読み込み中" />;
  const { mock } = picked;
  const index = mock && at.mockId === mock.id ? at.index : 0;
  const withMock = data.issues.solutions.filter((x) => data.mocks.mocks.some((m) => m.solutionId === x.id));

  return (
    <Panel
      testId="component-mock-app"
      title="ミニ・モックアプリ"
      description="解決策を選ぶと、その解決策の動くモックを表示します。実際の製品ではなく、見え方を確かめるためのイメージです。"
    >
      <div className={s.head}>
        <Badge appearance="filled" color="warning" size="large" icon={<PhoneDesktop24Regular aria-hidden />} data-testid="mock-badge">モック（イメージ）</Badge>
        <Field label="表示する枠">
          <RadioGroup layout="horizontal" value={device} onChange={(_, d) => setDevice(d.value as Device)}>
            {DEVICES.map((d) => <Radio key={d.key} value={d.key} label={d.label} />)}
          </RadioGroup>
        </Field>
      </div>
      {withMock.length > 0 ? (
        <div className={s.list} role="group" aria-label="モックのある解決策">
          {withMock.map((sol) => (
            <Button key={sol.id} size="small" appearance={mock?.solutionId === sol.id ? 'primary' : 'outline'} onClick={() => select(sol.id, { origin: ORIGIN })}>{sol.title}</Button>
          ))}
        </div>
      ) : null}
      {mock ? (
        <>
          <Text>
            {picked.solutionTitle ? `解決策「${picked.solutionTitle}」のモック: ` : 'モック: '}{mock.title}
          </Text>
          <div className={s.stage}>
            <div className={`${s.frame} ${s[device]}`} data-testid="device-frame" data-device={device} role="group" aria-label={`${DEVICES.find((d) => d.key === device)?.label}の枠（モック・イメージ）`}>
              <div className={s.bar}>
                <Text size={200} weight="semibold">{mock.title}</Text>
                <Text size={200}>モック（イメージ）</Text>
              </div>
              <MockScreenView mock={mock} index={index} onGo={(i) => setAt({ mockId: mock.id, index: i })} />
            </div>
          </div>
        </>
      ) : (
        <EmptyView
          message={picked.selected
            ? '選んだ項目の解決策には、モックがありません。モックのある解決策を選んでください。'
            : '課題-解決策分析などで解決策を選ぶと、そのモックを表示します。'}
        />
      )}
    </Panel>
  );
}

export { MockAppScreen };
