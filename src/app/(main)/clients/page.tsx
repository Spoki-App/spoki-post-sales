'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth';
import { clientsApi } from '@/lib/api/client';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Search, ChevronRight, RefreshCw } from 'lucide-react';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { getOwnerName, getOwnerByEmail } from '@/lib/config/owners';
import type { ClientWithHealth, HealthStatus } from '@/types';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tutti' },
  { value: 'red', label: 'Critici' },
  { value: 'yellow', label: 'Attenzione' },
  { value: 'green', label: 'Sani' },
];

function formatMrr(mrr: number | null) {
  if (!mrr) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(mrr);
}

function RenewalCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const days = differenceInDays(new Date(date), new Date());
  const label = format(new Date(date), 'd MMM yyyy', { locale: it });
  if (days < 0) return <span className="text-slate-400 text-sm">Scaduto</span>;
  return (
    <div>
      <p className="text-sm text-slate-700">{label}</p>
      <p className={`text-xs ${days <= 14 ? 'text-red-600 font-medium' : days <= 30 ? 'text-amber-600' : 'text-slate-400'}`}>
        {days <= 0 ? 'oggi' : `tra ${days} gg`}
      </p>
    </div>
  );
}

export default function ClientsPage() {
  const { token } = useAuthStore();
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const section = (searchParams.get('section') ?? 'all') as 'all' | 'onboarding' | 'success' | 'company';
  const isOwner = !!getOwnerByEmail(user?.email ?? '');

  const [clients, setClients] = useState<ClientWithHealth[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const SECTION_LABELS: Record<string, string> = {
    company: 'Company Owner',
    onboarding: 'Customer Onboarding Owner',
    success: 'Customer Success Owner',
    all: 'Tutti i clienti',
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = {
        page, q,
        status: statusFilter,
        ...(!isOwner ? { viewAll: true } : { section }),
      } as Parameters<typeof clientsApi.list>[1];
      const res = await clientsApi.list(token, params);
      setClients(res.data);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, page, q, statusFilter, isOwner, section]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(searchInput);
    setPage(1);
  }

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {SECTION_LABELS[section] ?? 'Clienti'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} aziende</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-4 h-4" />
          Aggiorna
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-60">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Cerca per nome o dominio..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Cerca
          </button>
        </form>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                statusFilter === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {['Azienda', 'Salute', 'MRR', 'Piano', 'CS Owner', 'Ticket aperti', 'Ultimo contatto', 'Rinnovo'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400">Caricamento...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400">Nessun cliente trovato.</td></tr>
              ) : (
                clients.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <a
                          href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${c.hubspotId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          {c.name}
                        </a>
                        {c.domain && <p className="text-xs text-slate-400">{c.domain}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.healthScore ? (
                        <HealthBadge status={c.healthScore.status as HealthStatus} score={c.healthScore.score} size="sm" />
                      ) : (
                        <span className="text-slate-400 text-xs">N/D</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatMrr(c.mrr)}</td>
                    <td className="px-4 py-3">
                      {c.plan ? <Badge variant="outline" size="sm">{c.plan}</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {getOwnerName(c.csOwnerId)}
                    </td>
                    <td className="px-4 py-3">
                      {c.openTicketsCount > 0 ? (
                        <span className="text-red-600 font-medium">{c.openTicketsCount}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.lastContactDate
                        ? formatDistanceToNow(new Date(c.lastContactDate), { addSuffix: true, locale: it })
                        : <span className="text-red-500 text-xs font-medium">Nessun contatto</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <RenewalCell date={c.renewalDate} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="p-1 text-slate-400 hover:text-blue-600 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-500">Pagina {page} di {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Precedente
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
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
