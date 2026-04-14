'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { reportsApi, alertsApi, clientsApi, aiApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Users, Calendar, Bell, ChevronRight, CheckSquare, Sparkles, Loader2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { it } from 'date-fns/locale';
import { SyncButton } from '@/components/ui/SyncButton';
import { formatMrrDisplay } from '@/lib/format/mrr';
import { getOwnerByEmail, isAdminEmail } from '@/lib/config/owners';
import type { ClientWithHealth, Alert } from '@/types';
import { NrrGrrCards } from '@/components/dashboard/NrrGrrCards';
import { DailyKpisWidget } from '@/components/dashboard/DailyKpisWidget';
import { ChurnRiskPanel } from '@/components/dashboard/ChurnRiskPanel';

interface SummaryData {
  totalClients: number;
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

function clientMrrLine(mrr: number | null) {
  if (mrr == null || !Number.isFinite(mrr)) return null;
  return <p className="text-xs text-slate-400">{formatMrrDisplay(mrr)}/mese</p>;
}

export default function DashboardPage() {
  const { token, user } = useAuthStore();
  const isAdmin = !getOwnerByEmail(user?.email ?? '') || isAdminEmail(user?.email);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [previewClients, setPreviewClients] = useState<ClientWithHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sumRes, alertsRes, clientsRes] = await Promise.all([
        reportsApi.summary(token),
        alertsApi.list(token, { resolved: false }),
        clientsApi.list(token, isAdmin ? { viewAll: true } : {}),
      ]);
      if (sumRes.data) setSummary(sumRes.data as unknown as SummaryData);
      setRecentAlerts(alertsRes.data.slice(0, 5));
      setPreviewClients(clientsRes.data.slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const openTasks = summary
    ? Object.values(summary.tasks).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: it })}
          </p>
        </div>
        <SyncButton
          secret={process.env.NEXT_PUBLIC_CRON_SECRET ?? 'spoki-cron-2026'}
          onComplete={load}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Clienti totali"
          value={summary?.totalClients ?? '—'}
          icon={Users}
          color="bg-emerald-600"
        />
        <KpiCard
          title="Alert attivi"
          value={summary?.openAlerts ?? 0}
          icon={Bell}
          color="bg-emerald-500"
        />
        <KpiCard
          title="Rinnovi 30 gg"
          value={summary?.renewals?.['30d']?.count ?? 0}
          sub={summary?.renewals?.['30d'] ? `${formatMrr(summary.renewals['30d'].totalMrr)} MRR` : undefined}
          icon={Calendar}
          color="bg-emerald-700"
        />
        <KpiCard
          title="Task aperti"
          value={openTasks}
          icon={CheckSquare}
          color="bg-emerald-800"
        />
      </div>

      <DailyKpisWidget />

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <NrrGrrCards />
        <ChurnRiskPanel />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <Card padding="none">
          <CardHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
            <CardTitle>Clienti</CardTitle>
            <Link href="/clients" className="text-xs text-emerald-600 hover:underline">Vedi tutti</Link>
          </CardHeader>
          {previewClients.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Nessun cliente in elenco.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {previewClients.map(c => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      {clientMrrLine(c.mrr)}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="none">
          <CardHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
            <CardTitle>Alert recenti</CardTitle>
            <Link href="/alerts" className="text-xs text-emerald-600 hover:underline">Vedi tutti</Link>
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
                      <Link href={`/clients/${alert.clientId}`} className="text-xs text-emerald-600 hover:underline font-medium">
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

      <PortfolioInsightsPanel />
    </div>
  );
}

function PortfolioInsightsPanel() {
  const { token } = useAuthStore();
  const [insights, setInsights] = useState<{
    overview: string;
    riskDistribution: { low: number; medium: number; high: number; critical: number };
    topRisks: Array<{ client: string; reason: string }>;
    topOpportunities: Array<{ client: string; reason: string }>;
    recommendations: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!token || loading) return;
    setLoading(true);
    try {
      const res = await aiApi.portfolioInsights(token);
      setInsights(res.data ?? null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <CardTitle>AI Portfolio Insights</CardTitle>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {insights ? 'Aggiorna' : 'Genera'}
        </button>
      </div>

      {!insights && !loading && (
        <p className="text-sm text-slate-400 text-center py-6">Clicca "Genera" per ottenere un&apos;analisi AI del tuo portfolio clienti.</p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
        </div>
      )}

      {insights && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">{insights.overview}</p>

          <div className="grid grid-cols-4 gap-2">
            {([['low', 'Basso', 'bg-emerald-100 text-emerald-700'], ['medium', 'Medio', 'bg-amber-100 text-amber-700'], ['high', 'Alto', 'bg-orange-100 text-orange-700'], ['critical', 'Critico', 'bg-red-100 text-red-700']] as const).map(([key, label, cls]) => (
              <div key={key} className={`rounded-lg px-3 py-2 text-center ${cls}`}>
                <p className="text-lg font-bold">{insights.riskDistribution[key]}</p>
                <p className="text-xs">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {insights.topRisks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-700 mb-2">Clienti a rischio</p>
                <ul className="space-y-1.5">
                  {insights.topRisks.map((r, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">{r.client}</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {insights.topOpportunities.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-700 mb-2">Opportunita</p>
                <ul className="space-y-1.5">
                  {insights.topOpportunities.map((o, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">{o.client}</span> — {o.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {insights.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Raccomandazioni strategiche</p>
              <ul className="space-y-1">
                {insights.recommendations.map((r, i) => (
                  <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                    <span className="text-purple-500 shrink-0">{i + 1}.</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
