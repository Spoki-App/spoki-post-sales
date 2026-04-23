'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { industriesApi } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import { formatMrrDisplay } from '@/lib/format/mrr';

const SECTION_KEYS = [
  { id: 'overview', label: 'Overview industry' },
  { id: 'top', label: 'Riferimenti (top clienti per utilizzo)' },
  { id: 'patterns', label: 'Pattern osservabili' },
  { id: 'content', label: 'Casi d’uso / casi studio da citare' },
  { id: 'gaps', label: 'Gap vs benchmark (bozze)' },
  { id: 'next', label: 'Prossimi passi' },
] as const;

export default function IndustriesQbrPage() {
  const { token } = useAuthStore();
  const [industry, setIndustry] = useState('');
  const [viewAll, setViewAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [data, setData] = useState<{
    sampleSize: number;
    topClients: Array<{
      id: string;
      name: string;
      mrr: number | null;
      engagement90d: number;
      healthScore: number | null;
      composite: number;
    }>;
    benchmark: {
      engagement90d: { p50: number | null; p75: number | null; min: number | null; max: number | null };
      healthScore: { p50: number | null; p75: number | null };
    };
    usageNote: string;
  } | null>(null);

  const runBenchmark = useCallback(async () => {
    if (!token || !industry.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await industriesApi.benchmark(token, industry.trim(), { viewAll: viewAll || undefined });
      if (res.data) {
        setData({
          sampleSize: res.data.sampleSize,
          topClients: res.data.topClients,
          benchmark: res.data.benchmark,
          usageNote: res.data.usageNote,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, industry, viewAll]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('industries_qbr_draft');
    if (raw) {
      try {
        const p = JSON.parse(raw) as { industry: string; notes: Record<string, string> };
        if (p.notes) setNotes(p.notes);
        if (p.industry) setIndustry(p.industry);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('industries_qbr_draft', JSON.stringify({ industry, notes }));
  }, [industry, notes]);

  if (!token) {
    return <p className="text-slate-500 text-sm">Accedi per usare i template QBR.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Seleziona un valore <code className="text-xs bg-slate-100 px-1 rounded">industry_spoki</code> (come in HubSpot) per
        generare un benchmark e una bozza strutturata. Il testo è editabile e salvato in locale in questo browser.
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Industry (HubSpot)</label>
          <input
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 min-w-[220px]"
            placeholder="es. valore di industry_spoki"
          />
        </div>
        <label className="text-xs text-slate-600 flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={viewAll} onChange={e => setViewAll(e.target.checked)} />
          Vedi tutto il portafoglio
        </label>
        <button
          type="button"
          onClick={() => void runBenchmark()}
          disabled={!industry.trim() || loading}
          className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Calcolo…' : 'Calcola benchmark'}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900">Benchmark engagement (90g)</h2>
            <p className="text-xs text-slate-500 mt-0.5">N = {data.sampleSize} clienti in questa industry (filtri portafoglio applicati)</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-slate-500">p50</dt>
                <dd className="font-medium">{data.benchmark.engagement90d.p50 ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">p75</dt>
                <dd className="font-medium">{data.benchmark.engagement90d.p75 ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">min / max</dt>
                <dd className="font-medium">
                  {data.benchmark.engagement90d.min ?? '—'} / {data.benchmark.engagement90d.max ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Health p50 / p75</dt>
                <dd className="font-medium">
                  {data.benchmark.healthScore.p50 ?? '—'} / {data.benchmark.healthScore.p75 ?? '—'}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-slate-500 mt-3">{data.usageNote}</p>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900">Top per punteggio interno</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {data.topClients.map(c => (
                <li key={c.id} className="flex justify-between gap-2">
                  <Link href={`/clients/${c.id}`} className="text-violet-700 hover:underline truncate">
                    {c.name}
                  </Link>
                  <span className="text-slate-600 shrink-0">
                    score {c.composite} · {c.engagement90d} eng. · {formatMrrDisplay(c.mrr)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Bozza QBR (editabile)</h2>
        {SECTION_KEYS.map(s => (
          <Card key={s.id} className="p-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">{s.label}</label>
            <textarea
              value={notes[s.id] ?? ''}
              onChange={e => setNotes(n => ({ ...n, [s.id]: e.target.value }))}
              rows={4}
              className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-violet-500 focus:outline-none"
              placeholder="Appunti per la call QBR…"
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
