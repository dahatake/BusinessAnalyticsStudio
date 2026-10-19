// グラフ・Twin・空間の共通のモデル（FR-235・FR-241）。語彙は src/schema/graph.ts、判断基準は suitability.ts。
export * from './suitability';
export * from './relations';
export * from './layout';
export {
  FLOW_KINDS, TWIN_LAYERS, KPI_STAGES, KPI_STAGE_LABELS, kpiStageOf, isFlowKind, isTwinLayer,
  type FlowKind, type TwinLayer, type KpiStage, type KpiStages,
} from '../schema/graph';
