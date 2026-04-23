export interface DealStageConfig {
  label: string;
  isClosed: boolean;
  isWon: boolean;
  displayOrder: number;
}

export interface DealPipelineConfig {
  id: string;
  label: string;
  stages: Record<string, DealStageConfig>;
}

export const SALES_PIPELINE: DealPipelineConfig = {
  id: '671838099',
  label: 'Sales Pipeline',
  stages: {
    '986053466':  { label: 'Discovery',                     isClosed: false, isWon: false, displayOrder: 0 },
    '986053467':  { label: 'Demo / Value Proposition',      isClosed: false, isWon: false, displayOrder: 1 },
    '986053468':  { label: 'Pricing Discussed',             isClosed: false, isWon: false, displayOrder: 2 },
    '2674750700': { label: 'Negotiation / Trial Activation', isClosed: false, isWon: false, displayOrder: 3 },
    '5082957040': { label: 'Contract Signed',               isClosed: true,  isWon: true,  displayOrder: 4 },
    '986053469':  { label: 'Closed Won',                    isClosed: true,  isWon: true,  displayOrder: 5 },
    '986053470':  { label: 'Closed Lost',                   isClosed: true,  isWon: false, displayOrder: 6 },
  },
};

export const UPSELLING_PIPELINE: DealPipelineConfig = {
  id: '2683002088',
  label: 'Upselling',
  stages: {
    '3675734212': { label: 'Offer Sent',  isClosed: false, isWon: false, displayOrder: 0 },
    '3675734213': { label: 'Closed Won',  isClosed: true,  isWon: true,  displayOrder: 1 },
    '3675734214': { label: 'Closed Lost', isClosed: true,  isWon: false, displayOrder: 2 },
  },
};

export const DEAL_PIPELINES: Record<string, DealPipelineConfig> = {
  [SALES_PIPELINE.id]: SALES_PIPELINE,
  [UPSELLING_PIPELINE.id]: UPSELLING_PIPELINE,
};

export const TRACKED_PIPELINE_IDS = [SALES_PIPELINE.id, UPSELLING_PIPELINE.id] as const;

export function getPipelineLabel(pipelineId: string): string {
  return DEAL_PIPELINES[pipelineId]?.label ?? pipelineId;
}

export function getStageLabel(pipelineId: string, stageId: string): string {
  return DEAL_PIPELINES[pipelineId]?.stages[stageId]?.label ?? stageId;
}

export function getStageConfig(pipelineId: string, stageId: string): DealStageConfig | null {
  return DEAL_PIPELINES[pipelineId]?.stages[stageId] ?? null;
}

export function getTotalStages(pipelineId: string): number {
  return Object.keys(DEAL_PIPELINES[pipelineId]?.stages ?? {}).length;
}
