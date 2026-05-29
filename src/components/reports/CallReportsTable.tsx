'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { useRouter } from 'next/navigation';
import { isAdminEmail, HUBSPOT_OWNERS } from '@/lib/config/owners';
import { callReportsApi, type CallReportType } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { CallReportsSummary } from '@/components/reports/CallReportsSummary';
import {
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  RotateCcw,
  Download,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { buildCsv, downloadCsv } from '@/lib/utils/csv';

type CheckpointEvidence = {
  evidence: string | null;
  confidence: 'low' | 'medium' | 'high';
};

type StoredAnalysis = {
  checkpoints: Record<string, boolean>;
  evidences: Record<string, CheckpointEvidence> | null;
  passedCount: number;
  totalCheckpoints: number;
  promptVersion: string;
  model: string;
  analyzedAt: string;
  fathomUrl: string | null;
};

type MatchFailure = {
  hubspotId: string;
  callType: CallReportType;
  reasonCode: 'NO_FATHOM_URL' | 'NO_TRANSCRIPT' | 'NO_MATCH' | 'FATHOM_FETCH_FAILED' | 'NO_TITLE';
  reasonMessage: string;
  attempts: number;
  lastAttemptAt: string;
};

type CallItem = {
  hubspotId: string;
  title: string;
  date: string;
  outcome: string | null;
  owner: { id: string | null; name: string };
  client: {
    id: string | null;
    hubspotId: string | null;
    name: string;
    domain: string | null;
  } | null;
  analysis: StoredAnalysis | null;
  matchFailure?: MatchFailure | null;
};

type CheckpointResult = {
  passed: boolean;
  evidence: string | null;
  confidence: 'low' | 'medium' | 'high';
};
type AnalysisResult = Record<string, CheckpointResult>;

const CS_OWNERS = Object.values(HUBSPOT_OWNERS)
  .filter(o => o.team === 'Customer Success')
  .sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );

const PERIODS = [30, 60, 90, 120, 150] as const;

export interface CallReportsPageProps {
  type: CallReportType;
  title: string;
  subtitle: string;
  checkpointLabels: Record<string, string>;
  emptyMessage: string;
}

export function CallReportsPage({
  type,
  title,
  subtitle,
  checkpointLabels,
  emptyMessage,
}: CallReportsPageProps) {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const isAdmin = isAdminEmail(user?.email);

  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [days, setDays] = useState(90);
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [clientQuery, setClientQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [fathomUrls, setFathomUrls] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    analyzed: number;
    errors: number;
    fetching?: boolean;
    label?: string;
  } | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const [staleCount, setStaleCount] = useState<number>(0);
  const [autoRefreshDone, setAutoRefreshDone] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'summary'>('list');
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string> | null>(null);

  // The active prompt template can override the static labels passed by the page.
  // We fall back to the static prop if the API hasn't yet returned the dynamic set.
  const effectiveLabels = dynamicLabels ?? checkpointLabels;
  const totalCheckpoints = Object.keys(effectiveLabels).length;
  const checkpointKeys = Object.keys(effectiveLabels);

  const filteredCalls = clientQuery.trim()
    ? calls.filter(c => {
        const q = clientQuery.trim().toLowerCase();
        return (
          (c.client?.name ?? '').toLowerCase().includes(q) ||
          (c.client?.domain ?? '').toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q)
        );
      })
    : calls;

  const handleExportCsv = useCallback(() => {
    const headers = [
      'data',
      'titolo',
      'owner',
      'cliente',
      'dominio',
      'esito',
      'analizzata',
      'no_fathom_motivo',
      'pass_rate',
      'punteggio',
      ...checkpointKeys.flatMap(k => [`cp_${k}`, `evidence_${k}`]),
      'fathom_url',
      'hubspot_url',
    ];
    const rows = filteredCalls.map(c => {
      const a = c.analysis;
      const ana = analyses[c.hubspotId];
      const passed = ana ? Object.values(ana).filter(r => r.passed).length : null;
      const fathomUrl = fathomUrls[c.hubspotId] ?? a?.fathomUrl ?? '';
      const hsUrl = c.client?.hubspotId
        ? `https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${c.client.hubspotId}/view/1?engagement=${c.hubspotId}`
        : '';
      return [
        format(new Date(c.date), 'yyyy-MM-dd HH:mm'),
        c.title,
        c.owner.name,
        c.client?.name ?? '',
        c.client?.domain ?? '',
        c.outcome ?? '',
        a ? 'si' : 'no',
        c.matchFailure?.reasonMessage ?? '',
        a && passed != null ? `${Math.round((passed / totalCheckpoints) * 100)}%` : '',
        a && passed != null ? `${passed}/${totalCheckpoints}` : '',
        ...checkpointKeys.flatMap(k => {
          const r = ana?.[k];
          return [r ? (r.passed ? 'pass' : 'fail') : '', r?.evidence ?? ''];
        }),
        fathomUrl,
        hsUrl,
      ];
    });
    const csv = buildCsv(headers, rows);
    const stamp = format(new Date(), 'yyyyMMdd_HHmm');
    downloadCsv(`${type}-calls-${stamp}.csv`, csv);
  }, [filteredCalls, analyses, fathomUrls, checkpointKeys, totalCheckpoints, type]);

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
      const res = await callReportsApi.listCalls(token, type, {
        days,
        ...(ownerFilter ? { owner: ownerFilter } : {}),
        ...(outcomeFilter !== 'all' ? { outcome: outcomeFilter } : {}),
        ...(dateFrom ? { from: dateFrom } : {}),
        ...(dateTo ? { to: dateTo } : {}),
      });
      const list = res.data ?? [];
      setCalls(list);
      if (res.currentLabels) setDynamicLabels(res.currentLabels);

      const nextAnalyses: Record<string, AnalysisResult> = {};
      const nextFathomUrls: Record<string, string> = {};
      for (const c of list) {
        if (c.analysis) {
          const merged: AnalysisResult = {};
          for (const [k, passed] of Object.entries(c.analysis.checkpoints)) {
            const ev = c.analysis.evidences?.[k];
            merged[k] = {
              passed: Boolean(passed),
              evidence: ev?.evidence ?? null,
              confidence: ev?.confidence ?? 'medium',
            };
          }
          nextAnalyses[c.hubspotId] = merged;
          if (c.analysis.fathomUrl) {
            nextFathomUrls[c.hubspotId] = c.analysis.fathomUrl;
          }
        }
      }
      setAnalyses(nextAnalyses);
      setFathomUrls(nextFathomUrls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  }, [token, type, days, ownerFilter, outcomeFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  // Helper: drain an SSE batch stream and update batch progress / analyses state.
  async function drainBatchStream(
    res: { body: ReadableStream<Uint8Array> | null },
    abort: AbortController,
  ) {
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
              setBatchProgress(prev =>
                prev
                  ? {
                      ...prev,
                      current: data.current ?? prev.current,
                      analyzed: data.status === 'done' ? prev.analyzed + 1 : prev.analyzed,
                      errors: data.status === 'error' ? prev.errors + 1 : prev.errors,
                    }
                  : null,
              );
            }

            if (eventType === 'fetching') {
              setBatchProgress(prev => (prev ? ({ ...prev, fetching: true } as typeof prev) : null));
            }

            if (eventType === 'complete') {
              setBatchProgress(null);
            }
          } catch {
            /* skip malformed JSON */
          }
          eventType = '';
        }
      }
    }
  }

  // Auto-refresh stale analyses (those generated by an older prompt version) once per mount.
  useEffect(() => {
    if (!token || autoRefreshDone || loading) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await callReportsApi.listStale(token, type);
        const stale = r.data?.staleHubspotIds ?? [];
        setStaleCount(stale.length);
        if (cancelled || stale.length === 0) {
          setAutoRefreshDone(true);
          return;
        }
        const visible = new Set(calls.map(c => c.hubspotId));
        const toRefresh = stale.filter(id => visible.has(id));
        if (toRefresh.length === 0) {
          setAutoRefreshDone(true);
          return;
        }
        for (const id of toRefresh) {
          try {
            await callReportsApi.deleteAnalysis(token, type, id);
          } catch {
            /* ignore */
          }
        }
        const abort = new AbortController();
        batchAbortRef.current = abort;
        setBatchProgress({
          current: 0,
          total: toRefresh.length,
          analyzed: 0,
          errors: 0,
          label: 'Aggiornamento analisi al nuovo prompt',
        });
        const res = await callReportsApi.analyzeBatch(token, type, toRefresh, abort.signal);
        await drainBatchStream(res, abort);
        if (!cancelled) {
          await load();
          setStaleCount(0);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Errore aggiornamento analisi');
        }
      } finally {
        if (!cancelled) {
          setAutoRefreshDone(true);
          setBatchProgress(null);
          batchAbortRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, type, loading, autoRefreshDone]);

  async function handleAnalyze(hubspotId: string) {
    if (!token || analyzing || batchProgress) return;
    setAnalyzing(hubspotId);
    setError(null);
    try {
      const res = await callReportsApi.analyzeCall(token, type, hubspotId);
      if (res.data?.analysis) {
        setAnalyses(prev => ({ ...prev, [hubspotId]: res.data!.analysis }));
        if (res.data.fathomUrl) {
          setFathomUrls(prev => ({ ...prev, [hubspotId]: res.data!.fathomUrl! }));
        }
        setExpanded(hubspotId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nell'analisi");
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleReAnalyze(hubspotId: string) {
    if (!token || analyzing || batchProgress) return;
    setAnalyzing(hubspotId);
    setError(null);
    try {
      await callReportsApi.deleteAnalysis(token, type, hubspotId);
      const res = await callReportsApi.analyzeCall(token, type, hubspotId);
      if (res.data?.analysis) {
        setAnalyses(prev => ({ ...prev, [hubspotId]: res.data!.analysis }));
        if (res.data.fathomUrl) {
          setFathomUrls(prev => ({ ...prev, [hubspotId]: res.data!.fathomUrl! }));
        }
        setExpanded(hubspotId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nella ri-analisi");
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleBatchAnalyze() {
    if (!token || analyzing || batchProgress) return;

    const unanalyzedIds = filteredCalls
      .filter(c => !analyses[c.hubspotId])
      .map(c => c.hubspotId);

    if (unanalyzedIds.length === 0) return;

    const abort = new AbortController();
    batchAbortRef.current = abort;
    setBatchProgress({ current: 0, total: unanalyzedIds.length, analyzed: 0, errors: 0 });
    setError(null);

    try {
      const res = await callReportsApi.analyzeBatch(token, type, unanalyzedIds, abort.signal);
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
                setBatchProgress(prev =>
                  prev
                    ? {
                        ...prev,
                        current: data.current ?? prev.current,
                        analyzed: data.status === 'done' ? prev.analyzed + 1 : prev.analyzed,
                        errors: data.status === 'error' ? prev.errors + 1 : prev.errors,
                      }
                    : null,
                );
              }

              if (eventType === 'fetching') {
                setBatchProgress(prev => (prev ? ({ ...prev, fetching: true } as typeof prev) : null));
              }

              if (eventType === 'complete') {
                setBatchProgress(null);
              }
            } catch {
              /* skip malformed JSON */
            }
            eventType = '';
          }
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : "Errore nell'analisi batch");
      }
    } finally {
      setBatchProgress(null);
      batchAbortRef.current = null;
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'list'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Lista chiamate
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'summary'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Panoramica
        </button>
      </div>

      {activeTab === 'summary' && (
        <CallReportsSummary
          type={type}
          token={token}
          days={days}
          owner={ownerFilter || undefined}
          from={dateFrom || undefined}
          to={dateTo || undefined}
          checkpointLabels={effectiveLabels}
        />
      )}

      {activeTab === 'list' && (<>
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">Tutti gli owner</option>
          {CS_OWNERS.map(o => (
            <option key={o.id} value={o.id}>
              {o.firstName} {o.lastName}
            </option>
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
              onClick={() => {
                setDays(p);
                setDateFrom('');
                setDateTo('');
              }}
              disabled={!!dateFrom || !!dateTo}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-40 ${
                days === p && !dateFrom && !dateTo
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {p} gg
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1">
          <span className="text-xs text-slate-500">Da</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-xs bg-transparent focus:outline-none"
          />
          <span className="text-xs text-slate-500 ml-2">A</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-xs bg-transparent focus:outline-none"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="ml-1 text-slate-400 hover:text-red-500"
              title="Pulisci range date"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            value={clientQuery}
            onChange={e => setClientQuery(e.target.value)}
            placeholder="Cerca cliente o titolo..."
            className="px-3 py-2 pr-8 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white w-56"
          />
          {clientQuery && (
            <button
              onClick={() => setClientQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
              title="Pulisci"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <p className="flex items-center text-sm text-slate-500">
          {loading
            ? '...'
            : clientQuery.trim()
              ? `${filteredCalls.length} di ${calls.length} chiamate`
              : `${calls.length} chiamate`}
        </p>

        {!loading && filteredCalls.some(c => !analyses[c.hubspotId]) && (
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

        {!loading && filteredCalls.length > 0 && (
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            title="Esporta la tabella in CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Esporta CSV
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
                  {batchProgress.label ?? 'Analisi batch'}: {batchProgress.analyzed}/{batchProgress.total} completate
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
                style={{
                  width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                }}
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Data
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Titolo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Owner
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Esito
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  HubSpot
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Analisi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    {clientQuery.trim()
                      ? `Nessun risultato per "${clientQuery}"`
                      : emptyMessage}
                  </td>
                </tr>
              ) : (
                filteredCalls.map(call => {
                  const analysis = analyses[call.hubspotId];
                  const fathomUrl = fathomUrls[call.hubspotId];
                  const isExpanded = expanded === call.hubspotId;
                  const isAnalyzing = analyzing === call.hubspotId;
                  const passedCount = analysis
                    ? Object.values(analysis).filter(r => r.passed).length
                    : null;
                  const goodThreshold = Math.ceil(totalCheckpoints * 0.7);

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
                            <Link
                              href={`/clients/${call.client.id}`}
                              className="text-slate-700 hover:text-emerald-600"
                            >
                              {call.client.name}
                            </Link>
                            {call.client.domain && (
                              <p className="text-xs text-slate-400">{call.client.domain}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        {call.outcome ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              call.outcome === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : call.outcome === 'SCHEDULED'
                                  ? 'bg-blue-100 text-blue-700'
                                  : call.outcome === 'RESCHEDULED'
                                    ? 'bg-amber-100 text-amber-700'
                                    : call.outcome === 'NO_SHOW'
                                      ? 'bg-red-100 text-red-700'
                                      : call.outcome === 'CANCELED'
                                        ? 'bg-slate-100 text-slate-600'
                                        : 'bg-slate-100 text-slate-600'
                            }`}
                          >
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
                              <span
                                className={
                                  passedCount === totalCheckpoints
                                    ? 'text-emerald-600'
                                    : passedCount! >= goodThreshold
                                      ? 'text-amber-600'
                                      : 'text-red-600'
                                }
                              >
                                {passedCount}/{totalCheckpoints}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="mt-2 space-y-2">
                                {checkpointKeys.map(key => {
                                  const r = analysis[key];
                                  if (!r) return null;
                                  const confColor =
                                    r.confidence === 'high'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : r.confidence === 'medium'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-slate-50 text-slate-600 border-slate-200';
                                  const confLabel =
                                    r.confidence === 'high' ? 'alta' : r.confidence === 'medium' ? 'media' : 'bassa';
                                  return (
                                    <div key={key} className="flex gap-2">
                                      {r.passed ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                      ) : (
                                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="text-xs text-slate-700">
                                            {effectiveLabels[key] ?? key}
                                          </p>
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${confColor}`}
                                            title={`Confidenza: ${confLabel}`}
                                          >
                                            {confLabel}
                                          </span>
                                        </div>
                                        {r.evidence && (
                                          <p className="text-[11px] text-slate-500 italic mt-0.5 leading-snug">
                                            &ldquo;{r.evidence}&rdquo;
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
                                  {call.analysis?.analyzedAt && (
                                    <span className="text-[10px] text-slate-400">
                                      Analizzata il{' '}
                                      {format(new Date(call.analysis.analyzedAt), 'd MMM yyyy HH:mm', { locale: it })}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleReAnalyze(call.hubspotId)}
                                    disabled={isAnalyzing || !!batchProgress}
                                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-600 disabled:opacity-50"
                                  >
                                    {isAnalyzing ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RotateCcw className="w-3 h-3" />
                                    )}
                                    Ri-analizza
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : call.matchFailure ? (
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                              title={`${call.matchFailure.reasonMessage} (${call.matchFailure.attempts} tentativi, ultimo ${format(new Date(call.matchFailure.lastAttemptAt), 'd MMM HH:mm', { locale: it })})`}
                            >
                              No Fathom
                            </span>
                            <button
                              onClick={() => handleAnalyze(call.hubspotId)}
                              disabled={isAnalyzing || !!batchProgress}
                              className="text-[11px] text-slate-500 hover:text-emerald-600 disabled:opacity-50"
                            >
                              {isAnalyzing ? 'Riprovo...' : 'Riprova'}
                            </button>
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
      </>)}
    </div>
  );
}
