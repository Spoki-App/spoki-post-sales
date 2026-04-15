'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { onboardingHubApi } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { Search, ChevronRight, Loader2 } from 'lucide-react';
import { formatMrrDisplay } from '@/lib/format/mrr';
import { getOnboardingStageLabel } from '@/lib/config/onboarding-pipeline';
import { differenceInDays } from 'date-fns';

type ObClient = {
  id: string;
  hubspotId: string;
  name: string;
  domain: string | null;
  mrr: number | null;
  plan: string | null;
  renewalDate: string | null;
  onboardingStage: string | null;
  activatedAt: string | null;
};

export default function OnboardingClientsPage() {
  const { token } = useAuthStore();
  const [clients, setClients] = useState<ObClient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await onboardingHubApi.clients(token, { q, page });
      setClients(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, q, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5">
        <form onSubmit={e => { e.preventDefault(); setQ(searchInput); setPage(1); }} className="flex items-center gap-2 flex-1 min-w-60">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Cerca per nome o dominio..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button type="submit" className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
            Cerca
          </button>
        </form>
        <p className="flex items-center text-sm text-slate-500">{total} clienti</p>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {['Azienda', 'Stage', 'Giorni', 'MRR', 'Piano', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="w-5 h-5 text-teal-500 animate-spin mx-auto" /></td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400">Nessun cliente trovato.</td></tr>
              ) : (
                clients.map(c => {
                  const stageLabel = getOnboardingStageLabel(c.onboardingStage);
                  const days = c.activatedAt ? differenceInDays(new Date(), new Date(c.activatedAt)) : null;
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <a
                          href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${c.hubspotId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-slate-900 hover:text-teal-600 transition-colors"
                        >
                          {c.name}
                        </a>
                        {c.domain && <p className="text-xs text-slate-400">{c.domain}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {stageLabel ? (
                          <span className="text-xs font-medium text-slate-700">{stageLabel}</span>
                        ) : (
                          <span className="text-xs text-slate-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {days !== null ? (
                          <span className="text-sm text-slate-600">{days} gg</span>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{formatMrrDisplay(c.mrr)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.plan ?? '--'}</td>
                      <td className="px-4 py-3">
                        <Link href={`/clients/${c.id}`} className="p-1 text-slate-400 hover:text-teal-600 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-500">Pagina {page} di {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Precedente
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Successiva
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
