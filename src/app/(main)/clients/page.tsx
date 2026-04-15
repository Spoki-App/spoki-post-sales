'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { clientsApi } from '@/lib/api/client';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Search, ChevronRight, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { getOwnerName, getOwnerByEmail, isAdminEmail, HUBSPOT_OWNERS } from '@/lib/config/owners';
import { OnboardingStageBadge } from '@/components/ui/OnboardingStageBadge';
import { ONBOARDING_STAGES, type OnboardingStageType } from '@/lib/config/pipelines';
import type { ClientWithHealth } from '@/types';
import { formatMrrDisplay } from '@/lib/format/mrr';

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

const ONBOARDING_HAPPY_PATH: { id: string; label: string }[] = [
  { id: '1', label: 'Deal Won' },
  { id: '1011192836', label: 'Call Booked' },
  { id: '2', label: 'Activated' },
  { id: '2071331018', label: 'Training Booked' },
  { id: '3071245506', label: 'Training Done' },
  { id: '1709021391', label: 'Follow up 1' },
  { id: '2724350144', label: 'Follow up 2' },
  { id: '2724350145', label: 'Follow up 3' },
  { id: '1005076483', label: 'Post Onboarding' },
];

const ONBOARDING_PROBLEM_STAGES = new Set([
  '2702656701', '2712273122', '4013788352', '1004962561',
  '1004887980', '4524518615', '4524518616',
]);

function OnboardingProgress({ stageId }: { stageId: string | null }) {
  if (!stageId) return <span className="text-slate-400 text-xs">—</span>;

  const label = TICKET_STAGES[stageId] ?? stageId;

  if (ONBOARDING_PROBLEM_STAGES.has(stageId)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        {label}
      </span>
    );
  }

  const stepIndex = ONBOARDING_HAPPY_PATH.findIndex(s => s.id === stageId);
  if (stepIndex === -1) return <span className="text-xs text-slate-500">{label}</span>;

  const progress = ((stepIndex + 1) / ONBOARDING_HAPPY_PATH.length) * 100;
  const isComplete = stepIndex === ONBOARDING_HAPPY_PATH.length - 1;

  return (
    <div className="min-w-[100px]">
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-emerald-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className={`text-xs ${isComplete ? 'text-emerald-600 font-medium' : 'text-slate-600'}`}>
        {label}
      </p>
    </div>
  );
}

const ENGAGEMENT_LABELS: Record<string, string> = {
  CALL: 'Chiamata',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Nota',
  TASK: 'Task',
  INCOMING_EMAIL: 'Email ricevuta',
  FORWARDED_EMAIL: 'Email inoltrata',
};

const CALL_DISPOSITIONS: Record<string, string> = {
  'b9460aeb-2920-4fb2-b4ff-f74290eaf362': 'Activation Failed',
  'e66e054e-e6cd-4b16-8cb3-2e0425cf1ceb': 'Attemping',
  '9d9162e7-6cf3-4944-bf63-4dff82258764': 'Busy',
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'Connected',
  'db37fe00-d85a-48ca-9d40-4804618badb7': 'Hung up',
  '6e625bfd-4d6c-4d7a-85ef-5e9251635c81': 'Invalid format',
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff': 'Left message',
  'b2cf5968-551e-4856-9783-52b3da59a7d0': 'Left voicemail',
  '73a0d17f-1163-4015-bdd5-ec830791da20': 'No answer',
  '9d6999c0-0232-4010-9cb9-a7cea1c4f4fd': 'Blocked',
  'da6760a4-13e3-4778-a8d1-7e6af09565e4': 'Technical issue',
  'ce83dc56-e767-4510-b02f-4c68126e8154': 'Unreachable',
  '17b47fee-58de-441e-a44c-c6300d46f273': 'Wrong number',
};

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
  const isAdmin = isAdminEmail(user?.email ?? '');
  const hasOwnerProfile = !!getOwnerByEmail(user?.email ?? '');

  const [clients, setClients] = useState<ClientWithHealth[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedOwner, setSelectedOwner] = useState('');

  const CS_OWNERS = Object.values(HUBSPOT_OWNERS).filter(o => o.team === 'Customer Success');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);

    const controller = new AbortController();
    const timeoutMs = 60_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const params: Parameters<typeof clientsApi.list>[1] = {
        page, q, sort: sortBy, dir: sortDir,
        ...(isAdmin || !hasOwnerProfile ? { viewAll: true } : {}),
        ...(selectedOwner ? { owner: selectedOwner } : {}),
      };
      const res = await clientsApi.list(token, params, controller.signal);
      setClients(res.data);
      setTotal(res.total);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setLoadError('La richiesta sta impiegando troppo tempo. Riprova tra qualche secondo.');
      } else {
        setLoadError('Errore nel caricamento clienti. Riprova.');
        console.error(e);
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [token, page, q, isAdmin, hasOwnerProfile, sortBy, sortDir, selectedOwner]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(searchInput);
    setPage(1);
  }

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="relative py-6">
      {loading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-emerald-100 overflow-hidden">
          <div className="absolute inset-y-0 bg-emerald-500 animate-nprogress-1" />
          <div className="absolute inset-y-0 bg-emerald-500 animate-nprogress-2" />
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clienti</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} aziende</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-4 h-4" />
          Aggiorna
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 px-6">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-60">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Cerca per nome o dominio..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
            Cerca
          </button>
        </form>
        <select
          value={selectedOwner}
          onChange={e => { setSelectedOwner(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">Tutti gli owner</option>
          {CS_OWNERS.map(o => (
            <option key={o.id} value={o.id}>{o.firstName} {o.lastName}</option>
          ))}
        </select>
      </div>


      {loadError && (
        <div className="mb-4 mx-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{loadError}</span>
          <button
            onClick={load}
            className="ml-4 shrink-0 rounded-md bg-amber-100 px-3 py-1 text-xs font-medium hover:bg-amber-200 transition-colors"
          >
            Riprova
          </button>
        </div>
      )}

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {([
                  { label: 'Azienda', key: 'name' },
                  { label: 'Fonte', key: 'source' },
                  { label: 'Onboarding', key: 'onboarding' },
                  { label: 'Giorni in pipeline', key: 'pipeline' },
                  { label: 'MRR', key: 'mrr' },
                  { label: 'Piano', key: 'plan' },
                  { label: 'Company Owner', key: 'owner' },
                  { label: 'Ticket Support', key: 'support' },
                  { label: 'Ultimo contatto', key: 'lastContact' },
                  { label: 'Rinnovo', key: 'renewal' },
                ] as const).map(col => (
                  <th
                    key={col.label}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${col.key ? 'cursor-pointer select-none hover:bg-slate-50 transition-colors' : ''} ${sortBy === col.key ? 'text-emerald-600' : 'text-slate-500'}`}
                    onClick={col.key ? () => {
                      if (sortBy === col.key) {
                        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy(col.key);
                        setSortDir(['mrr', 'renewal', 'pipeline', 'onboarding', 'lastContact', 'support'].includes(col.key) ? 'desc' : 'asc');
                      }
                      setPage(1);
                    } : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.key && (
                        sortBy === col.key
                          ? sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-40 mb-1" /><div className="h-3 bg-slate-100 rounded w-24" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-28" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-12" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-14" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr><td colSpan={11} className="py-12 text-center text-slate-400">Nessun cliente trovato.</td></tr>
              ) : (
                clients.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <a
                          href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${c.hubspotId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-slate-900 hover:text-emerald-600 transition-colors"
                        >
                          {c.name}
                        </a>
                        {c.domain && <p className="text-xs text-slate-400">{c.domain}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.purchaseSource ? (
                        <Badge
                          variant={c.purchaseSource === 'Product Led' ? 'info' : c.purchaseSource === 'Sales Led' ? 'warning' : c.purchaseSource === 'Partner Led' ? 'success' : 'default'}
                          size="sm"
                        >
                          {c.purchaseSource}
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.onboardingTicket ? (
                        <a
                          href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-5/${c.onboardingTicket.hubspotId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block hover:bg-emerald-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                        >
                          <OnboardingProgress stageId={c.onboardingTicket.status} />
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.onboardingTicket?.activatedAt ? (
                        <span className="text-sm font-medium text-slate-700">
                          {differenceInDays(new Date(), new Date(c.onboardingTicket.activatedAt))} gg
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatMrrDisplay(c.mrr)}</td>
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
                          className="block hover:bg-emerald-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                        >
                          <p className="text-xs font-medium text-emerald-600">
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
                        <a
                          href={c.lastEngagement.type === 'CALL'
                            ? `https://app-eu1.hubspot.com/contacts/47964451/company/${c.hubspotId}/?engagement=${c.lastEngagement.hubspotId}`
                            : `https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${c.hubspotId}/view/1?engagement=${c.lastEngagement.hubspotId}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="block hover:bg-emerald-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                        >
                          <p className="text-xs font-medium text-emerald-600">
                            {ENGAGEMENT_LABELS[c.lastEngagement.type ?? ''] ?? c.lastEngagement.type ?? '—'}
                            {c.lastEngagement.type === 'CALL' && c.lastEngagement.callDirection && (
                              <span className="font-normal text-slate-400"> ({c.lastEngagement.callDirection === 'INBOUND' ? 'in entrata' : 'in uscita'})</span>
                            )}
                          </p>
                          {c.lastEngagement.type === 'CALL' ? (
                            <>
                              {c.lastEngagement.callTitle && (
                                <p className="text-xs text-slate-400 truncate max-w-[180px]">{c.lastEngagement.callTitle}</p>
                              )}
                              {c.lastEngagement.callDisposition && (
                                <p className="text-xs text-slate-400">{CALL_DISPOSITIONS[c.lastEngagement.callDisposition] ?? c.lastEngagement.callDisposition}</p>
                              )}
                            </>
                          ) : (c.lastEngagement.type === 'EMAIL' || c.lastEngagement.type === 'INCOMING_EMAIL' || c.lastEngagement.type === 'FORWARDED_EMAIL') && c.lastEngagement.emailFrom ? (
                            <p className="text-xs text-slate-400">
                              {c.lastEngagement.emailFrom} → {c.lastEngagement.emailTo ?? '—'}
                            </p>
                          ) : c.lastEngagement.ownerId ? (
                            <p className="text-xs text-slate-400">
                              {getOwnerName(c.lastEngagement.ownerId)}
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-400">
                            {formatDistanceToNow(new Date(c.lastEngagement.occurredAt), { addSuffix: true, locale: it })}
                          </p>
                        </a>
                      ) : (
                        <span className="text-red-500 text-xs font-medium">Nessun contatto</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap min-w-[120px]">
                      <RenewalCell date={c.renewalDate} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="p-1 text-slate-400 hover:text-emerald-600 transition-colors">
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
