import {
  resolveAccountQualityTraffic,
  toBinaryQuality,
  type AccountQualityBinary,
  type AccountQualityTraffic,
} from '@/lib/clients/account-quality-traffic';

const dotTraffic: Record<AccountQualityTraffic, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  neutral: 'bg-slate-200',
};

const labelTrafficIt: Record<AccountQualityTraffic, string> = {
  red: 'Punteggio qualità: rosso',
  yellow: 'Punteggio qualità: giallo',
  green: 'Punteggio qualità: verde',
  neutral: 'Punteggio qualità: non indicato',
};

const dotBinary: Record<AccountQualityBinary, string> = {
  red: 'bg-red-500',
  green: 'bg-emerald-500',
};

const labelBinaryIt: Record<AccountQualityBinary, string> = {
  red: 'Punteggio qualità: da monitorare',
  green: 'Punteggio qualità: buono',
};

export type AccountQualityDotVariant = 'trafficLight' | 'binary';

interface AccountQualityDotProps {
  accountQualityScore?: string | null;
  churnRisk?: string | null;
  onboardingStageType?: string | null;
  variant?: AccountQualityDotVariant;
}

export function AccountQualityDot({
  accountQualityScore,
  churnRisk,
  onboardingStageType,
  variant = 'trafficLight',
}: AccountQualityDotProps) {
  const traffic = resolveAccountQualityTraffic(
    accountQualityScore ?? null,
    churnRisk ?? null,
    onboardingStageType ?? null
  );

  if (variant === 'binary') {
    const bin = toBinaryQuality(traffic);
    return (
      <span
        role="img"
        aria-label={labelBinaryIt[bin]}
        title={labelBinaryIt[bin]}
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5 ${dotBinary[bin]}`}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={labelTrafficIt[traffic]}
      title={labelTrafficIt[traffic]}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5 ${dotTraffic[traffic]}`}
    />
  );
}
