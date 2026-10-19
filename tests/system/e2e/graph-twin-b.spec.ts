// System Test: ビジネス関係グラフ（FR-236）・Twin ビュー（FR-239）・空間ビュー（FR-240）
// 期待値は要求定義書の受入基準（docs/requirements/graph-twin.md の AC-549・AC-554・AC-566・AC-568・AC-571・AC-572）と、
// お手本パック（koto／mono）とその変種の内容から決める。実装のコードは読んでいない。
//
// テスト側が前提にする画面の探し方（統合した契約は CONTRACT.md の「グラフ・Twin・空間・意味的ズーム」節。以下はこの spec が使う部分）:
//  - 画面は左メニュー（navigation「画面」）の `nav-<key>` のうち、文字が「ビジネス関係グラフ」「Twin ビュー」「空間ビュー」のもの（key は問わない）。
//  - グラフ: ノード `[data-testid="graph-node"][data-entity-id]` は属性 data-node-type（種別）・data-shape（形またはアイコンの名前）を持ち、種別名を文字でも含む。
//    エッジ `[data-testid="graph-edge"]` は data-from・data-to・data-meaning（意味の種類）・data-direction="forward"（矢印）を持ち、意味ラベルの文字を含む。
//    絞り込みは group「種別」「意味の種類」内の checkbox（属性 data-filter-value に値）。
//  - Twin: 流れ `[data-testid="twin-flow"]` は data-flow-kind="data|control"・data-from・data-to・data-line-style を持ち、文字「Data」または「Control」と件数を含む。
//    層 `[data-testid="twin-layer-<operations|experience|insights|none>"]`。注記 text「表示のみ（実機へは送信しません）」と「パックの値（リアルタイムではありません）」。
//  - 空間: ズーム階層の表示 `[data-testid="zoom-level"]`（data-depth = 0..4）、button「拡大」。項目 `[data-entity-id]` は data-kind（site|floor|room）を持つ。
//    3D のフロアは data-floor-state="selected|dimmed"、カメラは t.scene.camera() の projection==='orthographic'（等角投影）。
//  - パックの任意項目は FR-241 の名前: entities[].layer、flows[]（from・to・kind=data|control・label）、空間は entities[].kind=floor|room の parentId 階層。
import type { Page, Locator } from '@playwright/test';
import { test, expect, component, hook, entity, scene } from '../support/fixtures';
import { examplePack, makeVariant, type Pack } from '../support/packs';
import { chooseView, type ViewState } from '../support/screens';

const koto = examplePack('koto');

/** 左メニューの文字から画面を開く（key は実装に依存しない） */
async function openByName(page: Page, name: string): Promise<{ key: string; c: Locator }> {
  const nav = page.getByRole('navigation', { name: '画面', exact: true });
  const item = nav.locator('[data-testid^="nav-"]').filter({ hasText: name }).first();
  if (!(await item.isVisible())) await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await expect(item, `左メニューに「${name}」がない`).toBeVisible();
  const key = ((await item.getAttribute('data-testid')) ?? '').replace(/^nav-/, '');
  await item.click();
  const c = component(page, key);
  await expect(c, `画面「${name}」が開かない`).toBeVisible();
  return { key, c };
}
const viewState = (page: Page, key: string) => hook<ViewState>(page, 't.view.state(a)', key);

/** koto を基にした変種: Data の流れに加え Control の流れ 1 本と、デジタル世界の層（1 件は層なし）を持つ */
function twinPack(): Pack {
  return makeVariant('koto', 'gt-twin', (p) => {
    p.edit('entities', (j) => {
      const digital = j.entities.filter((e: any) => e.world === 'digital');
      const layers = ['operations', 'experience', 'insights'];
      digital.forEach((e: any, i: number) => { if (i < digital.length - 1) e.layer = layers[i % 3]; });
      const real = j.entities.find((e: any) => e.world === 'real' && j.twins.some((t: any) => t.realId === e.id));
      const dig = j.twins.find((t: any) => t.realId === real.id).digitalId;
      j.flows = j.flows ?? [];
      j.flows.push({ id: 'flow-gt-data', createdBy: 'test', from: real.id, to: dig, label: '計測値', kind: 'data', sourceIds: real.sourceIds });
      j.flows.push({ id: 'flow-gt-control', createdBy: 'test', from: dig, to: real.id, label: '稼働指示', kind: 'control', sourceIds: real.sourceIds });
    });
  });
}

/** mono を基にした変種: 拠点→フロア 2 つ→部屋、KPI の定義と値（部屋 1 つは値なし） */
function spatialPack(): Pack {
  return makeVariant('mono', 'gt-space', (p) => {
    p.edit('entities', (j) => {
      const site = j.entities.find((e: any) => e.type === 'site');
      const mk = (id: string, name: string, kind: string, parentId: string) => ({ id, createdBy: 'test', type: 'site', name, parentId, world: 'real', kind, sourceIds: site.sourceIds });
      j.entities.push(
        mk('ent-gt-f1', '1 階', 'floor', site.id), mk('ent-gt-f2', '2 階', 'floor', site.id),
        mk('ent-gt-r1', '会議室 A', 'room', 'ent-gt-f1'), mk('ent-gt-r2', '会議室 B', 'room', 'ent-gt-f1'), mk('ent-gt-r3', '執務室', 'room', 'ent-gt-f2'),
      );
    });
  });
}

test.describe('FR-236 ビジネス関係グラフ', () => {
  // FR-236 AC-549
  test('FR-236 AC-549 お手本パックでグラフを開くと、すべてのエッジに向きの矢印と意味ラベルがあり、ノードは形/アイコンと種別の文字で区別される（異常系: 意味ラベルなしの関係は線だけで、矢印と文字を要求されない）', async ({ page, start }) => {
    await start({ pack: 'koto' });
    const { c } = await openByName(page, 'ビジネス関係グラフ');
    const nodes = c.locator('[data-testid="graph-node"]');
    const edges = c.locator('[data-testid="graph-edge"]');
    await expect(nodes.first()).toBeVisible();
    expect(await edges.count(), 'エッジが 1 本もない').toBeGreaterThan(0);
    for (const e of await edges.all()) {
      await expect(e, 'エッジに向きの矢印がない').toHaveAttribute('data-direction', 'forward');
      await expect(e, 'エッジに意味ラベルの文字がない').toHaveText(/\S/);
    }
    const types = new Set<string>();
    for (const n of await nodes.all()) {
      const shape = await n.getAttribute('data-shape');
      expect(shape, '種別が形・アイコンで区別されていない（色だけに頼る）').toBeTruthy();
      expect((await n.innerText()).trim().length, 'ノードに種別の文字がない').toBeGreaterThan(0);
      types.add(`${await n.getAttribute('data-node-type')}|${shape}`);
    }
    // 種別が違えば形・アイコンも違う
    const byType = new Map<string, Set<string>>();
    for (const t of types) { const [ty, sh] = t.split('|'); byType.set(ty, (byType.get(ty) ?? new Set()).add(sh)); }
    const shapes = [...byType.values()].map((s) => [...s][0]);
    expect(new Set(shapes).size, '異なる種別が同じ形・アイコンで描かれている').toBe(byType.size);
  });

  // FR-236 AC-554
  test('FR-236 AC-554 ノードを選ぶと他の画面でも選択され、種別・意味の絞り込みで外した項目が消え、世界の表示でも対象が絞られ選択は保たれる', async ({ page, start }) => {
    await start({ pack: 'koto' });
    const { c } = await openByName(page, 'ビジネス関係グラフ');
    const nodes = c.locator('[data-testid="graph-node"]');
    await expect(nodes.first()).toBeVisible();
    const id = (await nodes.first().getAttribute('data-entity-id'))!;
    await nodes.first().click();
    // 他の画面（一覧表）でも同じ項目が選択されている
    await page.getByRole('navigation', { name: '画面', exact: true }).locator('[data-testid="nav-table"]').click().catch(async () => {
      await page.getByRole('button', { name: 'メニュー', exact: true }).click();
      await page.getByTestId('nav-table').click();
    });
    await expect(entity(component(page, 'table'), id).first()).toHaveAttribute('data-highlight', /selected/);
    await openByName(page, 'ビジネス関係グラフ');
    // 種別の絞り込み: 選択中でない種別を 1 つ外すと、その種別のノードとそのノードにつながるエッジが消える
    const typeBox = c.getByRole('group', { name: '種別' }).getByRole('checkbox');
    const selType = await nodes.first().getAttribute('data-node-type');
    let removed: string | null = null;
    for (const b of await typeBox.all()) {
      const v = await b.getAttribute('data-filter-value');
      if (v && v !== selType) { await b.uncheck(); removed = v; break; }
    }
    expect(removed, '外せる種別がない（お手本パックの種別が 1 つだけ）').toBeTruthy();
    await expect(c.locator(`[data-testid="graph-node"][data-node-type="${removed}"]`)).toHaveCount(0);
    const ids = await nodes.evaluateAll((els) => els.map((e) => e.getAttribute('data-entity-id')));
    for (const e of await c.locator('[data-testid="graph-edge"]').all()) {
      expect(ids, 'エッジの両端のノードが消えているのにエッジが残る').toContain(await e.getAttribute('data-from'));
      expect(ids).toContain(await e.getAttribute('data-to'));
    }
    // 意味の種類の絞り込み
    const meaningBox = c.getByRole('group', { name: '意味の種類' }).getByRole('checkbox').first();
    const m = await meaningBox.getAttribute('data-filter-value');
    await meaningBox.uncheck();
    await expect(c.locator(`[data-testid="graph-edge"][data-meaning="${m}"]`)).toHaveCount(0);
    // 世界の表示（FR-218）の切替で対象が絞られ、選択は保たれる
    await chooseView(page, c, '現実世界');
    const st = await viewState(page, (await openByName(page, 'ビジネス関係グラフ')).key);
    const real = new Set(koto.entities().filter((e) => e.world === 'real').map((e) => e.id));
    for (const i of st.itemIds) expect(real.has(i), `現実世界の表示にデジタル世界の項目 ${i} が残る`).toBe(true);
    expect(st.selectedIds, '世界の表示の切替で選択が失われた').toContain(id);
  });
});

test.describe('FR-239 Twin ビュー', () => {
  // FR-239 AC-566
  test('FR-239 AC-566 Twin ビューに現実世界・三つの層・層なし枠と、向き・線種・文字（Data／Control）で区別された流れが出る（異常系: 層を持たない項目は消えず「層なし」に出る）', async ({ page, start }) => {
    const pack = twinPack();
    await start({ pack });
    const { c } = await openByName(page, 'Twin ビュー');
    for (const l of ['operations', 'experience', 'insights']) await expect(c.getByTestId(`twin-layer-${l}`), `層 ${l} がない`).toBeVisible();
    const ents = pack.entities();
    for (const e of ents.filter((x) => x.world === 'real')) await expect(entity(c, e.id).first(), `現実世界の項目 ${e.name} がない`).toBeVisible();
    const noLayer = ents.filter((x) => x.world === 'digital' && !x.layer);
    expect(noLayer.length).toBeGreaterThan(0);
    for (const e of noLayer) await expect(c.getByTestId('twin-layer-none').locator(`[data-entity-id="${e.id}"]`)).toBeVisible();
    const data = c.locator('[data-testid="twin-flow"][data-flow-kind="data"]');
    const ctrl = c.locator('[data-testid="twin-flow"][data-flow-kind="control"]');
    expect(await data.count(), 'Data の流れがない').toBeGreaterThan(0);
    expect(await ctrl.count(), 'Control の流れがない').toBeGreaterThan(0);
    await expect(data.first()).toContainText('Data');
    await expect(ctrl.first()).toContainText('Control');
    // 向き: Data は現実世界→デジタル世界、Control は逆。線種は異なる
    const worldOf = (id: string | null) => ents.find((e) => e.id === id)?.world;
    for (const f of await data.all()) { expect(worldOf(await f.getAttribute('data-from'))).toBe('real'); expect(worldOf(await f.getAttribute('data-to'))).toBe('digital'); }
    for (const f of await ctrl.all()) { expect(worldOf(await f.getAttribute('data-from'))).toBe('digital'); expect(worldOf(await f.getAttribute('data-to'))).toBe('real'); }
    expect(await data.first().getAttribute('data-line-style'), '線種が Data と Control で同じ').not.toBe(await ctrl.first().getAttribute('data-line-style'));
  });

  // FR-239 AC-568
  test('FR-239 AC-568 現実世界の設備を選ぶと、ツイン関係と流れで結ばれたデジタル世界の項目と流れが Twin ビューと他の画面で強調される（異常系: 結ばれていない項目は強調されない）', async ({ page, start }) => {
    const pack = twinPack();
    await start({ pack });
    const j = pack.json('entities');
    const realId: string = j.flows.find((f: any) => f.id === 'flow-gt-data').from;
    const linked = new Set<string>([
      ...j.twins.filter((t: any) => t.realId === realId).map((t: any) => t.digitalId),
      ...j.flows.filter((f: any) => f.from === realId).map((f: any) => f.to),
      ...j.flows.filter((f: any) => f.to === realId).map((f: any) => f.from),
    ]);
    const unlinked = pack.entities().find((e) => e.world === 'digital' && !linked.has(e.id));
    const { c } = await openByName(page, 'Twin ビュー');
    await entity(c, realId).first().click();
    for (const d of linked) await expect(entity(c, d).first(), `結ばれた ${d} が強調されない`).toHaveAttribute('data-highlight', /selected|related/);
    if (unlinked) await expect(entity(c, unlinked.id).first()).not.toHaveAttribute('data-highlight', /selected|related/);
    for (const f of await c.locator('[data-testid="twin-flow"]').all()) {
      const touches = [await f.getAttribute('data-from'), await f.getAttribute('data-to')].includes(realId);
      if (touches) await expect(f, '選択項目の流れが強調されない').toHaveAttribute('data-highlight', /related|selected/);
    }
    // 他の画面（一覧表）
    await page.getByRole('button', { name: 'メニュー', exact: true }).click().catch(() => {});
    await page.getByTestId('nav-table').click();
    const table = component(page, 'table');
    await expect(entity(table, realId).first()).toHaveAttribute('data-highlight', /selected/);
    for (const d of linked) await expect(entity(table, d).first()).toHaveAttribute('data-highlight', /related|selected/);
  });
});

test.describe('FR-240 空間ビュー', () => {
  // FR-240 AC-571
  test('FR-240 AC-571 空間ビューでズームインすると 全体→拠点→フロア→部屋/設備→詳細 の順に進み、各階層で表示される種別が替わる（異常系: 詳細より先へは進めない）', async ({ page, start }) => {
    await start({ pack: spatialPack() });
    const { c } = await openByName(page, '空間ビュー');
    const level = c.getByTestId('zoom-level');
    const zoomIn = c.getByRole('button', { name: '拡大' });
    const kindsAt = async () => new Set(await c.locator('[data-entity-id][data-kind]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind'))));
    await expect(level).toHaveAttribute('data-depth', '0');
    const expected: Array<[number, string[]]> = [[1, ['site']], [2, ['floor']], [3, ['room']]];
    for (const [depth, kinds] of expected) {
      await zoomIn.click();
      await expect(level).toHaveAttribute('data-depth', String(depth));
      const k = await kindsAt();
      for (const x of kinds) expect(k.has(x), `階層 ${depth} に種別 ${x} が表示されない`).toBe(true);
    }
    // 詳細: 部屋を選んでズームイン
    await c.locator('[data-entity-id][data-kind="room"]').first().click();
    await zoomIn.click();
    await expect(level).toHaveAttribute('data-depth', '4');
    await expect(c.getByTestId('room-detail')).toBeVisible();
    await zoomIn.click().catch(() => {});
    await expect(level, '詳細より先へ進んだ').toHaveAttribute('data-depth', '4');
  });

  // FR-240 AC-572
  test('FR-240 AC-572 3D で等角投影の階の積み重ねが表示され、フロアを選ぶとその階が強調され他の階が薄くなり、選択は保たれる（異常系: 選んでいない階だけが薄くなる）', async ({ page, start }) => {
    await start({ pack: spatialPack() });
    const { c } = await openByName(page, '空間ビュー');
    await chooseView(page, c, '3D');
    await expect.poll(async () => ((await scene.camera(page)) as { projection?: string }).projection).toBe('orthographic');
    const floors = c.locator('[data-entity-id][data-kind="floor"]');
    await expect(floors).toHaveCount(2);
    await floors.nth(0).click();
    const sel = (await floors.nth(0).getAttribute('data-entity-id'))!;
    await expect(entity(c, sel).first()).toHaveAttribute('data-floor-state', 'selected');
    await expect(floors.nth(1)).toHaveAttribute('data-floor-state', 'dimmed');
    await expect(page.getByTestId('selection-indicator')).toContainText(/1 階|ent-gt-f1/);
  });
});
