export const ONBOARDING_PIPELINE_ID = '0';

export type OnboardingStageType = 'normal' | 'warning' | 'danger';

export interface OnboardingStage {
  label: string;
  type: OnboardingStageType;
}

export const ONBOARDING_STAGES: Record<string, OnboardingStage> = {
  '1':          { label: 'Deal won',                type: 'normal' },
  '1011192836': { label: 'Activation Call Booked',  type: 'normal' },
  '2702656701': { label: 'Activation problems',     type: 'warning' },
  '2712273122': { label: 'Activation Failed',       type: 'warning' },
  '2':          { label: 'Activated',               type: 'normal' },
  '2071331018': { label: 'Training Booked',         type: 'normal' },
  '3071245506': { label: 'Training Done',           type: 'normal' },
  '4013788352': { label: '10% Usage',               type: 'normal' },
  '1709021391': { label: 'Follow up Call',          type: 'normal' },
  '2724350144': { label: 'Follow up Call 2',        type: 'normal' },
  '2724350145': { label: 'Follow up Call 3',        type: 'normal' },
  '1004962561': { label: 'Utilizzo 60%',            type: 'normal' },
  '1004887980': { label: 'Never Activated',         type: 'danger' },
  '1005076483': { label: 'Post Onboarding',         type: 'normal' },
  '4524518615': { label: 'Free',                    type: 'danger' },
  '4524518616': { label: 'Withdrawal',              type: 'danger' },
};

export function getOnboardingStage(stageId: string | null | undefined): OnboardingStage | null {
  if (!stageId) return null;
  return ONBOARDING_STAGES[stageId] ?? null;
}
