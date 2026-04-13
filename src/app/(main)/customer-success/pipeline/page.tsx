'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { customerSuccessApi } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { CS_PIPELINE_STAGES, type CsPipelineStageId } from '@/lib/config/cs-pipeline';
import { formatMrrDisplay } from '@/lib/format/mrr';
import Link from 'next/link';
import { Plus } from 'lucide-react';

type CardRow = {
  clientId: string;
  stage: string;
  name: string;
  hubspotId: string;
  mrr: number | null;
  activatedAt: string | null;
};

export default function CsPipelinePage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [eligible, setEligible] = useState<Array<{ id: string; hubspotId: string; name: string; mrr: number | null }>>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await customerSuccessApi.pipeline(token);
      if (res.data) {
        setCards(res.data.cards);
        setEligible(res.data.eligibleToAdd);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const byStage = useMemo(() => {
    const m = new Map<string, CardRow[]>();
    for (const s of CS_PIPELINE_STAGES) {
      m.set(s.id, []);
    }
    for (const c of cards) {
      const list = m.get(c.stage) ?? [];
      list.push(c);
      m.set(c.stage, list);
    }
    return m;
  }, [cards]);

  async function addClient(clientId: string) {
    if (!token) return;
    try {
      await customerSuccessApi.addToPipeline(token, clientId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    }
  }

  async function moveStage(clientId: string, stage: CsPipelineStageId) {
    if (!token) return;
    try {
      await customerSuccessApi.movePipelineStage(token, clientId, stage);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    }
  }

  if (loading && cards.length === 0 && eligible.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Pipeline success dopo <span className="font-medium">attivazione</span> (ticket onboarding in stato Activated). Solo clienti con il tuo stesso company owner.
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {eligible.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Da aggiungere (attivati, non ancora in pipeline)</p>
          <ul className="flex flex-wrap gap-2">
            {eligible.map(e => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => addClient(e.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-violet-300 text-sm text-violet-800 hover:bg-violet-50"
                >
                  <Plus className="w-4 h-4" />
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 items-start">
        {CS_PIPELINE_STAGES.map(col => (
          <div key={col.id} className="min-w-[220px] max-w-[260px] shrink-0">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">
              {col.label}
              <span className="ml-1 text-slate-400 font-normal">({byStage.get(col.id)?.length ?? 0})</span>
            </div>
            <div className="space-y-2">
              {(byStage.get(col.id) ?? []).map(c => (
                <Card key={c.clientId} className="p-3 shadow-sm">
                  <Link href={`/clients/${c.clientId}`} className="font-medium text-slate-900 text-sm hover:text-violet-700">
                    {c.name}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">{formatMrrDisplay(c.mrr)}</p>
                  <select
                    className="mt-2 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white"
                    value={c.stage}
                    onChange={e => moveStage(c.clientId, e.target.value as CsPipelineStageId)}
                  >
                    {CS_PIPELINE_STAGES.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
