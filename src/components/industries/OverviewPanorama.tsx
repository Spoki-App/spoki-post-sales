'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { industriesApi } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import {
  clientSegmentFromRow,
  clientUxiStatusFromRow,
  prettyIndustryTitle,
} from '@/lib/services/industries-segment';
import {
  ArrowRight,
  BarChart3,
  Building2,
  ChevronRight,
  FileText,
  Filter,
  MoreHorizontal,
  Search,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';

const PREVIEW_INDUSTRY_COLS = 4;
const PREVIEW_CLIENTS_PER_COL = 4;

type ClientRow = {
  id: string;
  name: string;
  plan: string | null;
  mrr: number | null;
  onboardingStatus: string | null;
  churnRisk: string | null;
  csm: { label: string | null };
  health: { score: number | null; status: string | null };
  engagement90d: number;
};

type Group = { key: string | null; label: string; clients: ClientRow[] };

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendNeutral,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  trend?: string | null;
  trendNeutral?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Icon className="h-4 w-4" />
        </div>
        {trend != null && trend !== '' && trend !== '—' && (
          <span
            className={cn(
              'text-xs font-medium',
              trendNeutral ? 'text-slate-400' : 'text-emerald-600'
            )}
          >
            {trend}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function buildKanbanColumns(groups: Group[], maxCol: number) {
  const withKey = groups.filter(g => g.key != null && g.clients.length > 0);
  const unassigned = groups.find(g => g.key == null);
  const sorted = [...withKey].sort((a, b) => b.clients.length - a.clients.length);
  const top = sorted.slice(0, maxCol);
  const rest = sorted.slice(maxCol);
  const merged: Group[] = [...top];
  if (rest.length > 0 && unassigned) {
    const combinedClients = [
      ...rest.flatMap(r => r.clients),
      ...unassigned.clients,
    ];
    merged.push({
      key: '__other__',
      label: 'Altre industry',
      clients: combinedClients,
    });
  } else if (rest.length > 0) {
    merged.push({
      key: '__other__',
      label: 'Altre industry',
      clients: rest.flatMap(r => r.clients),
    });
  } else if (unassigned && unassigned.clients.length > 0) {
    merged.push({
      key: null,
      label: 'Non classificato',
      clients: unassigned.clients,
    });
  }
  return merged;
}

export function OverviewPanorama() {
  const { token, user } = useAuthStore();
  const [viewAll, setViewAll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kanbanQ, setKanbanQ] = useState('');
  const [stats, setStats] = useState<{
    totalClients: number;
    activeIndustries: number;
    useCaseCount: number;
    caseStudyCount: number;
    qbrGeneratedCount: number;
  } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [library, setLibrary] = useState<{
    useCases: Array<{ id: string; title: string; summary: string | null; sourceUrl: string; industry: string; tags: string[] }>;
    caseStudies: Array<{ id: string; title: string; summary: string | null; sourceUrl: string; industry: string; tags: string[] }>;
  }>({ useCases: [], caseStudies: [] });
  const [libTab, setLibTab] = useState<'use_case' | 'case_study'>('use_case');
  const [qbrIndustry, setQbrIndustry] = useState('');
  const [qbrData, setQbrData] = useState<{
    topClients: Array<{ id: string; name: string; composite: number; engagement90d: number; mrr: number | null }>;
    sampleSize: number;
    benchmark: {
      engagement90d: { p50: number | null; p75: number | null; min: number | null; max: number | null };
      healthScore: { p50: number | null; p75: number | null };
    };
  } | null>(null);
  const [qbrLoading, setQbrLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [st, cl, uList, cList, ind] = await Promise.all([
        industriesApi.stats(token, { viewAll: viewAll || undefined }),
        industriesApi.clients(token, { viewAll: viewAll || undefined, sort: 'name', dir: 'asc' }),
        industriesApi.library(token, { type: 'use_case' }),
        industriesApi.library(token, { type: 'case_study' }),
        industriesApi.list(token, { viewAll: viewAll || undefined }),
      ]);
      if (st.data) setStats(st.data);
      if (cl.data) setGroups(cl.data.groups as Group[]);
      const mapItem = (r: {
        id: string;
        title: string;
        summary: string | null;
        sourceUrl: string;
        industrySpokiMatch: string | null;
        metadata: unknown;
      }) => {
        const meta = r.metadata as { tags?: string[]; feature?: string; integration?: string } | null;
        const tags = [meta?.feature, meta?.integration, ...(Array.isArray(meta?.tags) ? meta.tags : [])]
          .filter((x): x is string => Boolean(x && String(x).trim()))
          .slice(0, 3);
        return {
          id: r.id,
          title: r.title,
          summary: r.summary,
          sourceUrl: r.sourceUrl,
          industry: prettyIndustryTitle(r.industrySpokiMatch),
          tags: tags.length ? tags : ['Spoki'],
        };
      };
      setLibrary({
        useCases: (uList.data?.items ?? []).slice(0, 12).map(mapItem),
        caseStudies: (cList.data?.items ?? []).slice(0, 12).map(mapItem),
      });
      if (ind.data?.industries.length) {
        const first = ind.data.industries.find(i => i.key);
        if (first?.key) setQbrIndustry(first.key);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [token, viewAll]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadQbr = useCallback(async () => {
    if (!token || !qbrIndustry.trim()) {
      setQbrData(null);
      return;
    }
    setQbrLoading(true);
    try {
      const res = await industriesApi.benchmark(token, qbrIndustry.trim(), { viewAll: viewAll || undefined });
      if (res.data) {
        setQbrData({
          sampleSize: res.data.sampleSize,
          benchmark: res.data.benchmark,
          topClients: res.data.topClients.slice(0, 4).map(t => ({
            id: t.id,
            name: t.name,
            composite: t.composite,
            engagement90d: t.engagement90d,
            mrr: t.mrr,
          })),
        });
      }
    } catch {
      setQbrData(null);
    } finally {
      setQbrLoading(false);
    }
  }, [token, qbrIndustry, viewAll]);

  useEffect(() => {
    void loadQbr();
  }, [loadQbr]);

  const boardColumns = useMemo(() => {
    const q = kanbanQ.trim().toLowerCase();
    const filtered: Group[] = groups.map(g => ({
      ...g,
      clients: g.clients.filter(c => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || (c.csm.label ?? '').toLowerCase().includes(q);
      }),
    }));
    return buildKanbanColumns(filtered, PREVIEW_INDUSTRY_COLS);
  }, [groups, kanbanQ]);

  const firstName = user?.displayName?.split(/\s+/)[0] ?? user?.email?.split('@')[0] ?? 'Team';

  if (!token) return null;

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-500">
          Tutte le industry e i relativi insight, clienti, casi d&apos;uso e QBR.{' '}
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
          <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-800 font-semibold text-xs">
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              icon={Users}
              label="Clienti (portafoglio)"
              value={stats?.totalClients ?? 0}
              trend="—"
              trendNeutral
            />
            <KpiCard
              icon={Building2}
              label="Industry attive"
              value={stats?.activeIndustries ?? 0}
              trend="—"
              trendNeutral
            />
            <KpiCard
              icon={Zap}
              label="Casi d'uso (in libreria)"
              value={stats?.useCaseCount ?? 0}
              trend="—"
              trendNeutral
            />
            <KpiCard
              icon={FileText}
              label="Case study (in libreria)"
              value={stats?.caseStudyCount ?? 0}
              trend="—"
              trendNeutral
            />
            <KpiCard
              icon={BarChart3}
              label="Bozze QBR salvate"
              value={stats?.qbrGeneratedCount ?? 0}
              trend="—"
              trendNeutral
            />
          </div>

          {/* 1 – Clienti per industry */}
          <section>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-light leading-none text-slate-200">1</span>
              <h2 className="text-base font-semibold text-slate-900">Clienti per industry</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              I clienti sono raggruppati per <span className="font-medium">industry_spoki</span> (HubSpot).
            </p>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="relative max-w-sm flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={kanbanQ}
                  onChange={e => setKanbanQ(e.target.value)}
                  placeholder="Cerca cliente…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filtra
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {boardColumns.length === 0 && (
                <p className="text-sm text-slate-500">Nessun cliente in portfolio. Sincronizza HubSpot o aggiungi industry_spoki.</p>
              )}
              {boardColumns.map(col => {
                const show = col.clients.slice(0, PREVIEW_CLIENTS_PER_COL);
                const title =
                  col.key === '__other__'
                    ? 'Altre industry'
                    : col.key
                      ? prettyIndustryTitle(col.key)
                      : col.label;
                const pill = col.key === '__other__' ? 'violet' : 'emerald';
                return (
                  <div
                    key={String(col.key ?? 'un')}
                    className="w-[260px] shrink-0 rounded-2xl border border-slate-200/90 bg-slate-50/80 shadow-sm"
                  >
                    <div className="border-b border-slate-200/80 px-3 py-2.5">
                      <h3 className="text-sm font-semibold text-slate-800 line-clamp-1">{title}</h3>
                      <span
                        className={cn(
                          'mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          pill === 'emerald' ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'
                        )}
                      >
                        {col.clients.length} {col.clients.length === 1 ? 'cliente' : 'clienti'}
                      </span>
                    </div>
                    <ul className="max-h-[280px] space-y-0 overflow-y-auto p-2">
                      {show.map(c => {
                        const seg = clientSegmentFromRow(c.plan, c.mrr);
                        const uxi = clientUxiStatusFromRow(c.churnRisk, c.onboardingStatus, c.health);
                        return (
                          <li
                            key={c.id}
                            className="mb-1.5 rounded-xl border border-slate-200/60 bg-white p-2.5 shadow-sm"
                          >
                            <Link href={`/clients/${c.id}`} className="text-sm font-medium text-slate-900 hover:text-violet-600">
                              {c.name}
                            </Link>
                            <p className="text-xs text-slate-500">CSM: {c.csm.label ?? '—'}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {seg}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 rounded-full',
                                    uxi.dot === 'emerald' && 'bg-emerald-500',
                                    uxi.dot === 'amber' && 'bg-amber-500',
                                    uxi.dot === 'rose' && 'bg-rose-500'
                                  )}
                                />
                                {uxi.label}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="px-2 pb-2.5">
                      <Link
                        href={col.key && col.key !== '__other__' ? `/industries/clients?industry=${encodeURIComponent(col.key)}` : '/industries/clients'}
                        className="flex w-full items-center justify-center gap-0.5 rounded-lg py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50"
                      >
                        Vedi tutti
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2 – Library */}
          <section>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-light leading-none text-slate-200">2</span>
              <h2 className="text-base font-semibold text-slate-900">Casi d&apos;uso & case study</h2>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Libreria interna, filtrata per industry.</p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setLibTab('use_case')}
                    className={cn(
                      'rounded-lg px-3 py-1.5 transition-colors',
                      libTab === 'use_case' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600'
                    )}
                  >
                    Casi d&apos;uso ({stats?.useCaseCount ?? library.useCases.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLibTab('case_study')}
                    className={cn(
                      'rounded-lg px-3 py-1.5 transition-colors',
                      libTab === 'case_study' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600'
                    )}
                  >
                    Case study ({stats?.caseStudyCount ?? library.caseStudies.length})
                  </button>
                </div>
                <select className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 shadow-sm" disabled>
                  <option>Tutte le industry</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {(libTab === 'use_case' ? library.useCases : library.caseStudies)
                .slice(0, 3)
                .map(item => (
                  <a
                    key={item.id}
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
                      {item.industry}
                    </p>
                    <h3 className="mt-2 text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-violet-700">
                      {item.title}
                    </h3>
                    {item.summary && <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{item.summary}</p>}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {item.tags.map(t => (
                        <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {t}
                        </span>
                      ))}
                    </div>
                  </a>
                ))}
            </div>
            <Link
              href="/industries/library"
              className="mt-4 inline-flex items-center gap-0.5 text-sm font-medium text-violet-600 hover:underline"
            >
              Vedi tutti i casi d&apos;uso
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          {/* 3 – QBR */}
          <section>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-light leading-none text-slate-200">3</span>
              <h2 className="text-base font-semibold text-slate-900">QBR per industry</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="space-y-3 lg:col-span-3">
                <div className="max-w-xs">
                  <label className="text-xs text-slate-500">Seleziona industry</label>
                  <select
                    value={qbrIndustry}
                    onChange={e => setQbrIndustry(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="">—</option>
                    {groups
                      .filter(g => g.key)
                      .map(g => (
                        <option key={g.key!} value={g.key!}>
                          {prettyIndustryTitle(g.key!)}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {qbrLoading ? (
                    <p className="text-sm text-slate-500 col-span-4">Caricamento benchmark…</p>
                  ) : qbrData && qbrData.sampleSize > 0 && qbrData.benchmark ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                        <p className="text-lg font-bold tabular-nums text-slate-900">
                          {qbrData.benchmark.engagement90d.p75 != null
                            ? qbrData.benchmark.engagement90d.p75
                            : '—'}
                        </p>
                        <p className="text-[10px] leading-tight text-slate-500">Interazioni 90g (p75) · CRM</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                        <p className="text-lg font-bold tabular-nums text-slate-900">
                          {qbrData.benchmark.healthScore.p75 != null
                            ? `${qbrData.benchmark.healthScore.p75}`
                            : '—'}
                        </p>
                        <p className="text-[10px] leading-tight text-slate-500">Health score (p75)</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                        <p className="text-lg font-bold tabular-nums text-slate-900">
                          {qbrData.benchmark.healthScore.p50 != null
                            ? `${qbrData.benchmark.healthScore.p50}`
                            : '—'}
                        </p>
                        <p className="text-[10px] leading-tight text-slate-500">Health (p50) · riferimento</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                        <p className="text-lg font-bold tabular-nums text-slate-900">
                          {qbrData.benchmark.engagement90d.p50 != null &&
                          qbrData.benchmark.engagement90d.p50 > 0 &&
                          qbrData.benchmark.engagement90d.p75 != null
                            ? `${(qbrData.benchmark.engagement90d.p75 / qbrData.benchmark.engagement90d.p50).toFixed(1)}x`
                            : '—'}
                        </p>
                        <p className="text-[10px] leading-tight text-slate-500">Rapporto p75 / p50 · engagement</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 col-span-4">
                      Seleziona un&apos;industry con almeno un cliente o sincronizza i dati.
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top clienti di riferimento</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(qbrData?.topClients ?? []).map(c => (
                      <Link
                        key={c.id}
                        href={`/clients/${c.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm hover:border-violet-200"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                          {c.name[0]!.toUpperCase()}
                        </span>
                        {c.name}
                      </Link>
                    ))}
                    {!qbrLoading && (!qbrData?.topClients || qbrData.topClients.length === 0) && (
                      <span className="text-xs text-slate-400">Nessun dato per questa industry.</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-b from-violet-50/80 to-white p-5 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Genera QBR</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Crea una bozza QBR per questa industry, basata sui benchmark interni.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/industries/qbr"
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-violet-700"
                  >
                    <Zap className="h-4 w-4" />
                    Genera QBR
                  </Link>
                  <Link
                    href="/industries/qbr"
                    className="mt-2 flex items-center justify-center gap-0.5 text-xs font-medium text-violet-600 hover:underline"
                  >
                    Vedi QBR generati ({stats?.qbrGeneratedCount ?? 0})
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
