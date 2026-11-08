// FR-228 AC-529 / FR-296 AC-886: passive browser-DOM observation, not a product hook.
// A selected step and a visible->front destination must both be observed. If a
// reflow/rollback may already have occurred in the same DOM batch, the supposed
// pre-reflow baseline is rejected rather than inferred from the final UI.
import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export type ObservedWindow = {
  key: string;
  state: string;
  rect: { x: number; y: number; width: number; height: number } | null;
  scrollOffset: { x: number; y: number } | null;
  z: number | null;
  domOrder: number | null;
  pinName: string | null;
  viewName: string | null;
  zone: string | null;
};

export type NavigationObservation = {
  step: string;
  target: string;
  workspace: { x: number; y: number; width: number; height: number };
  windows: ObservedWindow[];
  geometryChangesInBatch: string[];
  otherVisibilityChangesSinceClick: string[];
  otherGeometryChangesSinceClick: string[];
  mutationTimeline: Array<{ kind: string; key: string; oldValue: string | null }>;
  stepMarkerObserved: boolean;
  mutationsBeforeStepMarker: string[];
  workspaceDocumentRectUnchanged: boolean;
  destinationTransitionObserved: boolean;
  reasonAlreadyVisible: boolean;
  ambiguousBeforeReflow: string[];
};

/**
 * The destination starts visible but not front. The observation can be used as
 * the post-navigation/pre-reflow baseline only when the step and front change are
 * visible, the reason has not appeared, and no workspace geometry, stacking,
 * pin, visibility (other than the two navigation endpoints), or DOM mutation
 * has occurred. This deliberately rejects some correct atomic/batched renderings:
 * their intermediate state cannot be proved from the DOM.
 */
export async function observeStepNavigation(page: Page, step: string, target: string): Promise<NavigationObservation | null> {
  const stepper = page.getByTestId('stepper');
  await expect(stepper.locator('[data-step-state="current"]'), '前提: 別のステップから移動する').not.toContainText(step);
  const destination = page.getByTestId('window-list').locator(`[data-testid="window-list-item"][data-component-key="${target}"]`);
  await expect(destination, '前提: 移動先は表示中だが前面ではない').toHaveAttribute('data-state', 'visible');
  const observer = await page.evaluateHandle(({ wantedStep, wantedTarget }) => {
    const result: { snapshot: NavigationObservation | null; stop: () => void } = { snapshot: null, stop: () => {} };
    const mutationTimeline: NavigationObservation['mutationTimeline'] = [];
    const workspaceBefore = document.querySelector<HTMLElement>('[data-testid="workspace"]');
    const windowListBefore = document.querySelector<HTMLElement>('[data-testid="window-list"]');
    if (!workspaceBefore || !windowListBefore) throw new Error('再配置直前の作業領域・一覧が見つからない');
    const scrollOffset = (element: HTMLElement, workspace: HTMLElement) => {
      let x = 0, y = 0;
      for (let node = element.parentElement; node; node = node.parentElement) {
        x += node.scrollLeft;
        y += node.scrollTop;
        if (node === workspace) break;
      }
      return { x, y };
    };
    const readFrame = (workspace: HTMLElement) => {
      const list = [...document.querySelectorAll<HTMLElement>('[data-testid="window-list-item"]')];
      const components = [...workspace.querySelectorAll<HTMLElement>('[data-testid^="component-"]')];
      const wantedKeys = new Set(list.map((el) => el.dataset.componentKey));
      const nodes = components.filter((el) => wantedKeys.has((el.dataset.testid ?? '').replace(/^component-/, '')));
      const wr = workspace.getBoundingClientRect();
      const windows = list.map((item) => {
        const key = item.dataset.componentKey ?? '';
        const el = nodes.find((node) => node.dataset.testid === `component-${key}`);
        const r = el?.getBoundingClientRect();
        const rect = r && r.width > 0 && r.height > 0 && el && getComputedStyle(el).visibility !== 'hidden'
          ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
        const scroll = rect && el ? scrollOffset(el, workspace) : null;
        let z: number | null = null;
        if (rect && el) {
          z = 0;
          for (let node: Element | null = el; node; node = node.parentElement) {
            const value = Number.parseInt(getComputedStyle(node).zIndex, 10);
            if (!Number.isNaN(value)) { z = value; break; }
          }
        }
        const pin = el?.querySelector('button[aria-label^="ピン止め"]');
        const view = el?.querySelector('button[aria-label^="ビュー"]');
        const zone = el?.closest('[data-zone-id], [data-zone]');
        return {
          key, state: item.dataset.state ?? '', rect, scrollOffset: scroll, z,
          domOrder: rect && el ? nodes.indexOf(el) : null,
          pinName: pin?.getAttribute('aria-label') ?? null,
          viewName: view?.getAttribute('aria-label') ?? null,
          zone: zone?.getAttribute('data-zone-id') ?? zone?.getAttribute('data-zone') ?? null,
        };
      });
      return {
        workspace: { x: wr.x, y: wr.y, width: wr.width, height: wr.height },
        documentRect: { x: wr.x + window.scrollX, y: wr.y + window.scrollY, width: wr.width, height: wr.height },
        windows,
      };
    };
    const initial = readFrame(workspaceBefore);
    const initialStates = new Map(initial.windows.map((w) => [w.key, w.state]));
    const initialFront = initial.windows.find((w) => w.state === 'front')?.key ?? '';
    const visibleStates = new Set(['front', 'visible']);
    const mutationsBeforeStepMarker: string[] = [];
    const workspaceMutations: string[] = [];
    let stepMarkerObserved = false;
    let listFocusChangedBeforeMarker = false;
    const mo = new MutationObserver((changes) => {
      if (result.snapshot) return;
      const geometryChangesInBatch: string[] = [];
      for (const change of changes) {
        const el = change.target instanceof Element ? change.target : change.target.parentElement;
        if (!el) continue;
        if (workspaceBefore.contains(el) && !windowListBefore.contains(el)) {
          workspaceMutations.push(`${change.type}:${change.attributeName ?? ''}:${el.getAttribute('data-testid') ?? el.tagName}`);
        } else if (el !== workspaceBefore && el.contains(workspaceBefore) && change.type === 'attributes'
          && ['class', 'style', 'hidden'].includes(change.attributeName ?? '')) {
          workspaceMutations.push(`ancestor:${change.attributeName}:${el.getAttribute('data-testid') ?? el.tagName}`);
        }
        const isMarker = change.type === 'attributes' && change.attributeName === 'data-step-state'
          && el.textContent?.includes(wantedStep) && change.oldValue !== 'current'
          && el.getAttribute('data-step-state') === 'current';
        if (isMarker) stepMarkerObserved = true;
        else if (!stepMarkerObserved && (workspaceBefore.contains(el) || windowListBefore.contains(el)
          || (el.contains(workspaceBefore) && change.type === 'attributes'
            && ['class', 'style', 'hidden'].includes(change.attributeName ?? '')))) {
          const item = el.closest<HTMLElement>('[data-testid="window-list-item"]');
          const navItem = item && [initialFront, wantedTarget].includes(item.dataset.componentKey ?? '');
          if (windowListBefore.contains(el) && (navItem || el.closest('[data-testid="window-list-front"]'))) {
            // These two list items may change their front/visible representation
            // during navigation; the resulting states are checked below.
          } else if (windowListBefore.contains(el) && change.attributeName === 'data-fui-focus-visible') {
            listFocusChangedBeforeMarker = true;
          } else {
            mutationsBeforeStepMarker.push(`${change.type}:${change.attributeName ?? ''}:${el.getAttribute('data-testid') ?? el.tagName}`);
          }
        }
        if (change.type !== 'attributes') continue;
        if (change.attributeName === 'data-step-state') {
          mutationTimeline.push({ kind: 'step', key: el.textContent?.trim() ?? '', oldValue: change.oldValue });
        } else if (change.attributeName === 'data-state' && el.matches('[data-testid="window-list-item"]')) {
          mutationTimeline.push({ kind: 'window', key: (el as HTMLElement).dataset.componentKey ?? '', oldValue: change.oldValue });
        } else if (change.attributeName === 'style' && workspaceBefore.contains(el)) {
          const old = document.createElement('div');
          old.style.cssText = change.oldValue ?? '';
          if (['left', 'top', 'right', 'bottom', 'width', 'height', 'transform', 'position']
            .some((prop) => old.style.getPropertyValue(prop) !== (el as HTMLElement).style.getPropertyValue(prop))) {
            const key = (el as HTMLElement).dataset.testid ?? el.tagName;
            geometryChangesInBatch.push(key);
            mutationTimeline.push({ kind: 'geometry-style', key, oldValue: change.oldValue });
          }
        }
      }
      const current = document.querySelector<HTMLElement>('[data-testid="stepper"] [data-step-state="current"]');
      const targetItem = document.querySelector<HTMLElement>(`[data-testid="window-list-item"][data-component-key="${wantedTarget}"]`);
      if (!current?.textContent?.includes(wantedStep) || targetItem?.dataset.state !== 'front') return;
      const workspace = document.querySelector<HTMLElement>('[data-testid="workspace"]');
      if (!workspace) return;
      const now = readFrame(workspace);
      const observedKeys = new Set(now.windows.map((w) => w.key));
      const otherVisibilityChangesSinceClick = now.windows
        .filter((w) => initialStates.has(w.key) && initialStates.get(w.key) !== w.state)
        .map((w) => `${w.key}: ${initialStates.get(w.key)} → ${w.state}`);
      for (const w of now.windows) if (!initialStates.has(w.key)) otherVisibilityChangesSinceClick.push(`${w.key}: 一覧に追加`);
      for (const key of initialStates.keys()) if (!observedKeys.has(key)) otherVisibilityChangesSinceClick.push(`${key}: 一覧から消失`);
      const otherGeometryChangesSinceClick = now.windows.filter((w) => {
        const before = initial.windows.find((item) => item.key === w.key);
        if (!before?.rect || !before.scrollOffset || !w.rect || !w.scrollOffset
          || !visibleStates.has(before.state) || !visibleStates.has(w.state)) return false;
        const a = { x: before.rect.x - initial.workspace.x + before.scrollOffset.x,
          y: before.rect.y - initial.workspace.y + before.scrollOffset.y, width: before.rect.width, height: before.rect.height };
        const b = { x: w.rect.x - now.workspace.x + w.scrollOffset.x,
          y: w.rect.y - now.workspace.y + w.scrollOffset.y, width: w.rect.width, height: w.rect.height };
        return (['x', 'y', 'width', 'height'] as const).some((field) => a[field] !== b[field]);
      }).map((w) => w.key);
      if (listFocusChangedBeforeMarker) {
        // A focus-ring attribute is harmless only if *all* observed window state,
        // geometry and stacking are unchanged through the marker callback.
        const normalize = (frame: typeof initial) => frame.windows.map(({ state: _state, ...w }) => ({
          ...w,
          rect: w.rect && w.scrollOffset ? {
            x: w.rect.x - frame.workspace.x + w.scrollOffset.x,
            y: w.rect.y - frame.workspace.y + w.scrollOffset.y,
            width: w.rect.width, height: w.rect.height,
          } : null,
          scrollOffset: null,
        }));
        if (JSON.stringify(normalize(initial)) !== JSON.stringify(normalize(now))) {
          mutationsBeforeStepMarker.push('window-list focus change: 窓の状態・矩形・描画順への影響を除外できない');
        }
      }
      const workspaceDocumentRectUnchanged = workspace === workspaceBefore
        && (['x', 'y', 'width', 'height'] as const).every((field) => initial.documentRect[field] === now.documentRect[field]);
      const destinationTransitionObserved = initialStates.get(wantedTarget) === 'visible'
        && targetItem.dataset.state === 'front' && !!initialFront && initialFront !== wantedTarget;
      const reasonAlreadyVisible = [...document.querySelectorAll<HTMLElement>('[role="alert"], [role="status"]')].some((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          && /領域|スペース|場所|収ま|不足|画面の幅/.test(el.textContent ?? '');
      });
      const ambiguousBeforeReflow = [...workspaceMutations];
      const targetChanges = mutationTimeline.filter((m) => m.kind === 'window' && m.key === wantedTarget);
      const frontChanges = mutationTimeline.filter((m) => m.kind === 'window' && m.key === initialFront);
      if (targetChanges.length !== 1 || targetChanges[0].oldValue !== 'visible'
        || frontChanges.length !== 1 || frontChanges[0].oldValue !== 'front'
        || now.windows.find((w) => w.key === initialFront)?.state !== 'visible') {
        ambiguousBeforeReflow.push('前面変更以外の中間状態を排除できない');
      }
      for (const change of otherVisibilityChangesSinceClick) {
        if (!change.startsWith(`${initialFront}: `) && !change.startsWith(`${wantedTarget}: `)) {
          ambiguousBeforeReflow.push(`一覧: ${change}`);
        }
      }
      if (otherGeometryChangesSinceClick.length) ambiguousBeforeReflow.push(`矩形: ${otherGeometryChangesSinceClick.join(', ')}`);
      for (const w of now.windows) {
        const old = initial.windows.find((item) => item.key === w.key);
        if (!old || old.z !== w.z || old.domOrder !== w.domOrder || old.pinName !== w.pinName
          || old.viewName !== w.viewName || old.zone !== w.zone) {
          ambiguousBeforeReflow.push(`${w.key}: 前後関係・ピン・ビュー・ゾーンが変化`);
        }
      }
      result.snapshot = { step: wantedStep, target: wantedTarget, workspace: now.workspace, windows: now.windows,
        geometryChangesInBatch, otherVisibilityChangesSinceClick, otherGeometryChangesSinceClick, mutationTimeline,
        stepMarkerObserved, mutationsBeforeStepMarker, workspaceDocumentRectUnchanged,
        destinationTransitionObserved, reasonAlreadyVisible, ambiguousBeforeReflow };
      mo.disconnect();
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeOldValue: true });
    result.stop = () => mo.disconnect();
    return result;
  }, { wantedStep: step, wantedTarget: target });
  try {
    await stepper.getByRole('button', { name: step, exact: true }).click();
    try {
      await expect.poll(async () => observer.evaluate((state) => state.snapshot), {
        message: `${step}: 移動後・再配置前の実 UI を観測する`, timeout: 10_000,
      }).not.toBeNull();
    } catch (error) {
      // Allow the caller to check navigation, reason and user input separately,
      // but never manufacture a baseline when the destination did not appear.
      if ((await observer.evaluate((state) => state.snapshot)) === null) return null;
      throw error;
    }
    return await observer.evaluate((state) => state.snapshot);
  } finally {
    await observer.evaluate((state) => state.stop());
    await observer.dispose();
  }
}

/** Call after attaching the raw observation so an ambiguous measurement remains evidence. */
export function expectBeforeReflowObservation(snapshot: NavigationObservation): void {
  expect(snapshot.stepMarkerObserved, `${snapshot.step}: 選択の DOM 変更を観測する`).toBe(true);
  expect(snapshot.destinationTransitionObserved, `${snapshot.step}: 作業画面が表示中から前面へ移る`).toBe(true);
  expect(snapshot.mutationsBeforeStepMarker,
    `${snapshot.step}: 選択より先の変更があり、再配置直前を識別できない`).toEqual([]);
  expect(snapshot.workspaceDocumentRectUnchanged,
    `${snapshot.step}: 作業領域の矩形が変わり、再配置直前を識別できない`).toBe(true);
  expect(snapshot.reasonAlreadyVisible,
    `${snapshot.step}: 取消しが同一バッチで完了した可能性があり、直前を識別できない`).toBe(false);
  expect(snapshot.ambiguousBeforeReflow,
    `${snapshot.step}: 画面遷移後・再配置前を独立に識別できない`).toEqual([]);
}
