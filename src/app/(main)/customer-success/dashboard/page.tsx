'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { customerSuccessApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Users,
  Euro,
  Workflow,
  PartyPopper,
  CalendarDays,
  ExternalLink,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function formatMrr(n: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl shrink-0 ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

const BAR_COLORS = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#f5f3ff'];

type CsDashboardData = {
  owner: { id: string; name: string };
  portfolio: { clientCount: number; totalMrr: number };
  renewals: Record<string, { count: number; totalMrr: number }>;
  pipeline: {
    inPipeline: number;
    completed: number;
    totalInCsFlow: number;
    eligibleToAddCount: number;
    byStage: Array<{ stage: string; label: string; count: number }>;
  };
  hubspotDashboard: { title: string; embedUrl: string; openUrl: string } | null;
};

export default function CsDashboardPage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CsDashboardData | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await customerSuccessApi.dashboards(token);
        if (res.data) setData(res.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore caricamento');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-red-600 text-sm">{error ?? 'Nessun dato'}</p>;
  }

  const { owner, portfolio, renewals, pipeline, hubspotDashboard } = data;
  const r30 = renewals?.['30d'];
  const r14 = renewals?.['14d'];
  const chartRows = pipeline.byStage.filter(d => d.count > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dashboard CS</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Portfolio di <span className="font-medium text-slate-900">{owner.name}</span>: report HubSpot in embed (se
            configurato) e riepilogo dati dall’app sotto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/customer-success/pipeline"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900"
          >
            Pipeline CS <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/customer-success/clients"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900"
          >
            Clienti CS <ArrowRight className="w-4 h-4" />
          </Link>
          {hubspotDashboard && (
            <a
              href={hubspotDashboard.openUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
            >
              Apri dashboard in HubSpot
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {hubspotDashboard ? (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="w-5 h-5 text-violet-600 shrink-0" />
              <span className="font-medium text-slate-900 truncate">{hubspotDashboard.title}</span>
            </div>
            <a
              href={hubspotDashboard.openUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-800 shrink-0"
            >
              Apri in HubSpot <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <div className="aspect-[16/10] w-full min-h-[min(70vh,640px)] bg-slate-100">
            <iframe
              title={hubspotDashboard.title}
              src={hubspotDashboard.embedUrl}
              className="w-full h-full min-h-[min(70vh,640px)] border-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        </Card>
      ) : (
        <Card className="p-4 border-dashed border-slate-200 bg-slate-50/80">
          <p className="text-sm text-slate-600">
            Nessuna dashboard HubSpot in embed per il tuo utente. Chiedi di aggiungere{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">CS_HUBSPOT_DASHBOARD_EMBED</code> in{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">cs-hubspot-dashboards.ts</code> con l’URL di
            incorporamento da Reporting.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Clienti in portfolio"
          value={portfolio.clientCount}
          icon={Users}
          color="bg-blue-600"
        />
        <KpiCard
          title="MRR portfolio"
          value={formatMrr(portfolio.totalMrr)}
          icon={Euro}
          color="bg-emerald-600"
        />
        <KpiCard
          title="In pipeline CS"
          value={pipeline.inPipeline}
          sub={
            pipeline.eligibleToAddCount > 0
              ? `${pipeline.eligibleToAddCount} senza posizione salvata in DB`
              : undefined
          }
          icon={Workflow}
          color="bg-violet-600"
        />
        <KpiCard
          title="Completati"
          value={pipeline.completed}
          sub={`${pipeline.totalInCsFlow} totali nella pipeline`}
          icon={PartyPopper}
          color="bg-teal-600"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card padding="none" className="overflow-hidden">
          <CardHeader className="px-5 pt-4 pb-2 border-b border-slate-100">
            <CardTitle>Pipeline per fase</CardTitle>
            <p className="text-xs text-slate-500 font-normal">Clienti in ogni step del percorso CS</p>
          </CardHeader>
          {chartRows.length === 0 ? (
            <p className="text-sm text-slate-500 px-5 py-10 text-center">
              Nessun cliente in pipeline. Aggiungine dalla{' '}
              <Link href="/customer-success/pipeline" className="text-violet-600 hover:underline">
                Pipeline CS
              </Link>
              .
            </p>
          ) : (
            <div className="h-[min(420px,55vh)] w-full px-2 pb-4 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartRows.map(d => ({ name: d.label, count: d.count }))}
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                  <XAxis type="number" allowDecimals={false} className="text-xs" />
                  <YAxis dataKey="name" type="category" width={124} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [Number(v ?? 0), 'Clienti']}
                    contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {chartRows.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-5 h-5 text-amber-600" />
            <div>
            <h3 className="text-sm font-semibold text-slate-900">Rinnovi (portfolio)</h3>
            <p className="text-xs text-slate-500">Prossimi 90 giorni, come sulla dashboard principale</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between gap-4">
              <span className="text-slate-600">14 giorni</span>
              <span className="font-medium text-slate-900 tabular-nums">
                {r14 ? `${r14.count} · ${formatMrr(r14.totalMrr)}` : '—'}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-slate-600">30 giorni</span>
              <span className="font-medium text-slate-900 tabular-nums">
                {r30 ? `${r30.count} · ${formatMrr(r30.totalMrr)}` : '—'}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-slate-600">90 giorni</span>
              <span className="font-medium text-slate-900 tabular-nums">
                {renewals?.['90d']
                  ? `${renewals['90d'].count} · ${formatMrr(renewals['90d'].totalMrr)}`
                  : '—'}
              </span>
            </li>
          </ul>
        </Card>
      </div>

      <p className="text-xs text-slate-500">
        I KPI sotto derivano da clienti con company owner = te e pipeline CS in Postgres. L’        iframe sopra usa la dashboard Reporting HubSpot configurata per il tuo owner id (se HubSpot blocca
        l’embed, usa il link «Apri in HubSpot»).
      </p>
    </div>
  );
}
