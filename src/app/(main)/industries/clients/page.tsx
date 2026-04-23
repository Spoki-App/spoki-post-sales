'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { industriesApi } from '@/lib/api/client';
import { formatMrrDisplay } from '@/lib/format/mrr';
import { Card } from '@/components/ui/Card';
import { Search, ChevronDown, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

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

export default function IndustriesClientsPage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [industry, setIndustry] = useState<string>('');
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [viewAll, setViewAll] = useState(false);
  const [summary, setSummary] = useState<{ total: number; limited: boolean } | null>(null);
  const [industryOptions, setIndustryOptions] = useState<Array<{ key: string | null; label: string; clientCount: number }>>(
    []
  );
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [gRes, iRes] = await Promise.all([
        industriesApi.clients(token, {
          q: q || undefined,
          viewAll: viewAll || undefined,
          industry: industry || undefined,
          sort,
          dir,
        }),
        industriesApi.list(token, { viewAll: viewAll || undefined }),
      ]);
      if (gRes.data) {
        setGroups(gRes.data.groups as Group[]);
        setSummary({ total: gRes.data.totalClients, limited: gRes.data.limited });
      }
      if (iRes.data) setIndustryOptions(iRes.data.industries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [token, q, industry, sort, dir, viewAll]);

  useEffect(() => {
    void load();
  }, [load]);

  const allKeys = useMemo(() => new Set(groups.map(g => g.key ?? '__none__')), [groups]);
  useEffect(() => {
    setOpenKeys(new Set(allKeys));
  }, [allKeys]);

  const toggleKey = (k: string) => {
    setOpenKeys(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  if (!token) {
    return <p className="text-slate-500 text-sm">Accedi per vedere le industry.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
        <form
          onSubmit={e => {
            e.preventDefault();
            setQ(searchInput);
          }}
          className="flex flex-wrap gap-2 items-center"
        >
          <div className="relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Cerca azienda…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700"
          >
            Cerca
          </button>
        </form>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-slate-600 flex items-center gap-1.5">
            <input type="checkbox" checked={viewAll} onChange={e => setViewAll(e.target.checked)} />
            Vedi tutto il portafoglio
          </label>
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
          >
            <option value="">Tutte le industry</option>
            {industryOptions.map((row, i) => (
              <option
                key={row.key === null ? `null-${i}` : row.key}
                value={row.key === null ? '__none__' : (row.key ?? '')}
              >
                {row.label} ({row.clientCount})
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
          >
            <option value="name">Ordina: nome</option>
            <option value="mrr">Ordina: MRR</option>
            <option value="engagement">Ordina: engagement 90g</option>
            <option value="health">Ordina: health</option>
          </select>
          <button
            type="button"
            onClick={() => setDir(d => (d === 'asc' ? 'desc' : 'asc'))}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
          >
            {dir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {summary?.limited && (
        <p className="text-amber-700 text-sm">
          Risultato troncato (limite {4000} clienti). Affina i filtri.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(grp => {
            const gk = grp.key ?? '__none__';
            const open = openKeys.has(gk);
            return (
              <Card key={gk} padding="none" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleKey(gk)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                >
                  <span className="font-medium text-slate-900 flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-slate-500" />
                    {grp.label}
                    <span className="text-slate-500 font-normal">({grp.clients.length})</span>
                  </span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="overflow-x-auto border-t border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                          <th className="px-3 py-2">Azienda</th>
                          <th className="px-3 py-2">CSM</th>
                          <th className="px-3 py-2">Piano</th>
                          <th className="px-3 py-2">MRR</th>
                          <th className="px-3 py-2">Onboarding</th>
                          <th className="px-3 py-2">Health</th>
                          <th className="px-3 py-2">Eng. 90g</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.clients.map(c => (
                          <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                            <td className="px-3 py-2">
                              <Link href={`/clients/${c.id}`} className="text-violet-700 hover:underline font-medium">
                                {c.name}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{c.csm.label ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{c.plan ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-800">{formatMrrDisplay(c.mrr)}</td>
                            <td className="px-3 py-2 text-slate-600">{c.onboardingStatus ?? '—'}</td>
                            <td className="px-3 py-2">
                              {c.health.score != null ? (
                                <span
                                  className={cn(
                                    'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
                                    c.health.status === 'green' && 'bg-emerald-100 text-emerald-800',
                                    c.health.status === 'yellow' && 'bg-amber-100 text-amber-800',
                                    c.health.status === 'red' && 'bg-red-100 text-red-800',
                                    !c.health.status && 'bg-slate-100 text-slate-700'
                                  )}
                                >
                                  {c.health.score}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-800">{c.engagement90d}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
