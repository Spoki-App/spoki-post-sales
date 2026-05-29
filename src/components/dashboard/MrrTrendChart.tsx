'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  accountId: string;
}

export function MrrTrendChart({ accountId }: Props) {
  const { token } = useAuthStore();
  const [data, setData] = useState<Array<{ month: string; mrr: number; prevMrr: number; category: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token || !accountId) return;
    setLoading(true);
    setError(false);
    dashboardDataApi.mrrHistory(token, accountId)
      .then(res => {
        setData(res.accountMrr ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token, accountId]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>MRR Trend</CardTitle></CardHeader>
        <div className="h-48 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (error || data.length === 0) {
    return null;
  }

  const latest = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const delta = prev ? latest.mrr - prev.mrr : 0;
  const deltaPct = prev && prev.mrr > 0 ? Math.round((delta / prev.mrr) * 10000) / 100 : 0;

  const formatEur = (v: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

  return (
    <Card>
      <CardHeader>
        <CardTitle>MRR Trend</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-slate-900">{formatEur(latest.mrr)}</span>
          {delta !== 0 && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {deltaPct > 0 ? '+' : ''}{deltaPct}%
            </span>
          )}
          {delta === 0 && <Minus className="w-3 h-3 text-slate-400" />}
        </div>
      </CardHeader>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={v => v.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={v => `${Math.round(v)}`}
              width={50}
            />
            <Tooltip
              formatter={(value) => [formatEur(Number(value)), 'MRR']}
              labelFormatter={l => `Mese: ${l}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Line type="monotone" dataKey="mrr" stroke="#059669" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
