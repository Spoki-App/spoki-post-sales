'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { industriesApi } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { ExternalLink, BookOpen, FileText } from 'lucide-react';

export default function IndustriesLibraryPage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [industry, setIndustry] = useState('');
  const [type, setType] = useState<string>('');
  const [items, setItems] = useState<
    Array<{
      id: string;
      contentType: 'use_case' | 'case_study';
      sourceUrl: string;
      title: string;
      summary: string | null;
    }>
  >([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await industriesApi.library(token, {
        industry: industry || undefined,
        type: type === 'use_case' || type === 'case_study' ? type : undefined,
      });
      setItems(res.data?.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [token, industry, type]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) {
    return <p className="text-slate-500 text-sm">Accedi per vedere i contenuti.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Repository interno: popola <code className="text-xs bg-slate-100 px-1 rounded">marketing_content_items</code> (sync
        da sito o import) per vedere i link qui. Filtro per valore <code className="text-xs bg-slate-100 px-1 rounded">industry_spoki</code> come in HubSpot.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={industry}
          onChange={e => setIndustry(e.target.value)}
          placeholder="industry (match HubSpot)…"
          className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm"
        />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm"
        >
          <option value="">Tutti i tipi</option>
          <option value="use_case">Caso d'uso</option>
          <option value="case_study">Caso studio</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700"
        >
          Applica
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-slate-500 text-sm">Nessun contenuto. Aggiungi righe in DB o implementa lo sync.</Card>
      ) : (
        <ul className="space-y-2">
          {items.map(item => (
            <li key={item.id}>
              <Card className="p-4 flex gap-3 items-start">
                <div className="mt-0.5">
                  {item.contentType === 'case_study' ? (
                    <FileText className="w-5 h-5 text-amber-600" />
                  ) : (
                    <BookOpen className="w-5 h-5 text-violet-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={
                        item.contentType === 'case_study'
                          ? 'text-[10px] uppercase font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded'
                          : 'text-[10px] uppercase font-semibold text-violet-800 bg-violet-100 px-1.5 py-0.5 rounded'
                      }
                    >
                      {item.contentType === 'case_study' ? 'Caso studio' : 'Caso d’uso'}
                    </span>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-900 hover:text-violet-700 truncate"
                    >
                      {item.title}
                    </a>
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-600 shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  {item.summary && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{item.summary}</p>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
