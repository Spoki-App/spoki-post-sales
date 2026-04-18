'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  callReportsApi,
  type CallReportType,
  type CallSummaryResponse,
} from '@/lib/api/client';

export interface CallReportsSummaryProps {
  type: CallReportType;
  token: string | null;
  days: number;
  owner?: string;
  from?: string;
  to?: string;
  checkpointLabels: Record<string, string>;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function rateColor(v: number): string {
  if (v >= 0.8) return 'text-emerald-600';
  if (v >= 0.5) return 'text-amber-600';
  return 'text-red-600';
}

function rateBg(v: number): string {
  if (v >= 0.8) return 'bg-emerald-500';
  if (v >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

export function CallReportsSummary({
  type,
  token,
  days,
  owner,
  from,
  to,
  checkpointLabels,
}: CallReportsSummaryProps) {
  const [data, setData] = useState<CallSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    callReportsApi
      .summary(token, type, {
        days,
        ...(owner ? { owner } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      })
      .then(res => {
        if (!cancelled) setData(res.data ?? null);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Errore caricamento panoramica');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, type, days, owner, from, to]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Caricamento panoramica...
      </div>
    );
  }
  if (error) return <p className="text-red-500 text-sm py-4">{error}</p>;
  if (!data) return null;

  const { totals, checkpointPassRates, ownerLeaderboard, clientLeaderboard, weeklyTrend } = data;
  const topClients = clientLeaderboard.slice(0, 5);
  const flopClients = clientLeaderboard
    .slice(-5)
    .reverse()
    .filter(c => !topClients.some(t => t.clientId === c.clientId));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Chiamate totali" value={String(totals.totalCalls)} />
        <KpiCard
          label="Analizzate"
          value={String(totals.analyzedCount)}
          hint={
            totals.totalCalls > 0
              ? `${pct(totals.analyzedCount / totals.totalCalls)} del totale`
              : undefined
          }
        />
        <KpiCard
          label="In attesa"
          value={String(totals.pendingCount)}
          hint={totals.pendingCount > 0 ? 'da analizzare' : undefined}
        />
        <KpiCard
          label="No Fathom"
          value={String(totals.noFathomCount)}
          tone={totals.noFathomCount > 0 ? 'warn' : undefined}
        />
        <KpiCard
          label="Pass rate medio"
          value={pct(totals.avgPassRate)}
          hint={
            totals.analyzedCount > 0
              ? `${totals.avgPassedCount.toFixed(1)}/${totals.totalCheckpoints} checkpoint`
              : undefined
          }
          tone={
            totals.avgPassRate >= 0.8 ? 'good' : totals.avgPassRate >= 0.5 ? 'warn' : 'bad'
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="lg">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Pass rate per checkpoint</h3>
          {totals.analyzedCount === 0 ? (
            <p className="text-sm text-slate-400">Nessuna analisi nel periodo</p>
          ) : (
            <div className="space-y-2.5">
              {checkpointPassRates.map(c => (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-700">{checkpointLabels[c.key] ?? c.key}</span>
                    <span className={`font-medium ${rateColor(c.passRate)}`}>
                      {pct(c.passRate)} ({c.passed}/{c.total})
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${rateBg(c.passRate)} transition-all`}
                      style={{ width: `${Math.round(c.passRate * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Trend settimanale</h3>
          {weeklyTrend.length === 0 ? (
            <p className="text-sm text-slate-400">Nessun dato nel periodo</p>
          ) : (
            <div className="space-y-1.5">
              {weeklyTrend.map(w => (
                <div key={w.weekStart} className="flex items-center gap-3 text-xs">
                  <span className="w-20 text-slate-500 shrink-0">{w.weekStart}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${rateBg(w.avgPassRate)}`}
                        style={{
                          width: `${w.analyzed > 0 ? Math.round(w.avgPassRate * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className={`w-12 text-right font-medium ${rateColor(w.avgPassRate)}`}>
                      {w.analyzed > 0 ? pct(w.avgPassRate) : '--'}
                    </span>
                  </div>
                  <span className="w-20 text-right text-slate-400 shrink-0">
                    {w.analyzed}/{w.total} call
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card padding="none">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Leaderboard owner</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="px-4 py-2.5 text-left font-semibold">Owner</th>
                <th className="px-4 py-2.5 text-right font-semibold">Chiamate</th>
                <th className="px-4 py-2.5 text-right font-semibold">Analizzate</th>
                <th className="px-4 py-2.5 text-right font-semibold">No Fathom</th>
                <th className="px-4 py-2.5 text-right font-semibold">In attesa</th>
                <th className="px-4 py-2.5 text-right font-semibold">Pass rate</th>
                <th className="px-4 py-2.5 text-right font-semibold">Media checkpoint</th>
              </tr>
            </thead>
            <tbody>
              {ownerLeaderboard.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    Nessun dato
                  </td>
                </tr>
              ) : (
                ownerLeaderboard.map(o => (
                  <tr
                    key={o.ownerId ?? 'unassigned'}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-2.5 text-slate-700">{o.ownerName}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{o.totalCalls}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{o.analyzedCount}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {o.noFathomCount > 0 ? (
                        <span className="text-amber-600">{o.noFathomCount}</span>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {o.pendingCount > 0 ? o.pendingCount : '--'}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${
                        o.analyzedCount > 0 ? rateColor(o.avgPassRate) : 'text-slate-400'
                      }`}
                    >
                      {o.analyzedCount > 0 ? pct(o.avgPassRate) : '--'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {o.analyzedCount > 0
                        ? `${o.avgPassedCount.toFixed(1)}/${o.totalCheckpoints}`
                        : '--'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {clientLeaderboard.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ClientPodium
            title="Top clienti per pass rate"
            tone="good"
            items={topClients}
          />
          {flopClients.length > 0 && (
            <ClientPodium
              title="Clienti con pass rate piu' basso"
              tone="bad"
              items={flopClients}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ClientPodium({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'good' | 'bad';
  items: Array<{
    clientId: string;
    clientName: string;
    clientHubspotId: string | null;
    totalCalls: number;
    analyzedCount: number;
    avgPassRate: number;
    avgPassedCount: number;
    totalCheckpoints: number;
    lastAnalyzedAt: string | null;
  }>;
}) {
  return (
    <Card padding="none">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className={`text-[10px] uppercase font-semibold ${tone === 'good' ? 'text-emerald-600' : 'text-red-500'}`}>
          {tone === 'good' ? 'Migliori' : 'Da seguire'}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((c, i) => (
          <div key={c.clientId} className="flex items-center justify-between px-5 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-5 text-xs text-slate-400 shrink-0">#{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm text-slate-700 truncate">{c.clientName}</p>
                <p className="text-[11px] text-slate-400">
                  {c.analyzedCount}/{c.totalCalls} call analizzate
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-semibold ${rateColor(c.avgPassRate)}`}>
                {pct(c.avgPassRate)}
              </p>
              <p className="text-[11px] text-slate-400">
                {c.avgPassedCount.toFixed(1)}/{c.totalCheckpoints}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const valueColor =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'bad'
          ? 'text-red-600'
          : 'text-slate-800';
  return (
    <Card padding="md">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${valueColor}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </Card>
  );
}
