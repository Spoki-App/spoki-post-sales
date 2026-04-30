'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { industriesApi } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { getIndustryVisual, industryStableId } from '@/lib/industry-visuals';
import { IndustryClientsModal } from '@/components/industries/IndustryClientsModal';
import { Building2, ChevronRight, LayoutGrid, PieChart as PieChartIcon, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type IndustryRow = { key: string | null; label: string; clientCount: number };

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function truncateLabel(s: string, max = 26) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function OverviewPanorama() {
  const { token, user } = useAuthStore();
  const [viewAll, setViewAll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalClients: number;
    activeIndustries: number;
  } | null>(null);
  const [industries, setIndustries] = useState<IndustryRow[]>([]);
  const [industryModalId, setIndustryModalId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [st, li] = await Promise.all([
        industriesApi.stats(token, { viewAll: viewAll || undefined }),
        industriesApi.list(token, { viewAll: viewAll || undefined }),
      ]);
      if (st.data) {
        setStats({
          totalClients: st.data.totalClients,
          activeIndustries: st.data.activeIndustries,
        });
      }
      setIndustries(li.data?.industries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [token, viewAll]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setIndustryModalId(null);
  }, [viewAll]);

  const barChartData = useMemo(() => {
    const sorted = [...industries].sort((a, b) => b.clientCount - a.clientCount);
    return sorted.map(row => {
      const sid = industryStableId(row.key);
      const visual = getIndustryVisual(row.key, row.label);
      const dimmed = industryModalId != null && industryModalId !== sid;
      return {
        sid,
        labelShort: truncateLabel(row.label, 22),
        labelFull: row.label,
        count: row.clientCount,
        fill: dimmed ? `${visual.bar}55` : visual.bar,
        stroke: industryModalId === sid ? '#7c3aed' : 'transparent',
        strokeWidth: industryModalId === sid ? 2 : 0,
      };
    });
  }, [industries, industryModalId]);

  const pieData = useMemo(() => {
    const sorted = [...industries].sort((a, b) => b.clientCount - a.clientCount);
    const topN = 8;
    const top = sorted.slice(0, topN);
    const rest = sorted.slice(topN);
    const restSum = rest.reduce((s, r) => s + r.clientCount, 0);
    const slices: Array<{ name: string; value: number; fill: string; sid: string }> = top.map(
      row => {
        const visual = getIndustryVisual(row.key, row.label);
        const sid = industryStableId(row.key);
        return {
          name: truncateLabel(row.label, 18),
          value: row.clientCount,
          fill: visual.bar,
          sid,
        };
      }
    );
    if (restSum > 0) {
      slices.push({
        name: 'Altri',
        value: restSum,
        fill: '#cbd5e1',
        sid: '__other_slice__',
      });
    }
    return slices;
  }, [industries]);

  const firstName = user?.displayName?.split(/\s+/)[0] ?? user?.email?.split('@')[0] ?? 'Team';

  if (!token) return null;

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Esplora il mix industry del portafoglio.{' '}
          <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-slate-600">
            <input
              type="checkbox"
              checked={viewAll}
              onChange={e => setViewAll(e.target.checked)}
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span>Portafoglio completo</span>
          </label>
        </p>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800 sm:flex">
            {firstName[0]!.toUpperCase()}
          </div>
          <div className="leading-tight text-right">
            <div className="font-medium text-slate-800">{user?.displayName ?? firstName}</div>
            <div className="text-xs text-slate-500">Customer Success</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:max-w-2xl">
            <KpiCard icon={Users} label="Clienti (portafoglio)" value={stats?.totalClients ?? 0} />
            <KpiCard
              icon={Building2}
              label="Industry attive (valorizzate)"
              value={stats?.activeIndustries ?? 0}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-3">
              <div className="mb-3 flex items-center gap-2 text-slate-800">
                <LayoutGrid className="h-4 w-4 text-violet-600" />
                <h2 className="text-sm font-semibold">Clienti per industry</h2>
              </div>
              {barChartData.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">Nessun cliente nel filtro.</p>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.min(440, Math.max(240, barChartData.length * 36))}
                >
                  <BarChart
                    data={barChartData}
                    layout="vertical"
                    margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="labelShort"
                      width={118}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(139, 92, 246, 0.06)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const p = payload[0].payload as (typeof barChartData)[0];
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                            <p className="font-medium text-slate-800">{p.labelFull}</p>
                            <p className="tabular-nums text-slate-600">{p.count} clienti</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                      {barChartData.map(entry => (
                        <Cell
                          key={entry.sid}
                          fill={entry.fill}
                          stroke={entry.stroke}
                          strokeWidth={entry.strokeWidth}
                          className="cursor-pointer transition-opacity hover:opacity-90"
                          onClick={() => setIndustryModalId(entry.sid)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Clic su una barra per aprire l’elenco clienti (ordinato per MRR).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-2">
              <div className="mb-2 flex items-center gap-2 text-slate-800">
                <PieChartIcon className="h-4 w-4 text-violet-600" />
                <h2 className="text-sm font-semibold">Quota sul portafoglio</h2>
              </div>
              {pieData.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">Nessun dato.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={84}
                      paddingAngle={1}
                      stroke="transparent"
                      animationDuration={400}
                    >
                      {pieData.map((entry, i) => (
                        <Cell
                          key={`${entry.sid}-${i}`}
                          fill={entry.fill}
                          opacity={
                            industryModalId &&
                            industryModalId !== entry.sid &&
                            entry.sid !== '__other_slice__'
                              ? 0.35
                              : 1
                          }
                          className={entry.sid !== '__other_slice__' ? 'cursor-pointer' : ''}
                          onClick={() => {
                            if (entry.sid === '__other_slice__') return;
                            setIndustryModalId(entry.sid);
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const p = payload[0].payload as (typeof pieData)[0];
                        const total = pieData.reduce((s, x) => s + x.value, 0);
                        const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                            <p className="font-medium text-slate-800">{p.name}</p>
                            <p className="tabular-nums text-slate-600">
                              {p.value} clienti ({pct}%)
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <p className="text-center text-xs text-slate-400">
                Le fette più grandi sono le industry più rappresentate. Clic per aprire i clienti.
              </p>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Industry</h2>
            {industries.length === 0 ? (
              <p className="text-sm text-slate-400">Nessun segmento disponibile.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {industries.map(row => {
                  const sid = industryStableId(row.key);
                  const visual = getIndustryVisual(row.key, row.label);
                  const { Icon } = visual;
                  const total = stats?.totalClients ?? 0;
                  const pct = total > 0 ? Math.round((row.clientCount / total) * 100) : 0;
                  return (
                    <button
                      key={sid}
                      type="button"
                      onClick={() => setIndustryModalId(sid)}
                      className={cn(
                        'group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all',
                        'hover:border-violet-300/80 hover:shadow-md'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
                            visual.iconWrap
                          )}
                        >
                          <Icon className="h-6 w-6" aria-hidden />
                        </div>
                        <span className="text-right">
                          <span className="block text-2xl font-semibold tabular-nums text-slate-900">
                            {row.clientCount}
                          </span>
                          <span className="text-xs font-medium text-violet-600">{pct}%</span>
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-slate-800">
                        {row.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Clienti nel portafoglio</p>
                      <ChevronRight className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-400" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </>
      )}

      {industryModalId != null && (
        <IndustryClientsModal
          key={`${industryModalId}-${viewAll}`}
          stableIndustryId={industryModalId}
          industryLabel={
            industries.find(r => industryStableId(r.key) === industryModalId)?.label ?? 'Industry'
          }
          portfolioClientCount={
            industries.find(r => industryStableId(r.key) === industryModalId)?.clientCount ?? null
          }
          token={token}
          viewAll={viewAll}
          onClose={() => setIndustryModalId(null)}
        />
      )}
    </div>
  );
}
