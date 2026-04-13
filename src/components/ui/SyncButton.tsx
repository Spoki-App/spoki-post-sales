'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { RefreshCw, Check, X, Loader2, Database } from 'lucide-react';

const STEPS = [
  { key: 'companies', label: 'Aziende' },
  { key: 'contacts', label: 'Contatti' },
  { key: 'tickets', label: 'Ticket' },
  { key: 'engagements', label: 'Attività' },
  { key: 'scores', label: 'Health Score' },
] as const;

type StepKey = typeof STEPS[number]['key'];
type StepStatus = 'idle' | 'running' | 'done' | 'error';

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

interface SyncButtonProps {
  secret: string;
  onComplete?: () => void;
}

type DbUsage = { pct: number; pretty: string } | null;

export function SyncButton({ secret, onComplete }: SyncButtonProps) {
  const [dbUsage, setDbUsage] = useState<DbUsage>(null);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<StepKey, StepStatus>>({
    companies: 'idle', contacts: 'idle', tickets: 'idle',
    engagements: 'idle', scores: 'idle',
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [showSteps, setShowSteps] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [currentStepElapsed, setCurrentStepElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepStartRef = useRef(0);
  const syncStartRef = useRef(0);

  const fetchDbUsage = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/system/db-usage');
      const d = await r.json() as { pct: number; pretty: string };
      setDbUsage(d);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDbUsage(); }, [fetchDbUsage]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    stepStartRef.current = Date.now();
    stopTimer();
    timerRef.current = setInterval(() => {
      setCurrentStepElapsed(Date.now() - stepStartRef.current);
      setTotalElapsed(Date.now() - syncStartRef.current);
    }, 500);
  }, [stopTimer]);

  async function runSync() {
    setRunning(true);
    setShowSteps(true);
    setStatuses({ companies: 'idle', contacts: 'idle', tickets: 'idle', engagements: 'idle', scores: 'idle' });
    setCounts({});
    setDurations({});
    setTotalElapsed(0);
    setCurrentStepElapsed(0);
    syncStartRef.current = Date.now();

    for (const step of STEPS) {
      setStatuses(s => ({ ...s, [step.key]: 'running' }));
      startTimer();
      const t0 = Date.now();
      try {
        const res = await fetch(`/api/v1/hubspot/sync?secret=${secret}&type=${step.key}`);
        const data = await res.json() as { success: boolean; count?: number; calculated?: number };
        const elapsed = Date.now() - t0;
        if (!data.success) throw new Error('failed');
        setCounts(c => ({ ...c, [step.key]: data.count ?? data.calculated ?? 0 }));
        setDurations(d => ({ ...d, [step.key]: elapsed }));
        setStatuses(s => ({ ...s, [step.key]: 'done' }));
      } catch {
        setDurations(d => ({ ...d, [step.key]: Date.now() - t0 }));
        setStatuses(s => ({ ...s, [step.key]: 'error' }));
        stopTimer();
        setTotalElapsed(Date.now() - syncStartRef.current);
        setRunning(false);
        return;
      }
    }

    stopTimer();
    setTotalElapsed(Date.now() - syncStartRef.current);
    setCurrentStepElapsed(0);
    setRunning(false);
    fetchDbUsage();
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
        {running ? `Sincronizzazione... ${formatElapsed(totalElapsed)}` : 'Sincronizza HubSpot'}
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
                  {status === 'running' && (
                    <span className="ml-1 text-blue-400 tabular-nums">{formatElapsed(currentStepElapsed)}</span>
                  )}
                  {status === 'done' && (
                    <span className="ml-1 text-slate-400">
                      ({counts[step.key] !== undefined ? `${counts[step.key]} ` : ''}{durations[step.key] ? formatElapsed(durations[step.key]) : ''})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          {allDone && (
            <p className="pt-1 text-emerald-600 font-medium">
              Sincronizzazione completata in {formatElapsed(totalElapsed)}.
            </p>
          )}
          {dbUsage && (
            <div className="pt-2 border-t border-slate-200 mt-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Database className="w-3.5 h-3.5" />
                <span>Database: {dbUsage.pretty} ({dbUsage.pct}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${dbUsage.pct >= 90 ? 'bg-red-500' : dbUsage.pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(dbUsage.pct, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
