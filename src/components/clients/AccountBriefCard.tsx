'use client';

import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import type { AccountBriefPayload } from '@/types';

const SECTIONS: { key: keyof AccountBriefPayload['sections']; label: string }[] = [
  { key: 'sintesiCliente', label: 'Stato cliente & NPS' },
  { key: 'featureSummary', label: 'Feature attive / non attive' },
  { key: 'ticketSummary', label: 'Ultimi ticket aperti' },
  { key: 'campagneSummary', label: 'Ultime campagne WhatsApp' },
  { key: 'utilizzoPiattaforma', label: 'Utilizzo piattaforma' },
  { key: 'rischioChurn', label: 'Rischio churn' },
  { key: 'prossimaBestAction', label: 'Prossima best action' },
];

type Props = {
  brief: AccountBriefPayload | null;
  loading: boolean;
  error: string | null;
  onRegenerate: () => void;
};

export function AccountBriefCard({ brief, loading, error, onRegenerate }: Props) {
  return (
    <Card className="mb-6 border-violet-200/80 bg-gradient-to-br from-violet-50/80 to-white">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
          <div>
            <CardTitle className="text-base">Account brief</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Generato automaticamente all&apos;apertura dell&apos;account (portfolio Marco Manigrassi).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-violet-200 text-violet-800 hover:bg-violet-100/80 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Rigenera
        </button>
      </CardHeader>

      <div className="px-4 pb-4 space-y-3">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 text-red-800 text-sm p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading && !brief && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            Generazione in corso…
          </div>
        )}

        {brief && (
          <>
            <p className="text-xs text-slate-400">
              {formatDistanceToNow(new Date(brief.generatedAt), { addSuffix: true, locale: it })}
              {brief.fallback && ' · Modalità senza AI (configura OPENAI_API_KEY)'}
              {!brief.fallback && brief.model && ` · ${brief.model}`}
            </p>
            <div className="grid gap-4 sm:grid-cols-1">
              {SECTIONS.map(({ key, label }) => (
                <div key={key} className="rounded-lg border border-slate-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold text-violet-900 uppercase tracking-wide mb-1.5">{label}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{brief.sections[key]}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
