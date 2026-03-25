'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { reportsApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface TrendPoint {
  date: string;
  green: number;
  yellow: number;
  red: number;
  avgScore: number;
}

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

export default function ReportsPage() {
  const { token } = useAuthStore();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await reportsApi.healthTrend(token, days);
      setTrend((res.data as unknown as TrendPoint[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => { load(); }, [load]);

  const chartData = trend.map(p => ({
    ...p,
    date: format(new Date(p.date), 'd MMM', { locale: it }),
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">Andamento del portfolio clienti nel tempo</p>
      </div>

      {/* Trend chart */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Distribuzione Health Score nel tempo</CardTitle>
          <div className="flex gap-1">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  days === d ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {d}gg
              </button>
            ))}
          </div>
        </CardHeader>

        {loading ? (
          <div className="h-56 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : trend.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
            Dati non disponibili. Avvia una sync HubSpot per iniziare a raccogliere dati.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <defs>
                <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradYellow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value) => value === 'green' ? 'Sani' : value === 'yellow' ? 'Attenzione' : 'Critici'}
              />
              <Area type="monotone" dataKey="green" stroke="#10b981" fill="url(#gradGreen)" strokeWidth={2} />
              <Area type="monotone" dataKey="yellow" stroke="#f59e0b" fill="url(#gradYellow)" strokeWidth={2} />
              <Area type="monotone" dataKey="red" stroke="#ef4444" fill="url(#gradRed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Score medio */}
      {trend.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Score medio per giorno</CardTitle></CardHeader>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <defs>
                <linearGradient id="gradScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v) => [`${v}/100`, 'Score medio']}
              />
              <Area type="monotone" dataKey="avgScore" stroke="#3b82f6" fill="url(#gradScore)" strokeWidth={2} name="Score medio" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
