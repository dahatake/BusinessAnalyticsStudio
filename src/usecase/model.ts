// ユースケースの登録（FR-158）とプレゼン用アニメーションの生成（FR-155）の純関数。端末内だけで完結し、AI には接続しない。

/** 1 ユースケースの手順の上限（PARAM-046） */
export const MAX_STEPS = 20;
/** 1 シーンの既定の表示時間（PARAM-047。秒） */
export const SCENE_SECONDS = 5;

export interface UseCaseStep { title: string; description: string }
export interface UseCaseDraft { name: string; summary: string; persona: string; steps: UseCaseStep[]; effect: string }
export interface UseCase extends UseCaseDraft { id: string }

export type SceneKind = 'intro' | 'step' | 'effect';
export interface Scene { kind: SceneKind; title: string; body: string }
export interface Animation { scenes: Scene[]; /** 作成時の内容の署名。変わると「古い」 */ signature: string; createdAt: string }
/** アニメーションの作成状態: 未作成→最新→古い */
export type AnimationState = 'none' | 'latest' | 'stale';

export const emptyDraft = (): UseCaseDraft => ({ name: '', summary: '', persona: '', steps: [], effect: '' });
export const toDraft = (uc: UseCaseDraft): UseCaseDraft => ({
  name: uc.name, summary: uc.summary, persona: uc.persona, effect: uc.effect, steps: uc.steps.map((s) => ({ ...s })),
});

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** 手順を 1 件足す。上限（PARAM-046）に達していれば拒否し、既存の手順は変えない（FR-158 AC-287） */
export function addStep(steps: readonly UseCaseStep[]): Checked<UseCaseStep[]> {
  if (steps.length >= MAX_STEPS) {
    return { ok: false, errors: [`手順は 1 ユースケースにつき ${MAX_STEPS} 件までです。不要な手順を削除するか、手順をまとめてください。`] };
  }
  return { ok: true, value: [...steps.map((s) => ({ ...s })), { title: '', description: '' }] };
}

/** 登録内容の検証（FR-158 AC-286）。名称と各手順の見出しは必須。値は前後の空白を除いて保存する */
export function validateDraft(d: UseCaseDraft): Checked<UseCaseDraft> {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('名称を入力してください。');
  d.steps.forEach((s, i) => { if (!s.title.trim()) errors.push(`手順 ${i + 1} の見出しを入力してください。`); });
  if (d.steps.length > MAX_STEPS) errors.push(`手順は ${MAX_STEPS} 件までです。`);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: d.name.trim(), summary: d.summary.trim(), persona: d.persona.trim(), effect: d.effect.trim(),
      steps: d.steps.map((s) => ({ title: s.title.trim(), description: s.description.trim() })),
    },
  };
}

/** 内容の署名（手順・効果などを含む）。同じ内容なら同じ文字列 */
export function signature(uc: UseCaseDraft): string {
  return JSON.stringify([uc.name, uc.summary, uc.persona, uc.effect, uc.steps.map((s) => [s.title, s.description])]);
}

/** シーンの生成（FR-155 AC-276）: 導入 1 + 手順 N + 効果（入力があれば 1）。同じ入力から同じ構成 */
export function buildScenes(uc: UseCaseDraft): Scene[] {
  const intro: Scene = {
    kind: 'intro',
    title: uc.name,
    body: [`対象ペルソナ: ${uc.persona || '（未入力）'}`, uc.summary].filter(Boolean).join('\n'),
  };
  const steps: Scene[] = uc.steps.map((s) => ({ kind: 'step', title: s.title, body: s.description }));
  const effect: Scene[] = uc.effect.trim() ? [{ kind: 'effect', title: '期待する効果', body: uc.effect }] : [];
  return [intro, ...steps, ...effect];
}

/** アニメーションを作る。手順が 0 件なら拒否する（FR-155 AC-277）。 */
export function createAnimation(uc: UseCaseDraft, now: Date = new Date()): Checked<Animation> {
  if (uc.steps.length === 0) {
    return { ok: false, errors: ['手順がないため、アニメーションを作成できません。手順を 1 つ以上追加する（「編集」から手順を追加して保存する）と作成できます。'] };
  }
  return { ok: true, value: { scenes: buildScenes(uc), signature: signature(uc), createdAt: now.toISOString() } };
}

export function animationState(uc: UseCaseDraft, anim: Animation | undefined): AnimationState {
  if (!anim) return 'none';
  return anim.signature === signature(uc) ? 'latest' : 'stale';
}
