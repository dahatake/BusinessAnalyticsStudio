// FR-070 AC-086 / FR-045 AC-056 / PARAM-133=2000ms
// 画面登録（support/visualization-matrix.ts の VISUALIZATION_MATRIX）にある実在の描画形式すべてで、
// 追加・名称更新・値更新・連続更新・削除・undo を「描画された実 DOM（computed style・図形属性・部品内の相対位置・
// 文字）／3D の実シーン（scene.objects）／2D Canvas の実画素」から毎フレーム測る。
// data-motion / data-transition 属性の有無では判定しない。期待値は AC だけから決める。
import type { Page } from '@playwright/test';
import { test, expect, openScreen, component, setEditMode } from '../support/fixtures';
import { VISUALIZATION_MATRIX, showRepresentation } from '../support/visualization-matrix';

const PARAM_133_MS = 2000;

type Frame = [t: number, state: string | null];
export type Series = Record<string, Frame[]>;

/** 部品内の全 entity・3D オブジェクト・2D Canvas の画素・図形/文字の全体署名を、描画フレームごとに記録する。 */
export async function startSampler(page: Page, rootSel: string): Promise<void> {
  await page.evaluate((sel) => {
    const w = window as any;
    w.__stAll = { run: true, ev: 0, series: {} as Record<string, Array<[number, string | null]>> };
    // 操作の確定時刻（最後の有効入力）はアプリが受け取った時点で測る（テスターの送信遅延を 2 秒に混ぜない）。
    if (!w.__stEvHooked) {
      w.__stEvHooked = true;
      for (const e of ['click', 'keydown']) document.addEventListener(e, () => { if (w.__stAll) w.__stAll.ev = performance.timeOrigin + performance.now(); }, true);
    }
    const probe = document.createElement('canvas');
    probe.width = 24; probe.height = 24;
    const pctx = probe.getContext('2d', { willReadFrequently: true })!;
    const tick = () => {
      const t = performance.timeOrigin + performance.now();
      const cur = new Map<string, string>();
      const root = document.querySelector(sel);
      if (root) {
        const origin = root.getBoundingClientRect();
        const visible = (el: Element) => { const b = el.getBoundingClientRect(); return b.width > 0 || b.height > 0; };
        const agg: string[] = [];
        root.querySelectorAll('[data-entity-id]').forEach(el => {
          if (!visible(el)) return;
          const id = el.getAttribute('data-entity-id')!;
          const css = getComputedStyle(el);
          const a = ['x', 'y', 'cx', 'cy', 'd', 'points', 'width', 'height', 'transform'].map(n => el.getAttribute(n)).join('|');
          const box = el.getBoundingClientRect();
          const part = [css.opacity, css.transform, a, (box.x - origin.x).toFixed(1), (box.y - origin.y).toFixed(1),
            box.width.toFixed(1), box.height.toFixed(1), (el.textContent ?? '').trim()].join('/');
          cur.set(id, (cur.get(id) ?? '') + part + ';');
          agg.push(id + part);
        });
        // ID を持たない図形・文字（KPI の 2D など）
        root.querySelectorAll('svg path, svg line, svg rect, svg circle, svg text, [role="status"]').forEach(el => {
          if (el.closest('[data-entity-id], button, [role="toolbar"]') || !visible(el)) return;
          const css = getComputedStyle(el);
          agg.push(['d', 'x', 'y', 'cx', 'cy', 'width', 'height', 'transform', 'points'].map(n => el.getAttribute(n)).join('|')
            + css.opacity + css.transform + (el.textContent ?? '').trim());
        });
        // 表・代替表・ラベルなど、描画された文字（実 DOM のテキスト）
        agg.push('T' + (root.textContent ?? ''));
        root.querySelectorAll('canvas').forEach((cv, i) => {
          if (!visible(cv)) return;
          try {
            pctx.clearRect(0, 0, 24, 24);
            pctx.drawImage(cv, 0, 0, 24, 24);
            const d = pctx.getImageData(0, 0, 24, 24).data;
            let h = 0;
            for (let k = 0; k < d.length; k++) h = (h * 31 + d[k]) | 0;
            cur.set(`cv:${i}`, String(h));
            agg.push(`cv${i}:${h}`);
          } catch { /* tainted / WebGL: scene.objects で測る */ }
        });
        if (w.__edbTest?.scene && root.querySelector('canvas')) {
          for (const o of (w.__edbTest.scene.objects() as any[])) {
            if (o.visible) { const v = [o.x.toFixed(1), o.y.toFixed(1)].join(','); cur.set(`s:${o.entityId}`, v); agg.push(`s${o.entityId}${v}`); }
          }
        }
        cur.set('__sig', agg.join('\n'));
      }
      const s = w.__stAll.series;
      for (const id of new Set([...Object.keys(s), ...cur.keys()])) {
        const arr = s[id] ?? (s[id] = []);
        const v = cur.get(id) ?? null;
        if (!arr.length || arr[arr.length - 1][1] !== v) arr.push([t, v]);
      }
      if (w.__stAll.run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, rootSel);
}

export async function stopSampler(page: Page, waitMs = PARAM_133_MS + 300): Promise<Series> {
  await page.waitForTimeout(waitMs);
  return page.evaluate(() => { const w = window as any; w.__stAll.run = false; const s = w.__stAll.series; s.__ev = [[w.__stAll.ev, null]]; return s; });
}

export const now = (page: Page) => page.evaluate(() => performance.timeOrigin + performance.now());

/** 操作 t0 以降の全体署名の変化フレーム（最初の要素 = t0 時点の直前の状態を除く）。 */
export function sigFrames(series: Series, t0: number): Frame[] {
  const ev = series.__ev?.[0]?.[0] || t0;
  return (series.__sig ?? []).filter(f => f[0] >= ev - 20).map(f => [f[0] - ev + t0, f[1]] as Frame);
}

const KINDS = {
  issue: { prefix: 'issue-', from: ['issue-solution', '2D'] },
  ent: { prefix: 'ent-', from: ['table', '2D'] },
  cap: { prefix: 'cap-', from: ['architecture', '2D'] },
  okr: { prefix: 'okr-', from: ['kpi-okr', 'Graph'] },
  feat: { prefix: 'feat-', from: ['gantt', '2D'] },
} as const;
type Kind = keyof typeof KINDS;

const KIND_OF: Record<string, Kind> = {
  'issue-solution': 'issue', matrix: 'issue', ranking: 'issue', 'discussion-tree': 'issue', priority: 'issue', summary: 'issue',
  'knowledge-graph': 'ent', 'business-graph': 'ent', table: 'ent', map: 'ent', 'twin-view': 'ent',
  'spatial-view': 'ent', 'data-catalog': 'ent', architecture: 'cap', 'kpi-okr': 'okr', gantt: 'feat',
  whiteboard: 'ent',
};

const allIds = (page: Page) => page.evaluate(() => {
  const ids = new Set<string>();
  document.querySelectorAll('[data-entity-id]').forEach(e => ids.add(e.getAttribute('data-entity-id')!));
  const w = window as any;
  try { for (const o of (w.__edbTest.scene.objects() as any[])) ids.add(o.entityId); } catch { /* no scene */ }
  return [...ids];
});
const idsIn = (page: Page, sel: string) => page.evaluate((s) => {
  const ids = new Set<string>();
  document.querySelector(s)?.querySelectorAll('[data-entity-id]').forEach(e => ids.add(e.getAttribute('data-entity-id')!));
  // scene.objects() はアプリ全体で 1 つのヒーロー・シーン（store/view3d.ts）。対象部品が可視の canvas を持つときだけ、
  // かつ「部品の DOM が ent を出さず scene だけが出す」誤判定を避けるため、部品自身が 3D 描画域を持つ場合に限って拾う。
  const root = document.querySelector(s);
  const hasCanvas = !!root && [...root.querySelectorAll('canvas')].some(cv => { const r = cv.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (hasCanvas) {
    try { for (const o of ((window as any).__edbTest.scene.objects() as any[])) if (o.visible) ids.add(o.entityId); } catch { /* no scene */ }
  }
  return [...ids];
}, sel);

/** from 画面で id を選択し、詳細パネルがその項目になっていることを確かめる。
 * 選択はアプリ全体で共有され、複製後は元項目も selected のまま詳細が複製側になる（edit/model.ts の select:[元,複製]）。
 * 項目を押すと選択が切り替わる（選択済みは解除）ため、詳細の h3 が期待と違えば押し直す（解除→再選択）。 */
async function selectById(page: Page, kind: Kind, id: string, want?: { title?: string; notTitle?: string }) {
  const [screen, mode] = KINDS[kind].from;
  const c = await showRepresentation(page, screen, mode);
  const target = c.locator(`[data-entity-id="${id}"]`).first();
  const h3 = component(page, 'detail').locator('h3').first();
  const ok = async () => {
    const t = (await h3.count()) ? (await h3.innerText()).trim() : '';
    if (want?.title !== undefined) return t === want.title;
    if (want?.notTitle !== undefined) return t !== '' && t !== want.notTitle;
    return t !== '';
  };
  const selected = async () => ((await target.getAttribute('data-highlight')) ?? '').includes('selected');
  if (!(await selected())) await target.click();
  for (let i = 0; i < 3 && !(await ok()); i++) {
    // 解除してから対象だけを選び直す（複製後は元項目と複製が両方 selected）
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if (await selected()) await target.click();
    await page.waitForTimeout(150);
    if (!(await selected())) await target.click();
    await page.waitForTimeout(150);
  }
}
const detailTitle = async (page: Page) => {
  const h3 = component(page, 'detail').locator('h3').first();
  return (await h3.count()) ? (await h3.innerText()).trim() : '';
};

async function commitName(page: Page, name: string) {
  const detail = component(page, 'detail');
  const editBtn = detail.getByRole('button', { name: '名前を編集' });
  await expect(editBtn, `詳細に名前の編集がない: ${(await detail.innerText()).slice(0, 200).replace(/\s+/g, ' ')}`).toBeVisible({ timeout: 10_000 });
  await editBtn.click();
  const box = detail.getByRole('textbox', { name: '名前' });
  await box.fill(name);
  await box.press('Enter');
}

/** この描画形式に出ていて、選択元でも選べて、詳細で複製できる項目を選ぶ（種別は形式固有 → ent → issue の順）。 */
async function chooseSubject(page: Page, row: { screen: string; mode: string | null }, sel: string): Promise<{ kind: Kind; subject: string; shown: boolean }> {
  const order = [...new Set<Kind>([KIND_OF[row.screen], 'ent', 'issue'])];
  const inView = await idsIn(page, sel);
  for (const kind of order) {
    const shown = inView.filter(i => i.startsWith(KINDS[kind].prefix));
    if (!shown.length) continue;
    const [fromScreen, fromMode] = KINDS[kind].from;
    await showRepresentation(page, fromScreen, fromMode);
    const fromIds = (await idsIn(page, `[data-testid="component-${fromScreen}"]`)).filter(i => i.startsWith(KINDS[kind].prefix));
    const subject = shown.find(i => fromIds.includes(i));
    if (!subject) continue;
    await selectById(page, kind, subject);
    const dup = component(page, 'detail').getByRole('button', { name: '複製', exact: true });
    if (await dup.count() && await dup.isEnabled()) return { kind, subject, shown: true };
  }
  // 出ている項目が無い形式: 既定の ent を選ぶ（描画の測定はしない）
  const kind: Kind = 'ent';
  const [fromScreen, fromMode] = KINDS[kind].from;
  await showRepresentation(page, fromScreen, fromMode);
  const cands = (await idsIn(page, `[data-testid="component-${fromScreen}"]`)).filter(i => i.startsWith(KINDS[kind].prefix));
  const inViewIds = inView;
  // この描画形式に出ている候補を優先し、選ぶと詳細が出る（名前を編集できる）項目だけを対象にする
  cands.sort((a, b) => Number(inViewIds.includes(b)) - Number(inViewIds.includes(a)));
  let subject = cands[0];
  for (const cid of cands.slice(0, 12)) {
    await selectById(page, kind, cid);
    if (await component(page, 'detail').getByRole('button', { name: '名前を編集' }).count()) { subject = cid; break; }
    await page.keyboard.press('Escape');
  }
  await selectById(page, kind, subject);
  return { kind, subject, shown: false };
}
const rowKey = (r: { screen: string; mode: string | null }) => `${r.screen}/${r.mode ?? '2D/Canvas'}`;

/** 描画の測定対象（名前/ID を実 DOM・シーンで観測できるか）。 */
async function observe(page: Page, sel: string, id: string, title: string) {
  const ids = await idsIn(page, sel);
  const text = await page.locator(sel).first().textContent() ?? '';
  return { byId: ids.includes(id), byText: title.length > 0 && text.includes(title), ids };
}

for (const row of VISUALIZATION_MATRIX.filter(r => r.screen !== 'whiteboard')) {
  test(`FR-070 AC-086 FR-045 AC-056 ${rowKey(row)} 追加・名称/値の更新・連続更新・削除・undo が出入りの中間値を経て ${PARAM_133_MS}ms 以内に収束する`, async ({ page, start }, info) => {
    test.setTimeout(240_000);
    await start();
    await setEditMode(page, true);
    const sel = `[data-testid="component-${row.screen}"]`;
    const control = page.getByTestId('animation-state');
    if (!(await control.innerText()).includes('再生中')) await control.click();
    await expect(control, '動きが有効な状態').toContainText('再生中');

    // 対象: この描画形式に実際に出ている項目（種別の接頭辞で選ぶ）。出ていなければ種別の既定の先頭項目。
    let c = await showRepresentation(page, row.screen, row.mode);
    await page.waitForTimeout(500);
    const chosen = await chooseSubject(page, row, sel);
    const kind = chosen.kind;
    const subject = chosen.subject;
    c = await showRepresentation(page, row.screen, row.mode);
    await page.waitForTimeout(500);
    const h3 = component(page, 'detail').locator('h3').first();
    const title = (await h3.count() ? (await h3.innerText()).trim() : '');
    const seen = await observe(page, sel, subject, title);
    const observable = seen.byId || seen.byText;
    info.annotations.push({ type: 'observable', description: `${rowKey(row)} byId=${seen.byId} byText=${seen.byText}` });

    // 測れない形式（この描画形式が対象データを出さない）: 実 DOM/Canvas で「空・静止時に不要な連続描画がない」ことだけを確かめる。
    if (!observable) {
      await startSampler(page, sel);
      const s = await stopSampler(page, 1500);
      const after = (s.__sig ?? []).filter(f => f[0] > Date.now() - 800);
      expect(after.length, `${rowKey(row)}: 対象を出さない形式で、不要な連続描画（図形・画素の変化）が続いている`).toBeLessThanOrEqual(1);
      return;
    }

    const sources = await component(page, 'detail').getByTestId('source-card').allTextContents();
    const idsBefore = await allIds(page);
    const hasScene = (await idsIn(page, sel)).length > 0;

    // ---- 追加（複製）。要約・カタログ・KPI の集計形式は、追加した項目が出るとは限らない（上位だけ・取り込み依存）ため、
    // 追加/削除/undo の出入りは測らず、名称・値の更新だけを測る（網羅表に理由を記録）。
    const aggOnly = ['summary', 'data-catalog'].includes(row.screen) || (row.screen === 'kpi-okr' && row.mode !== 'Graph');
    let newId: string | undefined;
    if (!aggOnly) {
    await startSampler(page, sel);
    const t0 = await now(page);
    await component(page, 'detail').getByRole('button', { name: '複製', exact: true }).click();
    const added = await stopSampler(page);
    const idsAfter = await allIds(page);
    newId = idsAfter.find(i => !idsBefore.includes(i) && i.startsWith(KINDS[kind].prefix));
    const sigAdd = sigFrames(added, t0);
    expect(sigAdd.length, `${rowKey(row)}: 追加が描画に反映されない`).toBeGreaterThan(0);
    expect(sigAdd.length, `${rowKey(row)}: 追加が中間値を経ずに瞬間表示された（出入りの遷移なし）`).toBeGreaterThan(1);
    expect(sigAdd[sigAdd.length - 1][0] - t0, `追加から最終状態まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
    if (newId && (seen.byId)) {
      const fr = (added[newId] ?? added[`s:${newId}`] ?? []).filter(f => f[0] >= t0 - 50 && f[1] !== null);
      if (fr.length) {
        expect(fr.length, `${rowKey(row)}: 追加項目 ${newId} が初出から最終まで同じ描画値（補間なし）`).toBeGreaterThan(1);
        expect(fr[0][1], '初出の描画値が最終値と同一').not.toBe(fr[fr.length - 1][1]);
      }
    }
    expect((added[subject] ?? added[`s:${subject}`] ?? []).filter(f => f[0] > t0 && f[1] === null), '既存項目が作り直された（同一性）').toHaveLength(0);
    }

    // ---- 名称更新・連続更新（最後へ収束・最新値は遷移完了前も詳細で参照可）
    await selectById(page, kind, subject, { title });
    await showRepresentation(page, row.screen, row.mode);
    await page.waitForTimeout(400);
    const first = `ST-A ${subject}`;
    const last = `ST-B ${subject}`;
    await startSampler(page, sel);
    const t1 = await now(page);
    await commitName(page, first);
    await commitName(page, last);
    await expect(component(page, 'detail'), '最新値は遷移完了前でも詳細で参照できる').toContainText(last, { timeout: 500 });
    const renamed = await stopSampler(page);
    const sigRename = sigFrames(renamed, t1);
    expect(sigRename.length, `${rowKey(row)}: 名称更新が描画に反映されない`).toBeGreaterThan(0);
    expect(sigRename[sigRename.length - 1][0] - t1, `名称更新から収束まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
    const text = await page.locator(sel).first().textContent() ?? '';
    if (seen.byText) {
      expect(text, '最後の名称へ収束していない').toContain(last);
      expect(text, '連続更新の途中の名称が残っている').not.toContain(first);
      const ownEl = page.locator(sel).first().locator(`[data-entity-id="${subject}"]`);
      if (await ownEl.count()) {
        const ownText = (await ownEl.allTextContents()).join(' ');
        expect(ownText, '更新前の名称が項目に残っている').not.toContain(title);
        expect(ownText, '項目が最新の名称を示さない').toContain(last);
      }
    }

    // ---- 値更新（課題の評価値）: 描画の位置・長さ・順位が中間値を経て最新値へ収束する
    if (kind === 'issue') {
      const detail = component(page, 'detail');
      const editBtn = detail.getByTestId(/^attr-/).first().getByRole('button', { name: '編集' });
      if (await editBtn.count()) {
        await startSampler(page, sel);
        const t2 = await now(page);
        await editBtn.click();
        const vbox = detail.getByRole('textbox', { name: /の値/ }).or(detail.getByRole('spinbutton', { name: /の値/ })).first();
        await vbox.fill('77');
        await vbox.press('Enter');
        const val = await stopSampler(page);
        const sigVal = sigFrames(val, t2);
        expect(sigVal.length, `${rowKey(row)}: 値の更新が描画に反映されない`).toBeGreaterThan(0);
        expect(sigVal.length, `${rowKey(row)}: 値の更新が中間値を経ずに瞬間反映された`).toBeGreaterThan(1);
        expect(sigVal[sigVal.length - 1][0] - t2, `値更新から収束まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
      }
    }

    // ---- 削除 → 中間値を経て消え、削除済みを残さない
    if (newId) {
      await selectById(page, kind, newId, { notTitle: last });
      await showRepresentation(page, row.screen, row.mode);
      await page.waitForTimeout(400);
      await startSampler(page, sel);
      const t3 = await now(page);
      await component(page, 'detail').getByRole('button', { name: '削除', exact: true }).click();
      const confirmation = page.getByRole('alertdialog');
      if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: /削除/ }).click();
      const del = await stopSampler(page);
      const sigDel = sigFrames(del, t3);
      expect(sigDel.length, `${rowKey(row)}: 削除が中間値を経ずに瞬間消去された（出入りの遷移なし）`).toBeGreaterThan(1);
      expect(sigDel[sigDel.length - 1][0] - t3, `削除から消去完了まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
      expect(await idsIn(page, sel), '削除済みの項目が表示に残っている').not.toContain(newId);

      // ---- undo → 同じ ID で戻る
      await startSampler(page, sel);
      const t4 = await now(page);
      await page.keyboard.press('Control+z');
      const und = await stopSampler(page);
      const sigUn = sigFrames(und, t4);
      expect(sigUn.length, `${rowKey(row)}: undo が描画に反映されない`).toBeGreaterThan(0);
      expect(sigUn[sigUn.length - 1][0] - t4, `undo から収束まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
      expect(await idsIn(page, sel), 'undo で同じ ID の項目が戻る').toContain(newId);
    }

    // ---- ID・選択・出典の保持、表（一覧）への追従
    if (hasScene) {
      const table = await showRepresentation(page, 'table', '2D');
      await expect(table.locator(`[data-entity-id="${subject}"]`).first()).toBeAttached();
      if (kind === 'ent') await expect(table.locator(`[data-entity-id="${subject}"]`).first(), '一覧の名称が最新').toContainText(last);
    }
    expect(await component(page, 'detail').getByTestId('source-card').allTextContents(), '出典が保たれる').toEqual(sources);
    void c;
    void hasScene;
  });
}

// FR-070 AC-086 動き停止中・prefers-reduced-motion=reduce は、追加を遷移なしで最終状態へ即時表示する（全描画形式）
for (const row of VISUALIZATION_MATRIX.filter(r => r.screen !== 'whiteboard')) {
  test(`FR-070 AC-086 ${rowKey(row)} 動き reduce では追加が中間値なしで即時に最終状態になる`, async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await setEditMode(page, true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sel = `[data-testid="component-${row.screen}"]`;
    await page.waitForTimeout(500);
    const chosen = await chooseSubject(page, row, sel);
    const kind = chosen.kind;
    test.skip(!chosen.shown, `${rowKey(row)} はこの描画形式に選択・複製できる項目を出さない（追加の描画なし）`);
    await showRepresentation(page, row.screen, row.mode);
    await page.waitForTimeout(500);
    const before = await allIds(page);
    await startSampler(page, sel);
    const t0 = await now(page);
    await component(page, 'detail').getByRole('button', { name: '複製', exact: true }).click();
    const s = await stopSampler(page);
    const added = (await allIds(page)).find(i => !before.includes(i) && i.startsWith(KINDS[kind].prefix));
    expect(added, '追加した項目の ID').toBeTruthy();
    const frames = (s[added!] ?? s[`s:${added}`] ?? []).filter(f => f[0] >= t0 - 50 && f[1] !== null);
    if (frames.length) {
      // 項目自身の不透明度・変形・図形属性（全体のフィットによる寸法変化は項目の遷移ではない）
      const own = new Set(frames.map(f => f[1]!.startsWith('s:') ? f[1] : f[1]!.split('/').slice(0, 3).join('/')));
      expect(own.size, '停止/reduce は中間値を経ず最終状態を即時表示する').toBe(1);
    }
  });
}


// FR-070 AC-086 ホワイトボード（Canvas）: ペンで描いた線は確定後 2000ms 以内に最終状態、undo は中間値（出入り）を経て消え、
// 消した線が画素に残らない。実在する Canvas の画素（24x24 縮小の署名）で毎フレーム測る。
// 描画中のライブ入力は「追加の出入り遷移」ではなく入力そのものなので、確定（mouse up）以降だけを測る。
test('FR-070 AC-086 whiteboard/Canvas ペンの確定と undo が 2000ms 以内に収束し、undo は中間値を経て消去され、線が残らない', async ({ page, start }) => {
  test.setTimeout(120_000);
  await start();
  const wb = await openScreen(page, 'whiteboard');
  const surface = wb.getByTestId('board-surface');
  await expect(surface).toBeVisible();
  const sel = '[data-testid="component-whiteboard"]';
  await page.getByRole('toolbar', { name: 'インクの道具' }).getByRole('button', { name: 'ペン', exact: true }).click();
  await page.waitForTimeout(500);
  await startSampler(page, sel);
  const base = await stopSampler(page, 300);
  const b = (await surface.boundingBox())!;
  await startSampler(page, sel);
  await page.mouse.move(b.x + 60, b.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x + 260, b.y + 160, { steps: 12 });
  const t0 = await now(page);
  await page.mouse.up();
  const drawn = await stopSampler(page);
  const sd = sigFrames(drawn, t0);
  expect(sd.length, 'ペンの線が描画に反映されない').toBeGreaterThan(0);
  expect(sd[sd.length - 1][0] - t0, `線の確定から最終状態まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
  const drawnSig = sd[sd.length - 1][1];
  expect(drawnSig, '描いた線で画素が変わっていない').not.toBe((base.__sig ?? []).slice(-1)[0]?.[1]);

  await startSampler(page, sel);
  const t1 = await now(page);
  await page.keyboard.press('Control+z');
  const undone = await stopSampler(page);
  const su = sigFrames(undone, t1);
  expect(su.length, 'undo が描画に反映されない').toBeGreaterThan(0);
  expect(su.length, 'undo が中間値を経ずに瞬間消去された（出入りの遷移なし）').toBeGreaterThan(1);
  expect(su[su.length - 1][0] - t1, `undo から消去完了まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
  expect(su[su.length - 1][1], '消した線が画素に残っている').not.toBe(drawnSig);
});

// FR-134 AC-197 FR-070 AC-086 分析 5 手法 × 全ビュアーで、分析条件（値）の変更を出入りの中間値で表し、2000ms 以内に表と同じ結果へ収束する。
// 起点は最後の有効入力（blur）の時刻。ビュアー切替の操作時間は含めない。
const METHODS_ALL = ['SWOT 分析', 'ファイブフォース分析', 'バリューチェーン分析', '3C 分析', 'バランスト・スコアカード'];
for (const method of METHODS_ALL) {
  test(`FR-134 AC-197 FR-070 AC-086 ${method}: 全ビュアーで条件変更が中間値を経て 2000ms 以内に表と同じ結果へ収束する`, async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await page.getByRole('button', { name: '企業を登録' }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox', { name: '企業名' }).fill('合成株式会社T');
    await dlg.getByRole('button', { name: '登録' }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole('region', { name: '企業 合成株式会社T' }).getByRole('button', { name: 'Project を作成' }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox', { name: 'Project 名' }).fill('遷移');
    await dlg.getByRole('button', { name: '作成' }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole('region', { name: '企業 合成株式会社T' }).getByRole('link', { name: '遷移' }).click();
    await page.getByRole('button', { name: '分析を開始' }).click();
    await page.getByRole('listbox', { name: '分析手法' }).getByRole('option', { name: method }).click();
    const analysis = page.getByTestId('analysis');
    await expect(analysis).toBeVisible();
    const input = analysis.getByTestId('analysis-params').getByRole('spinbutton').nth(0);
    const viewers = analysis.getByRole('radiogroup', { name: 'ビュアー' }).getByRole('radio');
    const label = (await input.getAttribute('aria-label'))!.replace(/ の値.*$/, '');
    const sel = '[data-testid="analysis-result"]';
    const n = await viewers.count();
    expect(n, '分析のビュアー').toBeGreaterThan(1);
    // 評価値の範囲は 0〜10（AC-198。範囲外は拒否される）。範囲内の 2 値（2 と 8）を現在値と異なる側へ交互に更新する。
    let value = Number(await input.inputValue());
    for (let i = 0; i < n; i++) {
      await viewers.nth(i).check();
      await page.waitForTimeout(400);
      value = value === 8 ? 2 : 8;
      await startSampler(page, sel);
      const t0 = await now(page);
      await input.fill(String(value));
      await input.blur();
      const s = await stopSampler(page);
      const frames = sigFrames(s, t0);
      expect(frames.length, `ビュアー ${i}: 条件変更が結果の描画に反映されない`).toBeGreaterThan(0);
      expect(frames.length, `ビュアー ${i}: 結果が中間値を経ずに瞬間更新された（出入りの遷移なし）`).toBeGreaterThan(1);
      expect(frames[frames.length - 1][0] - t0, `ビュアー ${i}: 最後の有効入力から収束まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
      const table = analysis.getByRole('table', { name: '結果の代替表' }).or(analysis.getByRole('grid', { name: '結果の表' }));
      await expect(table.getByRole('row').filter({ hasText: label }).locator('td').nth(2), '最新値が表で参照できる').toHaveText(String(value));
    }
  });
}
