// 業務改善ステッパーのモデル（FR-136, PARAM-030 = 5 ステップ）。表示と状態の判定は、この純関数に集める。
export type StepState = 'not-started' | 'current' | 'done';

export interface StepDefinition {
  key: string;
  label: string;
  /** ステップを選んだときに移動する作業画面（画面の登録の key） */
  screen: string;
  /** この画面に移ったら、このステップが現在になる（screen を含む） */
  screens: readonly string[];
  /** 対応画面に続けて開く追加の入口（FR-158: ユースケースの登録）。対応画面そのものは変えない */
  also?: readonly string[];
}

/** 業務改善プロセスの全ステップ（課題定義→現状分析→KPI 測定→ユースケース作成→施策計画）。 */
export const STEPS: readonly StepDefinition[] = [
  { key: 'issue', label: '課題定義', screen: 'issue-solution', screens: ['issue-solution', 'themes', 'discussion-tree', 'sources'] },
  { key: 'analysis', label: '現状分析', screen: 'knowledge-graph', screens: ['knowledge-graph', 'analysis', 'architecture', 'table', 'map', 'view3d', 'drawing2d'] },
  { key: 'kpi', label: 'KPI 測定', screen: 'priority', screens: ['priority', 'ranking', 'matrix'] },
  { key: 'usecase', label: 'ユースケース作成', screen: 'mock-app', screens: ['mock-app', 'canvas', 'whiteboard', 'usecase'], also: ['usecase'] },
  { key: 'plan', label: '施策計画', screen: 'gantt', screens: ['gantt', 'summary'] },
];

export const INITIAL_STEP = 0;

/** 画面に対応するステップの位置。対応するステップがない画面（設定・チャットなど）は undefined。 */
export function stepIndexForScreen(screenKey: string): number | undefined {
  const i = STEPS.findIndex((s) => s.screens.includes(screenKey));
  return i < 0 ? undefined : i;
}

/** ステップの状態: 現在より前は完了、現在は進行中、後は未着手。 */
export function stepState(index: number, current: number, tracked = true): StepState {
  if (index === current) return 'current';
  // デモ（tracked=false）は完了済みの状態を持たない（FR-136 AC-372）
  return tracked && index < current ? 'done' : 'not-started';
}

export const STEP_STATE_LABEL: Record<StepState, string> = { 'not-started': '未着手', current: '進行中', done: '完了' };
