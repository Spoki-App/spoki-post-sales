'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { clientsApi, tasksApi, onboardingApi } from '@/lib/api/client';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { Badge } from '@/components/ui/Badge';
import { OnboardingStageBadge } from '@/components/ui/OnboardingStageBadge';
import type { OnboardingStageType } from '@/lib/config/pipelines';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { ArrowLeft, Phone, Globe, Building2, Mail, Calendar, AlertTriangle, CheckSquare, MessageSquare } from 'lucide-react';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Client, HealthScore, Ticket, Engagement, Contact, Task, OnboardingProgress, HealthStatus } from '@/types';

type ClientWithStage = Client & {
  healthScore: HealthScore | null;
  onboardingStage?: string | null;
  onboardingStageType?: string | null;
};

type Tab = 'overview' | 'activities' | 'tickets' | 'onboarding' | 'tasks' | 'contacts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activities', label: 'Attività' },
  { id: 'tickets', label: 'Ticket' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'tasks', label: 'Task' },
  { id: 'contacts', label: 'Contatti' },
];

const ENGAGEMENT_ICONS: Record<string, string> = {
  CALL: '📞', EMAIL: '✉️', MEETING: '🤝', NOTE: '📝', TASK: '✅',
};

function ScoreBar({ label, value, max = 25 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuthStore();
  const [client, setClient] = useState<ClientWithStage | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleTab, setRoleTab] = useState<string>('all');

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

  const hs = client.healthScore;
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
          {client.onboardingStage && (
            <OnboardingStageBadge
              label={client.onboardingStage}
              type={(client.onboardingStageType ?? 'normal') as OnboardingStageType}
              size="md"
            />
          )}
          {hs && <HealthBadge status={hs.status as HealthStatus} score={hs.score} />}
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

      {/* Tab content */}
      {tab === 'overview' && hs && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Breakdown Health Score</CardTitle></CardHeader>
            <div className="space-y-3">
              <ScoreBar label="Ultimo contatto" value={hs.scoreLastContact} />
              <ScoreBar label="Ticket aperti" value={hs.scoreTickets} />
              <ScoreBar label="Onboarding" value={hs.scoreOnboarding} />
              <ScoreBar label="Rinnovo" value={hs.scoreRenewal} />
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Dettagli</CardTitle></CardHeader>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Giorni dall\'ultimo contatto', hs.daysSinceLastContact !== null ? `${hs.daysSinceLastContact} giorni` : 'N/D'],
                ['Ticket aperti', String(hs.openTicketsCount)],
                ['Ticket alta priorità', String(hs.openHighTicketsCount)],
                ['Onboarding completato', `${hs.onboardingPct}%`],
                ['Giorni al rinnovo', hs.daysToRenewal !== null ? `${hs.daysToRenewal} giorni` : 'N/D'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {tab === 'overview' && !hs && (
        <Card><p className="text-slate-400 text-sm text-center py-8">Health score non ancora calcolato. Avvia una sync HubSpot.</p></Card>
      )}

      {tab === 'activities' && (
        <Card padding="none">
          {engagements.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Nessuna attività registrata.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {engagements.map(e => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="text-lg mt-0.5">{ENGAGEMENT_ICONS[e.type] ?? '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{e.type}</p>
                    {e.title && <p className="text-sm text-slate-500 truncate">{e.title}</p>}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">
                    {formatDistanceToNow(new Date(e.occurredAt), { addSuffix: true, locale: it })}
                  </p>
                </li>
              ))}
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
        <Card>
          {!onboarding ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm mb-4">Nessun onboarding avviato per questo cliente.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <CardTitle>Progresso onboarding</CardTitle>
                <span className="text-sm font-semibold text-slate-700">{Math.round(onboarding.pctComplete)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full mb-5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${onboarding.pctComplete}%` }}
                />
              </div>
              <ul className="space-y-2">
                {onboarding.steps.map(step => (
                  <li key={step.id} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      step.completedAt ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                    }`}>
                      {step.completedAt && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm ${step.completedAt ? 'line-through text-slate-400' : 'text-slate-700'}`}>{step.label}</p>
                      {step.completedAt && (
                        <p className="text-xs text-slate-400">
                          Completato {format(new Date(step.completedAt), 'd MMM yyyy', { locale: it })}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
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
