'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { workflowsApi } from '@/lib/api/client';
import type { Workflow, WorkflowObjectType } from '@/types';
import { X, Zap, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  objectId: string;
  objectType: WorkflowObjectType;
  objectLabel: string;
}

const OBJECT_TYPE_ID: Record<WorkflowObjectType, string> = {
  contacts: '0-1',
  companies: '0-2',
};

export function WorkflowEnrollModal({ open, onClose, objectId, objectType, objectLabel }: Props) {
  const { token } = useAuthStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [result, setResult] = useState<{ workflowId: string; ok: boolean; error?: string } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || !token) return;
    setLoading(true);
    setResult(null);
    workflowsApi.list(token)
      .then(res => setWorkflows(res.data ?? []))
      .catch(() => setWorkflows([]))
      .finally(() => setLoading(false));
  }, [open, token]);

  if (!open) return null;

  const compatible = workflows.filter(w =>
    w.isEnabled && w.objectTypeId === OBJECT_TYPE_ID[objectType]
  );

  const filtered = search
    ? compatible.filter(w => w.name.toLowerCase().includes(search.toLowerCase()))
    : compatible;

  const handleEnroll = async (workflowId: string) => {
    if (!token) return;
    setEnrolling(workflowId);
    setResult(null);
    try {
      await workflowsApi.enroll(token, workflowId, objectId, objectType);
      setResult({ workflowId, ok: true });
    } catch (err) {
      setResult({ workflowId, ok: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' });
    } finally {
      setEnrolling(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Enrolla in Workflow</h2>
            <p className="text-sm text-slate-500 mt-0.5">{objectLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100">
          <input
            type="text"
            placeholder="Cerca workflow..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">
              {workflows.length === 0
                ? 'Nessun workflow trovato su HubSpot.'
                : compatible.length === 0
                  ? `Nessun workflow attivo per ${objectType === 'contacts' ? 'contatti' : 'aziende'}.`
                  : 'Nessun risultato per la ricerca.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map(w => {
                const isEnrolling = enrolling === w.id;
                const wasEnrolled = result?.workflowId === w.id && result.ok;
                const hadError = result?.workflowId === w.id && !result.ok;

                return (
                  <li key={w.id} className="border border-slate-200 rounded-lg p-3 flex items-center gap-3 hover:border-slate-300 transition-colors">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{w.name}</p>
                    </div>
                    {wasEnrolled ? (
                      <span className="text-xs font-medium text-emerald-600 shrink-0">Enrollato</span>
                    ) : (
                      <button
                        onClick={() => handleEnroll(w.id)}
                        disabled={isEnrolling}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                      >
                        {isEnrolling && <Loader2 className="w-3 h-3 animate-spin" />}
                        Enrolla
                      </button>
                    )}
                    {hadError && (
                      <p className="text-xs text-red-500 mt-1">{result?.error}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
