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
import { OnboardingStageBadge } from '@/components/ui/OnboardingStageBadge';
import { ONBOARDING_STAGES, type OnboardingStageType } from '@/lib/config/pipelines';
import type { ClientWithHealth, HealthStatus } from '@/types';

const TICKET_PIPELINES: Record<string, string> = {
  '0': 'Onboarding',
  '686100601': 'Customer Success',
  '1249920186': 'Support',
  '2159832265': 'Partner Success',
  '2294629588': 'Onboarding (enterprise)',
  '2332711113': 'Partner Child Activation',
  '2568452299': 'CS Direct Customer',
};

const TICKET_STAGES: Record<string, string> = {
  '1': 'Deal won', '1011192836': 'Activation Call Booked', '2702656701': 'Activation problems',
  '2712273122': 'Activation Failed', '2': 'Activated', '2071331018': 'Training Booked',
  '3071245506': 'Training Done', '4013788352': '10% Usage', '1709021391': 'Follow up Call',
  '2724350144': 'Follow up Call 2', '2724350145': 'Follow up Call 3', '1004962561': 'Utilizzo 60%',
  '1004887980': 'Never Activated', '1005076483': 'Post Onboarding', '4524518615': 'Free',
  '4524518616': 'Withdrawal',
  '1004887938': 'Onboarding Completed', '3543557342': 'Churn Risk', '1004887939': 'Consumo 30%',
  '1004887940': 'Consumo 60%', '1004887941': 'Consumo 90%', '3541463287': 'Champion +100%',
  '3541463288': 'Consumo 0', '3542439142': 'Contract Withdrawal', '4077074626': 'Became Free',
  '1709441257': 'New', '1709442234': 'Ticket Opened', '1709441258': 'Waiting on contact',
  '1709441259': 'Waiting on us', '1709442235': 'Waiting IT', '2947580095': 'Waiting Accounting',
  '1866676440': 'Waiting Tyntec', '1709442237': 'Unsolved', '1709442238': 'Auto Closing',
  '1709442236': 'Solved',
  '2947626204': 'Deal Won', '3114449133': 'Child in activation', '2947626205': 'Training 1',
  '2947626206': 'Training 1 Completed', '3014481137': 'Training 2', '2947679436': 'Training 2 Completed',
  '2947679437': 'Follow Up 1', '2947679438': 'Follow Up 1 Completed', '3190220012': 'Follow Up 2',
  '3190220013': 'Follow Up 2 Completed', '3190220014': 'Follow Up 3', '3190220015': 'Follow Up 3 Completed',
  '2947626207': 'Withdrawal', '3260525811': 'Partner da sentire', '3275318502': 'Pannelli Chiusi',
  '3453605080': 'Referral',
  '3129878766': 'Training done', '3399626965': 'Training Not Booked', '3129878765': 'Training booked',
  '3129878767': 'Training 2 booked', '3129878768': 'Training 2 done', '3129647334': 'Follow up',
  '3129647335': 'Monitoring 1', '3129647336': 'Call monitoring Invitation',
  '3403595988': 'Call Monitoring 1 Booked', '3129647337': 'Call monitoring done',
  '3402852598': 'Follow up 2', '3129647338': 'Monitoring 2', '3403595989': 'Call Monitoring 2 Invitation',
  '3129647339': 'Call monitoring 2 booked', '3129647340': 'Call monitoring 2 done',
  '3129647341': 'KPI analisys', '3460498624': 'Raggiungimento Obiettivi',
  '3188699343': 'Deal Won', '3188699345': 'Activated', '3188699346': 'Activation Problem',
  '3215026411': 'Banned', '3460496626': 'Mai Attivato', '4522408173': 'Free', '4522408174': 'Withdrawal',
  '3531706579': 'hh', '3531706580': 'Waiting on contact', '3531706581': 'Waiting on us',
  '3531706582': 'Closed',
};

const ENGAGEMENT_LABELS: Record<string, string> = {
  CALL: 'Chiamata',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Nota',
  TASK: 'Task',
  INCOMING_EMAIL: 'Email ricevuta',
  FORWARDED_EMAIL: 'Email inoltrata',
};

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
  const daysLabel = days <= 0 ? 'oggi' : `tra ${days} gg`;
  const daysClass = days <= 14 ? 'text-red-600 font-medium' : days <= 30 ? 'text-amber-600' : 'text-slate-400';
  return (
    <span className="text-sm text-slate-700">{label} <span className={`text-xs ${daysClass}`}>({daysLabel})</span></span>
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
    <div className="p-6 max-w-[1600px] mx-auto">
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
                {['Azienda', 'Onboarding', 'Salute', 'MRR', 'Piano', 'Customer Success Owner', 'Ticket Support', 'Ultimo contatto', 'Rinnovo'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-12 text-center text-slate-400">Caricamento...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={10} className="py-12 text-center text-slate-400">Nessun cliente trovato.</td></tr>
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
                      {c.onboardingTicket ? (
                        <a
                          href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-5/${c.onboardingTicket.hubspotId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block hover:bg-blue-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                        >
                          <p className="text-xs font-medium text-blue-600">Onboarding</p>
                          <p className="text-xs text-slate-500">
                            {TICKET_STAGES[c.onboardingTicket.status ?? ''] ?? c.onboardingTicket.status ?? '—'}
                          </p>
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
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
                      {c.supportTicketsCount > 0 && c.latestSupportTicket ? (
                        <a
                          href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-5/${c.latestSupportTicket.hubspotId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block hover:bg-blue-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                        >
                          <p className="text-xs font-medium text-blue-600">
                            {c.supportTicketsCount} {c.supportTicketsCount === 1 ? 'ticket' : 'tickets'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {TICKET_STAGES[c.latestSupportTicket.status ?? ''] ?? c.latestSupportTicket.status ?? '—'}
                          </p>
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.lastEngagement ? (
                        <div>
                          <p className="text-xs font-medium text-slate-700">
                            {ENGAGEMENT_LABELS[c.lastEngagement.type ?? ''] ?? c.lastEngagement.type ?? '—'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDistanceToNow(new Date(c.lastEngagement.occurredAt), { addSuffix: true, locale: it })}
                          </p>
                          {c.lastEngagement.ownerId && (
                            <p className="text-xs text-slate-400">
                              {getOwnerName(c.lastEngagement.ownerId)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-red-500 text-xs font-medium">Nessun contatto</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap min-w-[120px]">
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
