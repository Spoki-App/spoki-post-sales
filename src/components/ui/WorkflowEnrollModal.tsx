'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { workflowsApi, clientsApi } from '@/lib/api/client';
import type { Workflow, WorkflowObjectType, Contact, Ticket } from '@/types';
import { X, Zap, Loader2, Building2, User, Tag } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  companyHubspotId: string;
  companyName: string;
  clientId: string;
}

const OBJECT_TYPE_ID: Record<WorkflowObjectType, string> = {
  contacts: '0-1',
  companies: '0-2',
  tickets: '0-5',
};

const TABS: { id: WorkflowObjectType; label: string; icon: typeof Building2 }[] = [
  { id: 'companies', label: 'Azienda', icon: Building2 },
  { id: 'contacts', label: 'Contatto', icon: User },
  { id: 'tickets', label: 'Ticket', icon: Tag },
];

export function WorkflowEnrollModal({ open, onClose, companyHubspotId, companyName, clientId }: Props) {
  const { token } = useAuthStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; ok: boolean; error?: string } | null>(null);
  const [search, setSearch] = useState('');
  const [objectType, setObjectType] = useState<WorkflowObjectType>('companies');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    setLoading(true);
    setResult(null);
    setSelectedContact(null);
    setSelectedTicket(null);
    setObjectType('companies');
    setSearch('');

    Promise.all([
      workflowsApi.list(token).then(res => setWorkflows(res.data ?? [])).catch(() => setWorkflows([])),
      clientsApi.getContacts(token, clientId).then(res => setContacts(res.data ?? [])).catch(() => setContacts([])),
      clientsApi.getTickets(token, clientId).then(res => setTickets(res.data ?? [])).catch(() => setTickets([])),
    ]).finally(() => setLoading(false));
  }, [open, token, clientId]);

  if (!open) return null;

  const compatible = workflows.filter(w =>
    w.isEnabled && w.objectTypeId === OBJECT_TYPE_ID[objectType]
  );

  const filtered = search
    ? compatible.filter(w => w.name.toLowerCase().includes(search.toLowerCase()))
    : compatible;

  const currentObjectId = objectType === 'companies'
    ? companyHubspotId
    : objectType === 'contacts'
      ? selectedContact?.hubspotId
      : selectedTicket?.hubspotId;

  const currentLabel = objectType === 'companies'
    ? companyName
    : objectType === 'contacts'
      ? selectedContact
        ? [selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(' ') || selectedContact.email || 'Contatto'
        : null
      : selectedTicket
        ? selectedTicket.subject || `Ticket #${selectedTicket.hubspotId}`
        : null;

  const handleEnroll = async (workflowId: string) => {
    if (!token || !currentObjectId) return;
    const key = `${workflowId}-${currentObjectId}`;
    setEnrolling(workflowId);
    setResult(null);
    try {
      await workflowsApi.enroll(token, workflowId, currentObjectId, objectType, selectedContact?.email ?? undefined);
      setResult({ key, ok: true });
    } catch (err) {
      setResult({ key, ok: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' });
    } finally {
      setEnrolling(null);
    }
  };

  const needsSelection = (objectType === 'contacts' && !selectedContact) || (objectType === 'tickets' && !selectedTicket);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Enrolla in Workflow</h2>
            <p className="text-sm text-slate-500 mt-0.5">{companyName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Object type tabs */}
        <div className="flex border-b border-slate-200">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setObjectType(t.id); setSelectedContact(null); setSelectedTicket(null); setResult(null); setSearch(''); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                objectType === t.id
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Contact selector */}
        {objectType === 'contacts' && (
          <div className="px-5 py-3 border-b border-slate-100">
            {selectedContact ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-xs font-medium text-emerald-700">
                    {((selectedContact.firstName ?? selectedContact.email ?? '?')[0] ?? '?').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {[selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(' ') || selectedContact.email}
                    </p>
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
                <p className="text-xs text-slate-500 mb-2">Seleziona un contatto:</p>
                {contacts.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Nessun contatto associato.</p>
                ) : (
                  <ul className="max-h-40 overflow-y-auto space-y-1">
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
        )}

        {/* Ticket selector */}
        {objectType === 'tickets' && (
          <div className="px-5 py-3 border-b border-slate-100">
            {selectedTicket ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedTicket.subject || `Ticket #${selectedTicket.hubspotId}`}
                    </p>
                    <p className="text-xs text-slate-400">{selectedTicket.status ?? 'Senza stato'}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedTicket(null); setResult(null); }}
                  className="text-xs text-emerald-600 hover:text-emerald-700"
                >
                  Cambia
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-500 mb-2">Seleziona un ticket:</p>
                {tickets.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Nessun ticket associato.</p>
                ) : (
                  <ul className="max-h-40 overflow-y-auto space-y-1">
                    {tickets.map(t => (
                      <li key={t.id}>
                        <button
                          onClick={() => setSelectedTicket(t)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                        >
                          <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-slate-900 truncate">
                              {t.subject || `Ticket #${t.hubspotId}`}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{t.status ?? 'Senza stato'}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        {!needsSelection && (
          <div className="px-5 py-3 border-b border-slate-100">
            <input
              type="text"
              placeholder="Cerca workflow..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Workflow list */}
        {!needsSelection && (
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">
                {workflows.length === 0
                  ? 'Nessun workflow trovato su HubSpot.'
                  : compatible.length === 0
                    ? `Nessun workflow attivo per ${objectType === 'contacts' ? 'contatti' : objectType === 'tickets' ? 'ticket' : 'aziende'}.`
                    : 'Nessun risultato per la ricerca.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {filtered.map(w => {
                  const isEnrolling = enrolling === w.id;
                  const key = `${w.id}-${currentObjectId}`;
                  const wasEnrolled = result?.key === key && result.ok;
                  const hadError = result?.key === key && !result.ok;

                  return (
                    <li key={w.id} className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors">
                      <div className="flex items-center gap-3">
                        <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{w.name}</p>
                          {currentLabel && (
                            <p className="text-xs text-slate-400 truncate">{currentLabel}</p>
                          )}
                        </div>
                        {wasEnrolled ? (
                          <span className="text-xs font-medium text-emerald-600 shrink-0">Enrollato</span>
                        ) : (
                          <button
                            onClick={() => handleEnroll(w.id)}
                            disabled={isEnrolling}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                          >
                            {isEnrolling && <Loader2 className="w-3 h-3 animate-spin" />}
                            Enrolla
                          </button>
                        )}
                      </div>
                      {hadError && (
                        <p className="text-xs text-red-500 mt-2">{result?.error}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
