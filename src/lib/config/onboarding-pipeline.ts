export const ONBOARDING_HAPPY_PATH = [
  { id: '1', label: 'Deal Won' },
  { id: '1011192836', label: 'Call Booked' },
  { id: '2', label: 'Activated' },
  { id: '2071331018', label: 'Training Booked' },
  { id: '3071245506', label: 'Training Done' },
  { id: '1709021391', label: 'Follow up 1' },
  { id: '2724350144', label: 'Follow up 2' },
  { id: '2724350145', label: 'Follow up 3' },
  { id: '1005076483', label: 'Post Onboarding' },
] as const;

export const ONBOARDING_PROBLEM_STAGES: Record<string, string> = {
  '2702656701': 'Activation Problems',
  '2712273122': 'Activation Failed',
  '4013788352': '10% Usage',
  '1004962561': 'Utilizzo 60%',
  '1004887980': 'Never Activated',
  '4524518615': 'Free',
  '4524518616': 'Withdrawal',
};

export const ONBOARDING_PROBLEM_IDS = new Set(Object.keys(ONBOARDING_PROBLEM_STAGES));

export const ONBOARDING_PIPELINE_ID = '0';

export type OnboardingStageId = (typeof ONBOARDING_HAPPY_PATH)[number]['id'];

export function getOnboardingStageLabel(stageId: string | null | undefined): string | null {
  if (!stageId) return null;
  const happy = ONBOARDING_HAPPY_PATH.find(s => s.id === stageId);
  if (happy) return happy.label;
  return ONBOARDING_PROBLEM_STAGES[stageId] ?? null;
}
