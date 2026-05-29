export const CS_PIPELINE_STAGES = [
  { id: 'welcome_call', label: 'Call benvenuto' },
  { id: 'follow_up_1', label: 'Primo follow up' },
  { id: 'follow_up_2', label: 'Secondo follow up' },
  { id: 'kpi_1', label: 'Analisi KPI 1' },
  { id: 'kpi_2', label: 'Analisi KPI 2' },
  { id: 'kpi_3', label: 'Analisi KPI 3' },
  { id: 'kpi_4', label: 'Analisi KPI 4' },
  { id: 'kpi_5', label: 'Analisi KPI 5' },
  { id: 'completed', label: 'Completato' },
] as const;

export type CsPipelineStageId = (typeof CS_PIPELINE_STAGES)[number]['id'];

export function isCsPipelineStage(s: string): s is CsPipelineStageId {
  return CS_PIPELINE_STAGES.some(x => x.id === s);
}
