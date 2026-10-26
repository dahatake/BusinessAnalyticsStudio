// @vitest-environment jsdom
// FR-043 AC-054 / FR-287 AC-752: 保存済みProjectの非破壊復元と作業先の分離。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';
import { usePackStore } from '../../src/store/pack';
import { useProjects, resetProjects } from '../../src/store/projects';
import { PROJECT_PACKS_KEY, readProjectPack, saveProjectPack } from '../../src/store/projectPacks';
import { resetEditForTest, useEditStore } from '../../src/store/edit';
import { updateField } from '../../src/edit/model';
import type { PackData } from '../../src/schema';

const ready = () => {
  const state = usePackStore.getState().state;
  if (state.status !== 'ready') throw new Error('Pack did not load');
  return state.pack;
};

beforeEach(() => {
  localStorage.clear();
  usePackStore.setState({ state: { status: 'loading' }, original: null });
  resetProjects();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const file = path.join(REPO_ROOT, 'examples/mono/public', url);
    return { ok: fs.existsSync(file), json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

function edited(data: PackData): PackData {
  const copy = structuredClone(data);
  copy.mocks!.mocks[0]!.screens![0]!.title += '（保存済み）';
  copy.issues.solutions[0]!.title += '（保存済み）';
  copy.customer.screenGuides!['mock-app'] = '旧画面の互換説明';
  return copy;
}

describe('FR-043 AC-054 persisted project packs', () => {
  it('FR-043 AC-054 reload restores the complete edited pack, including mocks, solution references and legacy guides', async () => {
    useProjects.getState().open('project-A');
    await usePackStore.getState().load();
    const original = structuredClone(ready().data);
    const saved = edited(original);
    usePackStore.getState().setData(saved);
    usePackStore.setState({ state: { status: 'loading' }, original: null });
    await usePackStore.getState().load();
    expect(ready().data).toEqual(saved);
    expect(usePackStore.getState().original).toEqual(original);
    expect(JSON.parse(localStorage.getItem(PROJECT_PACKS_KEY)!)['project-A']).toEqual(saved);
  });

  it('FR-043 AC-054 FR-287 AC-752 keeps each Project separate and never persists demo edits into a Project', async () => {
    await usePackStore.getState().load();
    const original = structuredClone(ready().data);
    usePackStore.getState().setData(edited(original)); // demo
    expect(localStorage.getItem(PROJECT_PACKS_KEY)).toBeNull();
    useProjects.getState().open('project-A');
    expect(ready().data).toEqual(original);
    const savedA = edited(original);
    usePackStore.getState().setData(savedA);
    useProjects.getState().open('project-B');
    expect(ready().data).toEqual(original);
    const savedB = edited(savedA);
    usePackStore.getState().setData(savedB);
    useProjects.getState().open('project-A');
    expect(ready().data).toEqual(savedA);
    useProjects.getState().open('project-A');
    expect(ready().data).toEqual(savedA);
    useProjects.getState().open(null);
    expect(ready().data).toEqual(original);
    useProjects.getState().open('project-B');
    expect(ready().data).toEqual(savedB);
  });

  it('FR-043 AC-054 undo/redo history is cleared on Project switch, so another workspace pack is never applied or saved', async () => {
    await usePackStore.getState().load();
    const original = structuredClone(ready().data);
    const id = original.issues.solutions[0]!.id;
    resetEditForTest();
    useEditStore.getState().setEditMode(true);
    useProjects.getState().open('project-A');
    expect(useEditStore.getState().commit(updateField(ready().data, id, ['title'], 'A-1')).ok).toBe(true);
    expect(useEditStore.getState().commit(updateField(ready().data, id, ['title'], 'A-2')).ok).toBe(true);
    const savedA = structuredClone(ready().data);
    useProjects.getState().open('project-B');
    expect(ready().data).toEqual(original);
    expect(useEditStore.getState().past).toHaveLength(0);
    expect(useEditStore.getState().future).toHaveLength(0);
    expect(useEditStore.getState().undo()).toBe(false);
    expect(useEditStore.getState().redo()).toBe(false);
    expect(ready().data).toEqual(original);
    expect(JSON.parse(localStorage.getItem(PROJECT_PACKS_KEY)!)['project-B']).toBeUndefined();
    useProjects.getState().open('project-A');
    expect(ready().data).toEqual(savedA);
    // demo -> Project
    useProjects.getState().open(null);
    useEditStore.getState().commit(updateField(ready().data, id, ['title'], 'demo-1'));
    useProjects.getState().open('project-B');
    expect(useEditStore.getState().undo()).toBe(false);
    expect(ready().data).toEqual(original);
    expect(readProjectPack('project-B', ready().brand)).toBeUndefined();
    resetEditForTest();
  });

  it('FR-043 AC-054 invalid storage is not applied or deleted, and unavailable storage does not destroy the in-memory pack', async () => {
    await usePackStore.getState().load();
    const original = ready();
    const raw = JSON.stringify({ 'project-A': { customer: {} } });
    localStorage.setItem(PROJECT_PACKS_KEY, raw);
    expect(readProjectPack('project-A', original.brand)).toBeUndefined();
    expect(localStorage.getItem(PROJECT_PACKS_KEY)).toBe(raw);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('full'); } });
    expect(readProjectPack('project-A', original.brand)).toBeUndefined();
    expect(() => saveProjectPack('project-A', original.data)).not.toThrow();
    useProjects.getState().open('project-A');
    const saved = edited(original.data);
    usePackStore.getState().setData(saved);
    expect(ready().data).toEqual(saved);
  });
});
