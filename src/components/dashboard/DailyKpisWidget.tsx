'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { TrendingUp, TrendingDown, DollarSign, Users, BarChart3, Zap } from 'lucide-react';
import type { DailyKpis } from '@/types/dashboard';

const formatEur = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

function ChangeBadge({ pct }: { pct: number }) {
  if (pct === 0) return null;
  const isPositive = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? '+' : ''}{pct}%
    </span>
  );
}

function MetabaseKpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: React.ReactNode;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {sub && <div className="mt-1">{sub}</div>}
        </div>
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

export function DailyKpisWidget() {
  const { token } = useAuthStore();
  const [data, setData] = useState<DailyKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    dashboardDataApi.dailyKpis(token)
      .then(res => setData(res.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>KPI Giornalieri (da Metabase)</CardTitle></CardHeader>
        <div className="h-20 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">KPI Giornalieri (da Metabase)</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetabaseKpiCard
          title="MRR Abbonamenti"
          value={formatEur(data.dashboardCards.subscriptionMRR)}
          icon={DollarSign}
          color="bg-green-600"
        />
        <MetabaseKpiCard
          title="Revenue mese"
          value={formatEur(data.revenue.currentMonth)}
          sub={<ChangeBadge pct={data.revenue.monthChangePct} />}
          icon={BarChart3}
          color="bg-emerald-500"
        />
        <MetabaseKpiCard
          title="Nuovi clienti mese"
          value={data.newCustomers.monthCount}
          sub={<ChangeBadge pct={data.newCustomers.monthChangePct} />}
          icon={Users}
          color="bg-teal-600"
        />
        <MetabaseKpiCard
          title="YTD Revenue"
          value={formatEur(data.ytd.total)}
          sub={<ChangeBadge pct={data.ytd.yoyChangePct} />}
          icon={TrendingUp}
          color="bg-green-700"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card padding="md">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Revenue oggi</p>
          <p className="text-lg font-bold text-slate-900">{formatEur(data.revenue.today)}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Revenue ieri</p>
          <p className="text-lg font-bold text-slate-900">{formatEur(data.revenue.yesterday)}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Nuovo ARR mese</p>
          <p className="text-lg font-bold text-slate-900">{formatEur(data.newARR.month)}</p>
          <ChangeBadge pct={data.newARR.monthChangePct} />
        </Card>
      </div>
    </div>
  );
}
