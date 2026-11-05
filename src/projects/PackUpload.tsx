// 顧客パックの取り込み画面（FR-302。判別・検証は src/packImport、確認事項は FR-304）。メイン画面の「はじめての方へ」の入口から開く（FR-268 AC-856）。
// ファイルはブラウザーの中だけで読み、端末の外へは送らない（C-01）。1 ファイルが上限（PARAM-142: 5 MB）を超えるときは中身を読まない（AC-844）。
// 検証にエラーがあるときは確認欄を出さず、「取り込む」は押せない。確かめた旨の選択は取り込みの操作のためだけで、保存しない（FR-219）。brand-profile.json は Project ごとに保存される（AC-858）。
import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Button, Checkbox, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody,
  Radio, RadioGroup, Select, Text, Title2, Title3, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import {
  MAX_FILE_BYTES, byteLength, classifyFiles, reviewUpload, slotKindLabel, slotPath, validateUpload,
  type ClassifiedFiles, type PackSlot, type UploadError, type UploadFile,
} from '../packImport';
import { useProjects } from '../store/projects';
import { importPack } from './importPack';
import { usePackUploadUi } from './packUploadUi';
import { useT } from '../i18n';

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1, minWidth: 0, overflowWrap: 'anywhere',
  },
  drop: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  dropActive: { border: `${tokens.strokeWidthThick} dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  hidden: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
  table: { borderCollapse: 'collapse', width: '100%' },
  cell: { textAlign: 'left', padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalXL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  plain: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  card: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  ng: { color: tokens.colorPaletteRedForeground1 },
});

const MAX_SHOWN = 50;

/** サイズの表示（B・KB・MB） */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 一覧の「種別」の列。判別できないファイルは「判別できません」 */
function kindOf(c: ClassifiedFiles, name: string, t: (s: string) => string): string {
  for (const [slot, f] of Object.entries(c.assigned)) if (f && f.name === name) return slotKindLabel(slot as PackSlot);
  for (const d of c.duplicates) if (d.names.includes(name)) return `${slotKindLabel(d.slot)}（${t('重複')}）`;
  for (const o of c.oversize) if (o.name === name) return o.slot ? `${slotKindLabel(o.slot)}（${t('上限超過')}）` : t('判別できません');
  if (c.assets.includes(name)) return t('画像など（取り込み対象外）');
  return t('判別できません');
}

async function readFiles(list: File[]): Promise<UploadFile[]> {
  return Promise.all(list.map(async (f): Promise<UploadFile> => {
    // 上限を超えるファイルは読み込まない（AC-844）。名前とサイズだけで判定する
    if (f.size > MAX_FILE_BYTES) return { name: f.name, text: '', size: f.size };
    return { name: f.name, text: await f.text(), size: f.size };
  }));
}

export function PackUpload() {
  const s = useStyles();
  const t = useT();
  const hide = usePackUploadUi((u) => u.hide);
  const companies = useProjects((p) => p.companies);
  const projects = useProjects((p) => p.projects);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [company, setCompany] = useState<string | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [failure, setFailure] = useState<{ reason: string; remedy: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const classified = useMemo(() => (files.length > 0 ? classifyFiles(files) : null), [files]);
  const validation = useMemo(() => (classified ? validateUpload(classified) : null), [classified]);
  const review = useMemo(() => (validation ? reviewUpload(validation) : undefined), [validation]);

  const customer = validation?.data?.customer as { name?: string; projectName?: string } | undefined;
  const companyValue = company ?? customer?.name ?? '';
  const projectValue = project ?? customer?.projectName ?? '';
  const activeProjects = projects.filter((p) => !p.archived);
  const labelOf = (id: string): string => {
    const p = projects.find((x) => x.id === id);
    const c = p ? companies.find((x) => x.id === p.companyId) : undefined;
    return p ? `${c?.name ?? ''} / ${p.name}` : '';
  };

  // 選び直しは、渡したファイルで置き換わる。確認・取り込みの結果・入力した名前は、いったん初期に戻す
  const accept = async (list: File[]) => {
    if (list.length === 0) return;
    const mine = ++seq.current;
    const read = await readFiles(list);
    if (mine !== seq.current) return;
    setFiles(read);
    setConfirmed(false);
    setFailure(null);
    setDone(null);
    setCompany(null);
    setProject(null);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void accept(Array.from(e.dataTransfer?.files ?? []));
  };

  const targetOk = mode === 'new' ? companyValue.trim() !== '' && projectValue.trim() !== '' : targetId !== '';
  const canImport = !!(validation?.ok && review && validation.data && confirmed && targetOk);

  const run = () => {
    setAsking(false);
    if (!validation?.ok || !validation.data || !validation.brand) return;
    const r = mode === 'new'
      ? importPack({ mode: 'new', data: validation.data, brand: validation.brand, company: companyValue, project: projectValue })
      : importPack({ mode: 'replace', data: validation.data, brand: validation.brand, projectId: targetId });
    if (!r.ok) { setFailure({ reason: r.reason, remedy: r.remedy }); setDone(null); return; }
    setFailure(null);
    setDone(mode === 'new' ? t('取り込みました。Project「{name}」を作成しました。', { name: projectValue.trim() }) : t('取り込みました。「{name}」の顧客パックを置き換えました。', { name: labelOf(targetId) }));
    setFiles([]);
    setConfirmed(false);
    setCompany(null);
    setProject(null);
  };
  const submit = () => {
    if (!canImport) return;
    if (mode === 'replace') setAsking(true);
    else run();
  };

  const oversize = (validation?.errors ?? []).filter((e) => e.code === 'file-too-large');
  const shownErrors = (validation?.errors ?? []).filter((e) => e.code !== 'file-too-large');
  const line = (e: UploadError) => `${e.file}${e.path ? ` ${e.path}` : ''}${e.id ? ` [${e.id}]` : ''}: ${e.message} ${e.remedy}`;

  return (
    <section role="region" aria-label={t('顧客パックの取り込み')} className={s.root} data-testid="pack-upload">
      <div className={s.row}>
        <Title2 as="h2">{t('顧客パックの取り込み')}</Title2>
        <Button size="small" appearance="subtle" onClick={hide}>{t('閉じる')}</Button>
      </div>
      <Text>{t('Copilot で作った顧客パックのファイル（public/data の JSON 9 個と brand-profile.json。顧客調査・ブランド調査の .md は任意）を選ぶか、ここにドロップします。ファイルはこの端末の中だけで読み、外へは送りません。')}</Text>

      <div
        role="group" aria-label={t('ファイルのドロップ先')} className={`${s.drop} ${dragging ? s.dropActive : ''}`}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={input} type="file" multiple className={s.hidden} tabIndex={-1} aria-label={t('顧客パックのファイル')}
          onChange={(e) => { const list = Array.from(e.target.files ?? []); e.target.value = ''; void accept(list); }}
        />
        <Button appearance="primary" onClick={() => input.current?.click()}>{t('ファイルを選ぶ')}</Button>
        <Text size={200}>{t('複数のファイルをまとめて選べます。ドラッグ＆ドロップが使えないときも、このボタンだけで最後まで操作できます。1 ファイルは {max} まで。', { max: '5 MB' })}</Text>
      </div>

      {done ? <MessageBar intent="success" role="status"><MessageBarBody>{done}</MessageBarBody></MessageBar> : null}
      {failure ? (
        <MessageBar intent="error" role="alert" layout="multiline">
          <MessageBarBody>{t('取り込めません。')}{failure.reason} {failure.remedy}</MessageBarBody>
        </MessageBar>
      ) : null}
      {oversize.map((e, i) => (
        <MessageBar key={`${e.file}-${i}`} intent="error" role="alert" layout="multiline">
          <MessageBarBody>{e.message} {t('このファイルは読み込まず、取り込みも行いません。')}</MessageBarBody>
        </MessageBar>
      ))}

      {classified ? (
        <>
          <Title3 as="h3">{t('受け付けたファイル')}</Title3>
          <table className={s.table} aria-label={t('受け付けたファイル')}>
            <thead>
              <tr><th className={s.cell} scope="col">{t('ファイル名')}</th><th className={s.cell} scope="col">{t('種別')}</th><th className={s.cell} scope="col">{t('サイズ')}</th></tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={`${f.name}-${i}`}>
                  <td className={s.cell}>{f.name}</td>
                  <td className={s.cell}>{kindOf(classified, f.name, t)}</td>
                  <td className={s.cell}>{formatBytes(byteLength(f))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {classified.unknown.length + classified.duplicates.length + classified.missing.length + classified.assets.length > 0 ? (
            <ul className={s.list} aria-label={t('ファイルの確認')}>
              {classified.unknown.map((n) => <li key={`u-${n}`}>{t('{name}: 判別できません（取り込みの対象から外します）', { name: n })}</li>)}
              {classified.duplicates.map((d) => <li key={`d-${d.slot}`}>{t('重複: {kind} が複数あります（{names}）', { kind: slotKindLabel(d.slot), names: d.names.join('、') })}</li>)}
              {classified.missing.map((m) => <li key={`m-${m}`}>{t('不足: {path}', { path: slotPath(m) })}</li>)}
              {classified.assets.map((n) => <li key={`a-${n}`}>{t('{name}: 画像などは取り込みの対象外です', { name: n })}</li>)}
            </ul>
          ) : null}
        </>
      ) : null}

      {validation ? (
        <section className={s.card} aria-label={t('検証の結果')}>
          <Title3 as="h3">{t('検証の結果（合否）')}</Title3>
          <Text className={validation.ok ? s.ok : s.ng} weight="semibold">
            {validation.ok ? t('合格: エラー 0 件。取り込めます。') : t('不合格: エラー {n} 件。取り込めません。', { n: validation.errors.length })}
          </Text>
          <ul className={s.plain} aria-label={t('検証の結果')}>
            {validation.checks.map((k) => (
              <li key={k.id}>{k.ok ? t('合格') : t('不合格')}: {k.name} — {k.detail}{k.remedy && !k.ok ? ` ${k.remedy}` : ''}</li>
            ))}
            {shownErrors.slice(0, MAX_SHOWN).map((e, i) => <li key={`e-${i}`}>{line(e)}</li>)}
            {shownErrors.length > MAX_SHOWN ? <li>{t('ほか {n} 件', { n: shownErrors.length - MAX_SHOWN })}</li> : null}
          </ul>
          <Text>{t('無効になる項目 {n} 件', { n: validation.disabledIds.length })}</Text>
          <Text>{t('警告 {n} 件', { n: validation.warnings.length })}</Text>
          {validation.warnings.length > 0 ? <ul className={s.list}>{validation.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
          <Text size={200}>{validation.notJudged}</Text>
        </section>
      ) : null}

      {review ? (
        <section role="region" aria-label={t('取り込み前に確かめること')} className={s.card}>
          <Title3 as="h3">{t('取り込み前に確かめること')}</Title3>
          <Text>{t('次の内容を、人が確かめてから取り込みます。')}</Text>
          <ul className={s.plain}>
            <li>{t('機密区分 internal {n} 件', { n: review.classification.internal })} / {t('shareable {n} 件', { n: review.classification.shareable })}{review.classification.note ? ` ${review.classification.note}` : ''}</li>
            <li>
              {review.logo.status === 'unknown' ? t('ロゴ unknown {n} 件', { n: review.logo.unknownCount }) : t('ロゴの利用条件: 確認済み')} {review.logo.note}
              {review.logo.status === 'unknown' ? ` ${t('ロゴを確かめて差し替える')}` : ''}
            </li>
            <li>{t('人（種別「人」 {n} 件）', { n: review.people.count })}{review.people.note ? ` ${review.people.note}` : ''}</li>
          </ul>
          <Checkbox label={t('確かめました')} checked={confirmed} onChange={(_, d) => setConfirmed(d.checked === true)} />
        </section>
      ) : null}

      <RadioGroup value={mode} onChange={(_, d) => setMode(d.value as 'new' | 'replace')} aria-label={t('取り込み先')}>
        <Radio value="new" label={t('新規 Project を作成')} />
        <Radio value="replace" label={t('既存の Project の顧客パックを置き換える')} />
      </RadioGroup>
      {mode === 'new' ? (
        <div className={s.row}>
          <Field label={t('企業名')}><Input value={companyValue} onChange={(_, d) => setCompany(d.value)} /></Field>
          <Field label={t('Project 名')}><Input value={projectValue} onChange={(_, d) => setProject(d.value)} /></Field>
        </div>
      ) : (
        <Field label={t('置き換える Project')} hint={activeProjects.length === 0 ? t('置き換えられる Project がありません。先に Project を作成してください。') : undefined}>
          <Select value={targetId} onChange={(_, d) => setTargetId(d.value)} disabled={activeProjects.length === 0}>
            <option value="">{t('選んでください')}</option>
            {activeProjects.map((p) => <option key={p.id} value={p.id}>{labelOf(p.id)}</option>)}
          </Select>
        </Field>
      )}

      <div className={s.row}>
        <Button appearance="primary" disabledFocusable={!canImport} onClick={submit}>{t('取り込む')}</Button>
        {validation && !validation.ok ? <Text size={200}>{t('検証のエラーを直してファイルを選び直すと、取り込めます。')}</Text> : null}
        {validation?.ok && !confirmed ? <Text size={200}>{t('「確かめました」を選ぶと、取り込めます。')}</Text> : null}
      </div>

      {asking ? (
        <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open) setAsking(false); }}>
          <DialogSurface role="alertdialog" aria-label={t('顧客パックを置き換えますか')}>
            <DialogBody>
              <DialogTitle>{t('顧客パックを置き換えますか')}</DialogTitle>
              <DialogContent>
                {t('Project「{name}」の顧客パックを置き換えます。現在の顧客パックは失われます（元に戻せません）。', { name: labelOf(targetId) })}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setAsking(false)}>{t('やめる')}</Button>
                <Button appearance="primary" onClick={run}>{t('置き換える')}</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      ) : null}
    </section>
  );
}
