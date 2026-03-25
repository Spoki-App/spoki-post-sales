'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { reportsApi, alertsApi, clientsApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { Badge } from '@/components/ui/Badge';
import { AlertTriangle, Users, Calendar, Bell, ChevronRight } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { it } from 'date-fns/locale';
import { SyncButton } from '@/components/ui/SyncButton';
import { getOwnerByEmail } from '@/lib/config/owners';
import type { ClientWithHealth, Alert, HealthStatus } from '@/types';

interface SummaryData {
  totalClients: number;
  health: {
    green: { count: number; totalMrr: number };
    yellow: { count: number; totalMrr: number };
    red: { count: number; totalMrr: number };
  };
  openAlerts: number;
  tasks: Record<string, number>;
  renewals: Record<string, { count: number; totalMrr: number }>;
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

function formatMrr(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export default function DashboardPage() {
  const { token, user } = useAuthStore();
  const isAdmin = !getOwnerByEmail(user?.email ?? '');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [atRiskClients, setAtRiskClients] = useState<ClientWithHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sumRes, alertsRes, clientsRes] = await Promise.all([
        reportsApi.summary(token),
        alertsApi.list(token, { resolved: false }),
        clientsApi.list(token, { status: 'red' }),
      ]);
      if (sumRes.data) setSummary(sumRes.data as unknown as SummaryData);
      setRecentAlerts(alertsRes.data.slice(0, 5));
      setAtRiskClients(clientsRes.data.slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const mrrAtRisk = summary ? summary.health.red.totalMrr + summary.health.yellow.totalMrr : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: it })}
          </p>
        </div>
        {isAdmin && (
          <SyncButton
            secret={process.env.NEXT_PUBLIC_CRON_SECRET ?? 'spoki-cron-2026'}
            onComplete={load}
          />
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Clienti totali"
          value={summary?.totalClients ?? '—'}
          sub={`${summary?.health.green.count ?? 0} in salute`}
          icon={Users}
          color="bg-blue-600"
        />
        <KpiCard
          title="Clienti critici"
          value={summary?.health.red.count ?? 0}
          sub={summary ? `${formatMrr(summary.health.red.totalMrr)} MRR a rischio` : undefined}
          icon={AlertTriangle}
          color="bg-red-500"
        />
        <KpiCard
          title="Alert attivi"
          value={summary?.openAlerts ?? 0}
          icon={Bell}
          color="bg-amber-500"
        />
        <KpiCard
          title="Rinnovi 30 gg"
          value={summary?.renewals?.['30d']?.count ?? 0}
          sub={summary?.renewals?.['30d'] ? `${formatMrr(summary.renewals['30d'].totalMrr)} MRR` : undefined}
          icon={Calendar}
          color="bg-emerald-600"
        />
      </div>

      {/* Health split */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {(['green', 'yellow', 'red'] as HealthStatus[]).map(status => (
            <Card key={status} padding="md">
              <div className="flex items-center justify-between mb-2">
                <HealthBadge status={status} size="sm" />
                <span className="text-2xl font-bold text-slate-900">{summary.health[status].count}</span>
              </div>
              <p className="text-xs text-slate-500">{formatMrr(summary.health[status].totalMrr)} MRR</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Clients at risk */}
        <Card padding="none">
          <CardHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
            <CardTitle>Clienti critici</CardTitle>
            <Link href="/clients?status=red" className="text-xs text-blue-600 hover:underline">Vedi tutti</Link>
          </CardHeader>
          {atRiskClients.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Nessun cliente critico.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {atRiskClients.map(c => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      {c.mrr && <p className="text-xs text-slate-400">{formatMrr(c.mrr)}/mese</p>}
                    </div>
                    {c.healthScore && (
                      <HealthBadge status={c.healthScore.status as HealthStatus} score={c.healthScore.score} size="sm" />
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent alerts */}
        <Card padding="none">
          <CardHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
            <CardTitle>Alert recenti</CardTitle>
            <Link href="/alerts" className="text-xs text-blue-600 hover:underline">Vedi tutti</Link>
          </CardHeader>
          {recentAlerts.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Nessun alert attivo.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentAlerts.map(alert => (
                <li key={alert.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge
                      variant={alert.severity === 'critical' || alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'info'}
                      size="sm"
                    >
                      {alert.severity}
                    </Badge>
                    {alert.clientName && (
                      <Link href={`/clients/${alert.clientId}`} className="text-xs text-blue-600 hover:underline font-medium">
                        {alert.clientName}
                      </Link>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-1">{alert.message}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDistanceToNow(new Date(alert.triggeredAt), { addSuffix: true, locale: it })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
