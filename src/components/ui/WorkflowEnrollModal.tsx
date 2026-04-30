'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { workflowsApi, clientsApi } from '@/lib/api/client';
import type { Contact } from '@/types';
import { X, Loader2, Phone, GraduationCap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AI_VOICE_WORKFLOWS } from '@/lib/config/workflows';

const WORKFLOW_ICONS = {
  'phone': Phone,
  'graduation-cap': GraduationCap,
  'alert-triangle': AlertTriangle,
} as const;

interface Props {
  open: boolean;
  onClose: () => void;
  companyName: string;
  clientId: string;
}

export function WorkflowEnrollModal({ open, onClose, companyName, clientId }: Props) {
  const { token } = useAuthStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; ok: boolean; error?: string } | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    setLoading(true);
    setResult(null);
    setSelectedContact(null);

    clientsApi.getContacts(token, clientId)
      .then(res => setContacts(res.data ?? []))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [open, token, clientId]);

  if (!open) return null;

  const handleEnroll = async (flowId: string) => {
    if (!token || !selectedContact?.hubspotId || !selectedContact.email) return;
    const key = `${flowId}-${selectedContact.hubspotId}`;
    setEnrolling(flowId);
    setResult(null);
    try {
      await workflowsApi.enroll(token, flowId, selectedContact.hubspotId, 'contacts', selectedContact.email);
      setResult({ key, ok: true });
    } catch (err) {
      setResult({ key, ok: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' });
    } finally {
      setEnrolling(null);
    }
  };

  const contactName = selectedContact
    ? [selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(' ') || selectedContact.email || 'Contatto'
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">AI Vocale</h2>
            <p className="text-sm text-slate-500 mt-0.5">{companyName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contact selector */}
        <div className="px-5 py-3 border-b border-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            </div>
          ) : selectedContact ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-xs font-medium text-emerald-700">
                  {((selectedContact.firstName ?? selectedContact.email ?? '?')[0] ?? '?').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{contactName}</p>
                  {selectedContact.email && <p className="text-xs text-slate-400">{selectedContact.email}</p>}
                </div>
              </div>
              <button
                onClick={() => { setSelectedContact(null); setResult(null); }}
                className="text-xs text-emerald-600 hover:text-emerald-700"
              >
                Cambia
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-500 mb-2">Seleziona il contatto da far chiamare:</p>
              {contacts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Nessun contatto associato.</p>
              ) : (
                <ul className="max-h-48 overflow-y-auto space-y-1">
                  {contacts.map(c => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedContact(c)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600">
                          {((c.firstName ?? c.email ?? '?')[0] ?? '?').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-slate-900 truncate">
                            {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email}
                          </p>
                          {c.jobTitle && <p className="text-xs text-slate-400 truncate">{c.jobTitle}</p>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Workflow action cards */}
        {selectedContact && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500 mb-1">Scegli l&apos;azione da avviare per <span className="font-medium text-slate-700">{contactName}</span>:</p>
            {AI_VOICE_WORKFLOWS.map(wf => {
              const Icon = WORKFLOW_ICONS[wf.icon];
              const key = `${wf.hubspotFlowId}-${selectedContact.hubspotId}`;
              const isEnrolling = enrolling === wf.hubspotFlowId;
              const wasEnrolled = result?.key === key && result.ok;
              const hadError = result?.key === key && !result.ok;

              return (
                <div
                  key={wf.hubspotFlowId}
                  className={`border rounded-lg p-4 transition-colors ${wasEnrolled ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg shrink-0 ${wasEnrolled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <Icon className={`w-5 h-5 ${wasEnrolled ? 'text-emerald-600' : 'text-slate-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{wf.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{wf.description}</p>
                    </div>
                    {wasEnrolled ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-medium text-emerald-600">Avviato</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEnroll(wf.hubspotFlowId)}
                        disabled={isEnrolling || !selectedContact.email}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                      >
                        {isEnrolling && <Loader2 className="w-3 h-3 animate-spin" />}
                        Avvia
                      </button>
                    )}
                  </div>
                  {hadError && (
                    <p className="text-xs text-red-500 mt-2">{result?.error}</p>
                  )}
                  {!selectedContact.email && (
                    <p className="text-xs text-amber-600 mt-2">Contatto senza email -- impossibile enrollare.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
