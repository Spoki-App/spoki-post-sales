'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { NrrGrrMonth } from '@/types/dashboard';

export function NrrGrrCards() {
  const { token } = useAuthStore();
  const [data, setData] = useState<NrrGrrMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    dashboardDataApi.nrrGrr(token)
      .then(res => setData(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>NRR / GRR</CardTitle></CardHeader>
        <div className="h-48 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) return null;

  const last6 = data.slice(-6);
  const latest = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;

  const nrrDelta = prev ? Math.round((latest.nrrPct - prev.nrrPct) * 10) / 10 : 0;
  const grrDelta = prev ? Math.round((latest.grrPct - prev.grrPct) * 10) / 10 : 0;

  const chartData = last6.map(d => ({
    month: d.month.slice(5),
    nrr: d.nrrPct,
    grr: d.grrPct,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-600">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <CardTitle>NRR / GRR (ultimi 6 mesi)</CardTitle>
        </div>
      </CardHeader>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">NRR</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{latest.nrrPct}%</span>
            {nrrDelta !== 0 && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${nrrDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {nrrDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {nrrDelta > 0 ? '+' : ''}{nrrDelta}pp
              </span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">GRR</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{latest.grrPct}%</span>
            {grrDelta !== 0 && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${grrDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {grrDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {grrDelta > 0 ? '+' : ''}{grrDelta}pp
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        {([
          ['Expansion', latest.expandedCount, 'text-emerald-600', '+'],
          ['Contraction', latest.contractedCount, 'text-amber-600', ''],
          ['Churn', latest.churnedCount, 'text-red-600', ''],
          ['New', latest.newCount, 'text-teal-600', '+'],
        ] as const).map(([label, value, color, prefix]) => (
          <div key={label}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-sm font-semibold ${color}`}>{prefix}{value}</p>
          </div>
        ))}
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis domain={[80, 120]} tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} tickFormatter={v => `${v}%`} />
            <Tooltip
              formatter={(value, name) => [`${value}%`, name === 'nrr' ? 'NRR' : 'GRR']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar dataKey="nrr" fill="#059669" radius={[4, 4, 0, 0]} />
            <Bar dataKey="grr" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
