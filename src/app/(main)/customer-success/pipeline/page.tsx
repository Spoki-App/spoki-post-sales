'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { customerSuccessApi } from '@/lib/api/client';
import { CsPipelineKanban, type PipelineCard } from '@/components/customer-success/CsPipelineKanban';
import type { CsPipelineStageId } from '@/lib/config/cs-pipeline';

export default function CsPipelinePage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<PipelineCard[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await customerSuccessApi.pipeline(token);
      if (res.data) {
        setCards(res.data.cards);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const moveStage = useCallback(
    async (clientId: string, stage: CsPipelineStageId) => {
      if (!token) return;
      setMoving(true);
      setError(null);
      try {
        await customerSuccessApi.movePipelineStage(token, clientId, stage);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore');
      } finally {
        setMoving(false);
      }
    },
    [token, load]
  );

  if (loading && cards.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Tutti i clienti con il tuo <span className="font-medium">company owner</span> HubSpot. Trascina le card tra le
        colonne per aggiornare la fase (salvataggio automatico).
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <CsPipelineKanban cards={cards} onMove={moveStage} moving={moving} />
    </div>
  );
}
