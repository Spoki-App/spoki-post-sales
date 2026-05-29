'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { onboardingHubApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Users, AlertTriangle, CheckCircle2, Loader2, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { OnboardingHubDashboardData } from '@/types';

function formatMrr(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

export default function OnboardingDashboardPage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<OnboardingHubDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    onboardingHubApi.dashboard(token)
      .then(res => setData(res.data ?? null))
      .catch(e => setError(e instanceof Error ? e.message : 'Errore'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return null;

  const chartData = data.happyPathStages.filter(s => s.count > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="In onboarding" value={data.activeCount} icon={Users} color="bg-teal-600" />
        <KpiCard title="Completati" value={data.completedCount} icon={CheckCircle2} color="bg-teal-500" />
        <KpiCard
          title="Problemi"
          value={data.problemCount}
          sub={data.problemStages.map(s => `${s.label}: ${s.count}`).join(', ') || undefined}
          icon={AlertTriangle}
          color="bg-amber-500"
        />
        <KpiCard
          title="Rinnovi 30 gg"
          value={data.renewals['30d']?.count ?? 0}
          sub={data.renewals['30d'] ? `${formatMrr(data.renewals['30d'].totalMrr)} MRR` : undefined}
          icon={Users}
          color="bg-teal-700"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Distribuzione per stage</CardTitle></CardHeader>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nessun dato.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i < chartData.length - 1 ? '#0d9488' : '#14b8a6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {data.problemStages.length > 0 && (
          <Card padding="none">
            <CardHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
              <CardTitle>Clienti con problemi</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-slate-100">
              {data.problemStages.map(s => (
                <li key={s.id} className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm text-slate-700">{s.label}</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                    {s.count}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="flex gap-3">
        <Link href="/onboarding-hub/pipeline" className="text-sm text-teal-600 hover:underline flex items-center gap-1">
          Vai alla Pipeline <ChevronRight className="w-4 h-4" />
        </Link>
        <Link href="/onboarding-hub/clients" className="text-sm text-teal-600 hover:underline flex items-center gap-1">
          Vai ai Clienti <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
