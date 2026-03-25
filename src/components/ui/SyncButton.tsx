'use client';

import { useState } from 'react';
import { RefreshCw, Check, X, Loader2 } from 'lucide-react';

const STEPS = [
  { key: 'companies', label: 'Aziende' },
  { key: 'contacts', label: 'Contatti' },
  { key: 'tickets', label: 'Ticket' },
  { key: 'engagements', label: 'Attività' },
  { key: 'scores', label: 'Health Score' },
] as const;

type StepKey = typeof STEPS[number]['key'];
type StepStatus = 'idle' | 'running' | 'done' | 'error';

interface SyncButtonProps {
  secret: string;
  onComplete?: () => void;
}

export function SyncButton({ secret, onComplete }: SyncButtonProps) {
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<StepKey, StepStatus>>({
    companies: 'idle', contacts: 'idle', tickets: 'idle',
    engagements: 'idle', scores: 'idle',
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [showSteps, setShowSteps] = useState(false);

  async function runSync() {
    setRunning(true);
    setShowSteps(true);
    setStatuses({ companies: 'idle', contacts: 'idle', tickets: 'idle', engagements: 'idle', scores: 'idle' });
    setCounts({});

    for (const step of STEPS) {
      setStatuses(s => ({ ...s, [step.key]: 'running' }));
      try {
        const res = await fetch(`/api/v1/hubspot/sync?secret=${secret}&type=${step.key}`);
        const data = await res.json() as { success: boolean; count?: number; calculated?: number };
        if (!data.success) throw new Error('failed');
        setCounts(c => ({ ...c, [step.key]: data.count ?? data.calculated ?? 0 }));
        setStatuses(s => ({ ...s, [step.key]: 'done' }));
      } catch {
        setStatuses(s => ({ ...s, [step.key]: 'error' }));
        setRunning(false);
        return;
      }
    }

    setRunning(false);
    onComplete?.();
  }

  const allDone = Object.values(statuses).every(s => s === 'done');

  return (
    <div>
      <button
        onClick={runSync}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {running ? 'Sincronizzazione...' : 'Sincronizza HubSpot'}
      </button>

      {showSteps && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          {STEPS.map(step => {
            const status = statuses[step.key];
            return (
              <div key={step.key} className="flex items-center gap-3">
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                  {status === 'done' && <Check className="w-4 h-4 text-emerald-500" />}
                  {status === 'error' && <X className="w-4 h-4 text-red-500" />}
                  {status === 'idle' && <div className="w-3 h-3 rounded-full bg-slate-300" />}
                </div>
                <span className={status === 'done' ? 'text-slate-700' : status === 'running' ? 'text-blue-700 font-medium' : 'text-slate-400'}>
                  {step.label}
                  {status === 'done' && counts[step.key] !== undefined && (
                    <span className="ml-1 text-slate-400">({counts[step.key]})</span>
                  )}
                </span>
              </div>
            );
          })}
          {allDone && (
            <p className="pt-1 text-emerald-600 font-medium">Sincronizzazione completata.</p>
          )}
        </div>
      )}
    </div>
  );
}
