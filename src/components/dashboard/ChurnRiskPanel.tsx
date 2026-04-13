'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AlertTriangle } from 'lucide-react';
import type { ChurnRecord } from '@/types/dashboard';

const formatEur = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export function ChurnRiskPanel() {
  const { token } = useAuthStore();
  const [records, setRecords] = useState<ChurnRecord[]>([]);
  const [summary, setSummary] = useState<{ total: number; totalMrrAtRisk: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    dashboardDataApi.churnDetails(token)
      .then(res => {
        setRecords(res.data ?? []);
        setSummary(res.summary ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Card padding="none">
        <CardHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <CardTitle>Churn a rischio</CardTitle>
          </div>
        </CardHeader>
        <div className="h-32 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (records.length === 0) return null;

  return (
    <Card padding="none">
      <CardHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-red-500">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <CardTitle>Churn a rischio ({summary?.total ?? records.length})</CardTitle>
        </div>
        {summary && (
          <span className="text-sm font-bold text-red-600">{formatEur(summary.totalMrrAtRisk)} MRR</span>
        )}
      </CardHeader>
      <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {records.slice(0, 15).map((r, i) => (
          <li key={i} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{r.accountName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {r.planSlug && (
                  <Badge variant="default" size="sm">{r.planSlug}</Badge>
                )}
                <span className="text-xs text-slate-400">Scaduto da {r.daysSinceExpiry}g</span>
              </div>
            </div>
            <span className="text-sm font-semibold text-red-600 shrink-0">{formatEur(r.mrrLost)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
