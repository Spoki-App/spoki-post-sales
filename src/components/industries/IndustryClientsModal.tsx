'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { aiApi, industriesApi } from '@/lib/api/client';
import { industryFilterParam } from '@/lib/industry-visuals';
import { formatMrrDisplay } from '@/lib/format/mrr';
import { ExternalLink, Sparkles, X } from 'lucide-react';

type ClientRow = { id: string; name: string; plan: string | null; mrr: number | null };

type WaStrategy = {
  title: string;
  objective: string;
  tactics: string[];
  exampleTemplate: string;
  kpis: string[];
  complianceNote: string;
};

interface Props {
  stableIndustryId: string;
  industryLabel: string;
  portfolioClientCount: number | null;
  token: string;
  viewAll: boolean;
  onClose: () => void;
}

export function IndustryClientsModal({
  stableIndustryId,
  industryLabel,
  portfolioClientCount,
  token,
  viewAll,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [waLoading, setWaLoading] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [waSummary, setWaSummary] = useState<string | null>(null);
  const [waStrategies, setWaStrategies] = useState<WaStrategy[]>([]);

  const industryHubspotKey =
    stableIndustryId === '__unclassified__' ? null : stableIndustryId;

  useEffect(() => {
    let cancelled = false;
    industriesApi
      .clients(token, {
        viewAll: viewAll || undefined,
        industry: industryFilterParam(stableIndustryId),
        sort: 'mrr',
        dir: 'desc',
      })
      .then(res => {
        if (cancelled) return;
        const flat =
          res.data?.groups?.flatMap(g =>
            g.clients.map(c => ({
              id: c.id,
              name: c.name,
              plan: c.plan,
              mrr: c.mrr,
            }))
          ) ?? [];
        setRows(flat);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stableIndustryId, token, viewAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleGenerateWaStrategies() {
    setWaError(null);
    setWaLoading(true);
    try {
      const res = await aiApi.generateIndustryWaStrategies(token, {
        industryLabel,
        clientCount: portfolioClientCount,
        industryHubspotKey,
      });
      const data = res.data;
      if (!data) throw new Error('Risposta vuota');
      setWaSummary(data.executiveSummary);
      setWaStrategies(data.strategies ?? []);
    } catch (e) {
      setWaSummary(null);
      setWaStrategies([]);
      setWaError(e instanceof Error ? e.message : 'Generazione non riuscita');
    } finally {
      setWaLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Chiudi"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="industry-clients-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="industry-clients-modal-title" className="text-lg font-semibold text-slate-900">
              Clienti
            </h2>
            <p className="mt-0.5 truncate text-sm font-medium text-violet-700">{industryLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              Ordine: MRR dal più alto al più basso (riflette il peso del piano).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Chiudi finestra"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-5 py-3">
          <button
            type="button"
            onClick={() => void handleGenerateWaStrategies()}
            disabled={waLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-800 shadow-sm transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className={`h-4 w-4 shrink-0 ${waLoading ? 'animate-pulse' : ''}`} />
            {waLoading ? 'Generazione in corso…' : 'Strategie marketing WhatsApp (AI)'}
          </button>
          {waError && <p className="mt-2 text-xs text-red-600">{waError}</p>}
          <p className="mt-1.5 text-xs text-slate-500">
            Suggerimenti operativi per il vertical, ottimizzati per campagne e automazioni su WhatsApp
            Business (Spoki).
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(waSummary || waStrategies.length > 0) && (
            <div className="border-b border-violet-100 bg-violet-50/25 px-4 py-4 sm:px-5">
              {waSummary && (
                <p className="text-sm leading-relaxed text-slate-700">{waSummary}</p>
              )}
              <ul className="mt-4 space-y-4">
                {waStrategies.map((s, idx) => (
                  <li
                    key={`${idx}-${s.title}`}
                    className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm sm:p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                      Strategia {idx + 1}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900">{s.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{s.objective}</p>
                    {s.tactics.length > 0 && (
                      <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-700">
                        {s.tactics.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    )}
                    {s.exampleTemplate?.trim() && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-500">Esempio / template messaggio</p>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-800">
                          {s.exampleTemplate}
                        </pre>
                      </div>
                    )}
                    {s.kpis.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.kpis.map((k, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.complianceNote?.trim() && (
                      <p className="mt-2 text-xs text-amber-800/90">
                        <span className="font-medium">Compliance: </span>
                        {s.complianceNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-2 py-2 sm:px-3">
            {loading ? (
              <div className="flex justify-center py-14">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                Nessun cliente in questo segmento.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="hidden px-2 py-2 font-medium sm:table-cell">Piano</th>
                    <th className="px-3 py-2 text-right font-medium">MRR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/clients/${c.id}`}
                          className="group flex items-center gap-1.5 font-medium text-slate-800 hover:text-violet-700"
                        >
                          <span className="truncate">{c.name}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500 sm:hidden">
                          {c.plan?.trim() ? c.plan : '—'}
                        </p>
                      </td>
                      <td className="hidden max-w-[140px] truncate px-2 py-2.5 text-slate-600 sm:table-cell">
                        {c.plan?.trim() ? c.plan : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                        {formatMrrDisplay(c.mrr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
