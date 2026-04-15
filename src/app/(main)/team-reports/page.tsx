'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { useRouter } from 'next/navigation';
import { isAdminEmail, HUBSPOT_OWNERS } from '@/lib/config/owners';
import { teamReportsApi } from '@/lib/api/client';
import { CHECKPOINT_LABELS } from '@/lib/services/activation-analysis';
import { Card } from '@/components/ui/Card';
import { Loader2, ExternalLink, CheckCircle2, XCircle, ChevronDown, ChevronUp, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

type CallItem = {
  hubspotId: string;
  title: string;
  date: string;
  outcome: string | null;
  owner: { id: string | null; name: string };
  client: { id: string | null; hubspotId: string | null; name: string; domain: string | null } | null;
};

type AnalysisResult = Record<string, boolean>;

const CS_OWNERS = Object.values(HUBSPOT_OWNERS)
  .filter(o => o.team === 'Customer Success')
  .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

export default function TeamReportsPage() {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const isAdmin = isAdminEmail(user?.email);

  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [days, setDays] = useState(90);
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [fathomUrls, setFathomUrls] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; analyzed: number; errors: number; fetching?: boolean } | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await teamReportsApi.listCalls(token, {
        type: 'activation',
        days,
        ...(ownerFilter ? { owner: ownerFilter } : {}),
        ...(outcomeFilter !== 'all' ? { outcome: outcomeFilter } : {}),
      });
      setCalls(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  }, [token, days, ownerFilter, outcomeFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleAnalyze(hubspotId: string) {
    if (!token || analyzing || batchProgress) return;
    setAnalyzing(hubspotId);
    setError(null);
    try {
      const res = await teamReportsApi.analyzeCall(token, hubspotId);
      if (res.data?.analysis) {
        setAnalyses(prev => ({ ...prev, [hubspotId]: res.data!.analysis }));
        if (res.data.fathomUrl) {
          setFathomUrls(prev => ({ ...prev, [hubspotId]: res.data!.fathomUrl! }));
        }
        setExpanded(hubspotId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nell\'analisi');
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleBatchAnalyze() {
    if (!token || analyzing || batchProgress) return;

    const unanalyzedIds = calls
      .filter(c => !analyses[c.hubspotId])
      .map(c => c.hubspotId);

    if (unanalyzedIds.length === 0) return;

    const abort = new AbortController();
    batchAbortRef.current = abort;
    setBatchProgress({ current: 0, total: unanalyzedIds.length, analyzed: 0, errors: 0 });
    setError(null);

    try {
      const res = await teamReportsApi.analyzeBatch(token, unanalyzedIds, abort.signal);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';

      while (!abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));

              if (eventType === 'result') {
                setAnalyses(prev => ({ ...prev, [data.hubspotId]: data.analysis }));
                if (data.fathomUrl) {
                  setFathomUrls(prev => ({ ...prev, [data.hubspotId]: data.fathomUrl }));
                }
              }

              if (eventType === 'progress') {
                setBatchProgress(prev => prev ? {
                  ...prev,
                  current: data.current ?? prev.current,
                  analyzed: data.status === 'done' ? prev.analyzed + 1 : prev.analyzed,
                  errors: data.status === 'error' ? prev.errors + 1 : prev.errors,
                } : null);
              }

              if (eventType === 'fetching') {
                setBatchProgress(prev => prev ? { ...prev, fetching: true } as typeof prev : null);
              }

              if (eventType === 'complete') {
                setBatchProgress(null);
              }
            } catch { /* skip malformed JSON */ }
            eventType = '';
          }
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Errore nell\'analisi batch');
      }
    } finally {
      setBatchProgress(null);
      batchAbortRef.current = null;
    }
  }

  if (!isAdmin) return null;

  const PERIODS = [30, 60, 90, 120, 150] as const;
  const checkpointKeys = Object.keys(CHECKPOINT_LABELS) as (keyof typeof CHECKPOINT_LABELS)[];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Attivazioni - Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">Analisi chiamate di attivazione dal team</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">Tutti gli owner</option>
          {CS_OWNERS.map(o => (
            <option key={o.id} value={o.id}>{o.firstName} {o.lastName}</option>
          ))}
        </select>

        <select
          value={outcomeFilter}
          onChange={e => setOutcomeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="all">Tutti gli esiti</option>
          <option value="completed">Completed</option>
          <option value="scheduled">Scheduled</option>
          <option value="rescheduled">Rescheduled</option>
          <option value="no_show">No Show</option>
          <option value="canceled">Canceled</option>
        </select>

        <div className="flex items-center gap-1 border border-slate-300 rounded-lg p-0.5">
          <span className="px-2 text-xs text-slate-500">Periodo:</span>
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                days === p
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {p} gg
            </button>
          ))}
        </div>

        <p className="flex items-center text-sm text-slate-500">
          {loading ? '...' : `${calls.length} chiamate`}
        </p>

        {!loading && calls.some(c => !analyses[c.hubspotId]) && (
          <button
            onClick={handleBatchAnalyze}
            disabled={!!batchProgress || !!analyzing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {batchProgress ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlayCircle className="w-3.5 h-3.5" />
            )}
            Analizza Tutti
          </button>
        )}
      </div>

      {batchProgress && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
            <span className="flex items-center gap-1.5">
              {batchProgress.fetching && batchProgress.current === 0 ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Recupero trascrizioni da Fathom...
                </>
              ) : (
                <>
                  Analisi batch: {batchProgress.analyzed}/{batchProgress.total} completate
                  {batchProgress.errors > 0 && (
                    <span className="text-red-500 ml-1">({batchProgress.errors} errori)</span>
                  )}
                </>
              )}
            </span>
            <button
              onClick={() => batchAbortRef.current?.abort()}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              Annulla
            </button>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            {batchProgress.fetching && batchProgress.current === 0 ? (
              <div className="h-full w-full bg-emerald-400 rounded-full animate-pulse" />
            ) : (
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
              />
            )}
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Titolo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Esito</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">HubSpot</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Analisi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" /></td></tr>
              ) : calls.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-400">Nessuna chiamata di attivazione trovata.</td></tr>
              ) : (
                calls.map(call => {
                  const analysis = analyses[call.hubspotId];
                  const fathomUrl = fathomUrls[call.hubspotId];
                  const isExpanded = expanded === call.hubspotId;
                  const isAnalyzing = analyzing === call.hubspotId;
                  const passedCount = analysis
                    ? Object.values(analysis).filter(v => v === true).length
                    : null;

                  return (
                    <tr key={call.hubspotId} className="border-b border-slate-100">
                      <td className="px-4 py-3 align-top whitespace-nowrap text-slate-600">
                        {format(new Date(call.date), 'd MMM yyyy HH:mm', { locale: it })}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-slate-800">{call.title}</p>
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-slate-600">
                        {call.owner.name}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {call.client ? (
                          <div>
                            <Link href={`/clients/${call.client.id}`} className="text-slate-700 hover:text-emerald-600">
                              {call.client.name}
                            </Link>
                            {call.client.domain && <p className="text-xs text-slate-400">{call.client.domain}</p>}
                          </div>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        {call.outcome ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            call.outcome === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                            call.outcome === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                            call.outcome === 'RESCHEDULED' ? 'bg-amber-100 text-amber-700' :
                            call.outcome === 'NO_SHOW' ? 'bg-red-100 text-red-700' :
                            call.outcome === 'CANCELED' ? 'bg-slate-100 text-slate-600' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {call.outcome}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {call.client?.hubspotId ? (
                          <a
                            href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${call.client.hubspotId}/view/1?engagement=${call.hubspotId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Apri
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">--</span>
                        )}
                        {fathomUrl && (
                          <a
                            href={fathomUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 ml-2"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Fathom
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {analysis ? (
                          <div>
                            <button
                              onClick={() => setExpanded(isExpanded ? null : call.hubspotId)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium"
                            >
                              <span className={passedCount === 7 ? 'text-emerald-600' : passedCount! >= 5 ? 'text-amber-600' : 'text-red-600'}>
                                {passedCount}/7
                              </span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                            </button>
                            {isExpanded && (
                              <div className="mt-2 space-y-1.5">
                                {checkpointKeys.map(key => {
                                  const passed = analysis[key];
                                  if (passed === undefined) return null;
                                  return (
                                    <div key={key} className="flex items-center gap-2">
                                      {passed ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                      ) : (
                                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                                      )}
                                      <p className="text-xs text-slate-700">{CHECKPOINT_LABELS[key]}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAnalyze(call.hubspotId)}
                            disabled={isAnalyzing || !!batchProgress}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin" />}
                            Analizza
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
