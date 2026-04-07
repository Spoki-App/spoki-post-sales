'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { clientsApi, tasksApi, onboardingApi } from '@/lib/api/client';
import { Badge } from '@/components/ui/Badge';
import { OnboardingStageBadge } from '@/components/ui/OnboardingStageBadge';
import type { OnboardingStageType } from '@/lib/config/pipelines';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { WorkflowEnrollModal } from '@/components/ui/WorkflowEnrollModal';
import { ArrowLeft, Phone, Globe, Building2, Mail, Calendar, AlertTriangle, CheckSquare, MessageSquare, Zap } from 'lucide-react';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Client, Ticket, Engagement, Contact, Task, OnboardingProgress } from '@/types';

type ClientWithStage = Client & {
  onboardingStage?: string | null;
  onboardingStageType?: string | null;
};

type Tab = 'activities' | 'tickets' | 'onboarding' | 'tasks' | 'contacts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'activities', label: 'Attività' },
  { id: 'tickets', label: 'Ticket' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'tasks', label: 'Task' },
  { id: 'contacts', label: 'Contatti' },
];

const ENGAGEMENT_ICONS: Record<string, string> = {
  CALL: '📞', EMAIL: '✉️', MEETING: '🤝', NOTE: '📝', TASK: '✅', INCOMING_EMAIL: '📩', FORWARDED_EMAIL: '↗️',
};

const ENGAGEMENT_LABELS: Record<string, string> = {
  CALL: 'Chiamata', EMAIL: 'Email', MEETING: 'Meeting', NOTE: 'Nota', TASK: 'Task',
  INCOMING_EMAIL: 'Email ricevuta', FORWARDED_EMAIL: 'Email inoltrata',
};

const CALL_DISPOSITIONS: Record<string, string> = {
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'Connected',
  '73a0d17f-1163-4015-bdd5-ec830791da20': 'No answer',
  '9d9162e7-6cf3-4944-bf63-4dff82258764': 'Busy',
  'db37fe00-d85a-48ca-9d40-4804618badb7': 'Hung up',
  'b2cf5968-551e-4856-9783-52b3da59a7d0': 'Left voicemail',
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff': 'Left message',
  'ce83dc56-e767-4510-b02f-4c68126e8154': 'Unreachable',
  '17b47fee-58de-441e-a44c-c6300d46f273': 'Wrong number',
  'e66e054e-e6cd-4b16-8cb3-2e0425cf1ceb': 'Attemping',
  'b9460aeb-2920-4fb2-b4ff-f74290eaf362': 'Activation Failed',
  'da6760a4-13e3-4778-a8d1-7e6af09565e4': 'Technical issue',
  '9d6999c0-0232-4010-9cb9-a7cea1c4f4fd': 'Blocked',
  '6e625bfd-4d6c-4d7a-85ef-5e9251635c81': 'Invalid format',
};

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuthStore();
  const [client, setClient] = useState<ClientWithStage | null>(null);
  const [tab, setTab] = useState<Tab>('activities');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingProgress | null>(null);
  const [onboardingHistory, setOnboardingHistory] = useState<{
    steps: Array<{ id: string; label: string; completedAt: string | null }>;
    currentStage: string | null;
    currentStageId: string | null;
    ticketHubspotId: string | null;
    issues: Array<{ label: string; occurredAt: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleTab, setRoleTab] = useState<string>('all');
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await clientsApi.get(token, id);
        if (res.data) setClient(res.data as ClientWithStage);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    if (tab === 'tickets' && tickets.length === 0) {
      clientsApi.getTickets(token, id).then(r => setTickets(r.data ?? []));
    }
    if (tab === 'activities' && engagements.length === 0) {
      clientsApi.getEngagements(token, id).then(r => setEngagements(r.data ?? []));
    }
    if (tab === 'contacts' && contacts.length === 0) {
      clientsApi.getContacts(token, id).then(r => setContacts(r.data ?? []));
    }
    if (tab === 'tasks' && tasks.length === 0) {
      tasksApi.list(token, { clientId: id }).then(r => setTasks(r.data ?? []));
    }
    if (tab === 'onboarding' && !onboardingHistory) {
      clientsApi.getOnboardingHistory(token, id).then(r => setOnboardingHistory(r.data ?? null));
    }
    if (tab === 'onboarding' && !onboarding) {
      onboardingApi.getProgress(token, id).then(r => setOnboarding(r.data ?? null));
    }
  }, [tab, token, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return <div className="p-6 text-slate-500">Cliente non trovato.</div>;
  }

  const renewalDays = client.renewalDate ? differenceInDays(new Date(client.renewalDate), new Date()) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <ArrowLeft className="w-4 h-4" /> Torna ai clienti
      </Link>

      {/* Client header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{client.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {client.domain && (
              <a href={`https://${client.domain}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600">
                <Globe className="w-3.5 h-3.5" />{client.domain}
              </a>
            )}
            {client.phone && (
              <span className="flex items-center gap-1 text-sm text-slate-500">
                <Phone className="w-3.5 h-3.5" />{client.phone}
              </span>
            )}
            {client.industry && (
              <span className="flex items-center gap-1 text-sm text-slate-500">
                <Building2 className="w-3.5 h-3.5" />{client.industry}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWorkflowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            Workflow
          </button>
          {client.onboardingStage && (
            <OnboardingStageBadge
              label={client.onboardingStage}
              type={(client.onboardingStageType ?? 'normal') as OnboardingStageType}
              size="md"
            />
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">MRR</p>
          <p className="text-lg font-semibold text-slate-900">
            {client.mrr ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(client.mrr) : '—'}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">Piano</p>
          <p className="text-lg font-semibold text-slate-900">{client.plan ?? '—'}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">Rinnovo</p>
          {client.renewalDate ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">{format(new Date(client.renewalDate), 'd MMM yyyy', { locale: it })}</p>
              {renewalDays !== null && (
                <p className={`text-xs ${renewalDays <= 14 ? 'text-red-600' : renewalDays <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                  {renewalDays <= 0 ? 'Scaduto' : `Tra ${renewalDays} giorni`}
                </p>
              )}
            </div>
          ) : <p className="text-slate-400">—</p>}
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">Sincronizzato</p>
          <p className="text-sm text-slate-700">
            {formatDistanceToNow(new Date(client.lastSyncedAt), { addSuffix: true, locale: it })}
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'activities' && (
        <Card padding="none">
          {engagements.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Nessuna attivita' registrata.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {engagements.map(e => {
                const eng = e as typeof e & { emailFrom?: string; emailTo?: string; callDirection?: string; callDisposition?: string; callTitle?: string };
                return (
                  <li key={e.id}>
                    <a
                      href={e.type === 'CALL'
                        ? `https://app-eu1.hubspot.com/contacts/47964451/company/${client.hubspotId}/?engagement=${e.hubspotId}`
                        : `https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${client.hubspotId}/view/1?engagement=${e.hubspotId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-lg mt-0.5">{ENGAGEMENT_ICONS[e.type] ?? '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {ENGAGEMENT_LABELS[e.type] ?? e.type}
                          {e.type === 'CALL' && eng.callDirection && (
                            <span className="font-normal text-slate-400"> ({eng.callDirection === 'INBOUND' ? 'in entrata' : 'in uscita'})</span>
                          )}
                        </p>
                        {e.type === 'CALL' ? (
                          <>
                            {eng.callTitle && <p className="text-sm text-slate-500 truncate">{eng.callTitle}</p>}
                            {eng.callDisposition && <p className="text-xs text-slate-400">{CALL_DISPOSITIONS[eng.callDisposition] ?? eng.callDisposition}</p>}
                          </>
                        ) : (e.type === 'EMAIL' || e.type === 'INCOMING_EMAIL' || e.type === 'FORWARDED_EMAIL') && eng.emailFrom ? (
                          <p className="text-sm text-slate-500">{eng.emailFrom} → {eng.emailTo ?? '—'}</p>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-400 shrink-0">
                        {formatDistanceToNow(new Date(e.occurredAt), { addSuffix: true, locale: it })}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'tickets' && (
        <Card padding="none">
          {tickets.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Nessun ticket trovato.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tickets.map(t => (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{t.subject ?? '(nessun oggetto)'}</p>
                    <div className="flex gap-2 shrink-0">
                      {t.priority && (
                        <Badge
                          variant={t.priority === 'HIGH' ? 'danger' : t.priority === 'MEDIUM' ? 'warning' : 'default'}
                          size="sm"
                        >
                          {t.priority}
                        </Badge>
                      )}
                      {t.closedAt ? (
                        <Badge variant="success" size="sm">Chiuso</Badge>
                      ) : (
                        <Badge variant="info" size="sm">Aperto</Badge>
                      )}
                    </div>
                  </div>
                  {t.openedAt && (
                    <p className="text-xs text-slate-400">
                      Aperto {formatDistanceToNow(new Date(t.openedAt), { addSuffix: true, locale: it })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'onboarding' && (
        <div className="space-y-4">
          <Card>
            {!onboardingHistory || onboardingHistory.steps.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">Nessun ticket di onboarding trovato per questo cliente.</p>
              </div>
            ) : (() => {
              const completed = onboardingHistory.steps.filter(s => s.completedAt).length;
              const total = onboardingHistory.steps.length;
              const pct = Math.round((completed / total) * 100);
              const isComplete = onboardingHistory.currentStageId === '1005076483';

              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle>Progresso onboarding</CardTitle>
                    <div className="flex items-center gap-3">
                      {onboardingHistory.currentStage && (
                        <span className="text-xs text-slate-500">
                          Stato attuale: <span className="font-medium text-slate-700">{onboardingHistory.currentStage}</span>
                        </span>
                      )}
                      <span className={`text-sm font-semibold ${isComplete ? 'text-emerald-600' : 'text-slate-700'}`}>{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full mb-6 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <ul className="space-y-1">
                    {onboardingHistory.steps.map((step, i) => {
                      const done = !!step.completedAt;
                      const isCurrent = step.id === onboardingHistory.currentStageId;
                      return (
                        <li key={step.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isCurrent ? 'bg-blue-50' : ''}`}>
                          <div className="flex items-center justify-center w-6">
                            {done ? (
                              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : isCurrent ? (
                              <div className="w-5 h-5 rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-white" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                            )}
                            {i < onboardingHistory.steps.length - 1 && (
                              <div className={`absolute ml-[9px] mt-10 w-0.5 h-4 ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${done ? 'text-slate-900 font-medium' : isCurrent ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                              {step.label}
                            </p>
                          </div>
                          {step.completedAt && (
                            <p className="text-xs text-slate-400 shrink-0">
                              {format(new Date(step.completedAt), 'd MMM yyyy', { locale: it })}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}
          </Card>

          {onboardingHistory?.issues && onboardingHistory.issues.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Problemi riscontrati</CardTitle></CardHeader>
              <ul className="space-y-2">
                {onboardingHistory.issues.map((issue, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                      {issue.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {format(new Date(issue.occurredAt), 'd MMM yyyy', { locale: it })}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <Card padding="none">
          {tasks.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Nessun task per questo cliente.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks.map(t => (
                <li key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <CheckSquare className={`w-4 h-4 shrink-0 ${t.status === 'done' ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</p>
                    {t.dueDate && <p className="text-xs text-slate-400">Scadenza: {format(new Date(t.dueDate), 'd MMM yyyy', { locale: it })}</p>}
                  </div>
                  <Badge
                    variant={t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'default'}
                    size="sm"
                  >
                    {t.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <WorkflowEnrollModal
        open={showWorkflowModal}
        onClose={() => setShowWorkflowModal(false)}
        companyHubspotId={client.hubspotId}
        companyName={client.name}
        clientId={id}
      />

      {tab === 'contacts' && (() => {
        const ROLES = ['Admin & Finance', 'Buyer Contact', 'Marketing', 'Usage'] as const;
        type ContactWithRoles = Contact & { communicationRoles?: string[] };

        const allContacts = contacts as ContactWithRoles[];

        // Filter buttons (API-based, reloads contacts)
        const filterButtons = (
          <div className="flex gap-2 flex-wrap">
            {(['', ...ROLES] as const).map(role => (
              <button
                key={role || 'all'}
                onClick={async () => {
                  if (!token) return;
                  const res = await clientsApi.getContacts(token, id, role || undefined);
                  setContacts(res.data ?? []);
                  setRoleTab('all');
                }}
                className="px-3 py-1.5 text-xs rounded-full border transition-colors border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                {role || 'Tutti'}
              </button>
            ))}
          </div>
        );

        // Role tabs (client-side grouping)
        const roleTabs = (
          <div className="border-b border-slate-200">
            <div className="flex gap-1 overflow-x-auto">
              {(['all', ...ROLES] as const).map(role => {
                const count = role === 'all'
                  ? allContacts.length
                  : allContacts.filter(c => c.communicationRoles?.includes(role)).length;
                const active = roleTab === role;
                return (
                  <button
                    key={role}
                    onClick={() => setRoleTab(role)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      active ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {role === 'all' ? 'Tutti' : role}
                    <span className={`ml-1.5 text-xs ${active ? 'text-blue-500' : 'text-slate-400'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        );

        const visibleContacts = roleTab === 'all'
          ? allContacts
          : allContacts.filter(c => c.communicationRoles?.includes(roleTab));

        const contactList = (
          <Card padding="none">
            {visibleContacts.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Nessun contatto per questo ruolo.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleContacts.map(c => (
                  <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
                      {((c.firstName ?? c.email ?? '?')[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {c.email && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Mail className="w-3 h-3" />{c.email}
                          </span>
                        )}
                        {c.jobTitle && <span className="text-xs text-slate-400">{c.jobTitle}</span>}
                      </div>
                      {c.communicationRoles?.length ? (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.communicationRoles.map(role => (
                            <span key={role} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">
                              {role}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {c.lastActivityAt && (
                      <p className="text-xs text-slate-400 shrink-0">
                        {formatDistanceToNow(new Date(c.lastActivityAt), { addSuffix: true, locale: it })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );

        return (
          <div className="space-y-3">
            {filterButtons}
            {roleTabs}
            {contactList}
          </div>
        );
      })()}
    </div>
  );
}
