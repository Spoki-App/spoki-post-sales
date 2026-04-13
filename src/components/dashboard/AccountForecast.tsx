'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';

interface Props {
  accountId: string;
}

const formatEur = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

const OUTCOME_CONFIG = {
  renew: { label: 'Rinnovo', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  churn: { label: 'Churn', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  expansion: { label: 'Espansione', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
  contraction: { label: 'Contrazione', icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
} as const;

export function AccountForecast({ accountId }: Props) {
  const { token } = useAuthStore();
  const [data, setData] = useState<{
    currentMrr: number; forecastMrr: number; trend3m: number;
    churnRisk: 'low' | 'medium' | 'high';
    predictedOutcome: 'renew' | 'churn' | 'expansion' | 'contraction';
    confidence: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !accountId) return;
    setLoading(true);
    dashboardDataApi.forecast(token, accountId)
      .then(res => setData(res.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, accountId]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Previsione</CardTitle></CardHeader>
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const outcome = OUTCOME_CONFIG[data.predictedOutcome];
  const OutcomeIcon = outcome.icon;
  const mrrDelta = data.forecastMrr - data.currentMrr;

  const riskColors = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-red-100 text-red-700',
  };
  const riskLabels = { low: 'Basso', medium: 'Medio', high: 'Alto' };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-slate-500" />
          <CardTitle>Previsione prossimo mese</CardTitle>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${riskColors[data.churnRisk]}`}>
          Rischio churn: {riskLabels[data.churnRisk]}
        </span>
      </CardHeader>

      <div className={`rounded-lg ${outcome.bg} px-4 py-3 mb-4`}>
        <div className="flex items-center gap-2 mb-1">
          <OutcomeIcon className={`w-4 h-4 ${outcome.color}`} />
          <span className={`text-sm font-semibold ${outcome.color}`}>{outcome.label}</span>
          <span className="text-xs text-slate-500 ml-auto">Confidenza: {Math.round(data.confidence * 100)}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-0.5">MRR attuale</p>
          <p className="text-lg font-bold text-slate-900">{formatEur(data.currentMrr)}</p>
        </div>
        <ArrowRight className="w-5 h-5 text-slate-300 shrink-0" />
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-0.5">MRR previsto</p>
          <p className="text-lg font-bold text-slate-900">{formatEur(data.forecastMrr)}</p>
          {mrrDelta !== 0 && (
            <p className={`text-xs font-medium ${mrrDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {mrrDelta > 0 ? '+' : ''}{formatEur(mrrDelta)}
            </p>
          )}
        </div>
      </div>

      {data.trend3m !== 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Trend 3 mesi:{' '}
            <span className={`font-medium ${data.trend3m > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {data.trend3m > 0 ? '+' : ''}{data.trend3m}%
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}
