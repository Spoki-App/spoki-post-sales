'use client';

import { useState, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { clientsApi, tasksApi, onboardingApi } from '@/lib/api/client';
import { Badge } from '@/components/ui/Badge';
import { OnboardingStageBadge } from '@/components/ui/OnboardingStageBadge';
import type { OnboardingStageType } from '@/lib/config/pipelines';
import { MARCO_MANIGRASSI_HUBSPOT_OWNER_ID } from '@/lib/config/owners';
import { AccountBriefCard } from '@/components/clients/AccountBriefCard';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { getOwnerName } from '@/lib/config/owners';
import { WorkflowEnrollModal } from '@/components/ui/WorkflowEnrollModal';
import { EmailGeneratorModal } from '@/components/ui/EmailGeneratorModal';
import { QbrModal } from '@/components/ui/QbrModal';
import { ArrowLeft, Phone, Globe, Building2, Mail, Calendar, AlertTriangle, CheckSquare, MessageSquare, Zap, Sparkles, Loader2, Presentation, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Client, ClientGoal, ClientDeal, Ticket, Engagement, Contact, Task, OnboardingProgress, AccountBriefPayload } from '@/types';
import { TrendingUp, DollarSign } from 'lucide-react';
import { formatMrrDisplay } from '@/lib/format/mrr';
import { MrrTrendChart } from '@/components/dashboard/MrrTrendChart';
import { PaymentStatusCard } from '@/components/dashboard/PaymentStatusCard';
import { SubscriptionTimeline } from '@/components/dashboard/SubscriptionTimeline';
import { AccountForecast } from '@/components/dashboard/AccountForecast';
import { ParetoTag } from '@/components/dashboard/ParetoTag';

type ClientWithStage = Client & {
  onboardingStage?: string | null;
  onboardingStageType?: string | null;
};

type Tab = 'activities' | 'tickets' | 'tasks' | 'contacts' | 'financials';

const TABS: { id: Tab; label: string }[] = [
  { id: 'activities', label: 'Attività' },
  { id: 'tickets', label: 'Ticket' },
  { id: 'tasks', label: 'Task' },
  { id: 'contacts', label: 'Contatti' },
  { id: 'financials', label: 'Dati Finanziari' },
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
  const [hubspotTasks, setHubspotTasks] = useState<Engagement[]>([]);
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
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showQbrModal, setShowQbrModal] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    summary: string; riskLevel: string; strengths: string[];
    concerns: string[]; actions: Array<{ title: string; priority: string; description: string }>;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [accountBrief, setAccountBrief] = useState<AccountBriefPayload | null>(null);
  const [accountBriefLoading, setAccountBriefLoading] = useState(false);
  const [accountBriefError, setAccountBriefError] = useState<string | null>(null);
  const [goals, setGoals] = useState<ClientGoal[]>([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDesc, setNewGoalDesc] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [goalExtractMessage, setGoalExtractMessage] = useState<string | null>(null);
  const [salesDeals, setSalesDeals] = useState<ClientDeal[]>([]);
  const [upsellingDeals, setUpsellingDeals] = useState<ClientDeal[]>([]);
  const [dealTab, setDealTab] = useState<'sales' | 'upselling'>('sales');
  const [onboardingExpanded, setOnboardingExpanded] = useState(true);

  const loadAccountBrief = useCallback(async () => {
    if (!token || !id) return;
    setAccountBriefLoading(true);
    setAccountBriefError(null);
    try {
      const res = await clientsApi.getAccountBrief(token, id);
      if (res.data) setAccountBrief(res.data);
    } catch (e) {
      setAccountBriefError(e instanceof Error ? e.message : 'Impossibile generare l\'account brief');
    } finally {
      setAccountBriefLoading(false);
    }
  }, [token, id]);

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
    clientsApi.getDeals(token, id).then(r => {
      if (r.data) {
        setSalesDeals(r.data.sales);
        setUpsellingDeals(r.data.upselling);
      }
    }).catch(() => {});
    clientsApi.getOnboardingHistory(token, id).then(r => setOnboardingHistory(r.data ?? null)).catch(() => {});
    onboardingApi.getProgress(token, id).then(r => setOnboarding(r.data ?? null)).catch(() => {});
    clientsApi.getGoals(token, id).then(r => { setGoals(r.data ?? []); setGoalsLoaded(true); }).catch(() => {});
    clientsApi.getEngagements(token, id).then(r => setEngagements(r.data ?? [])).catch(() => {});
  }, [token, id]);

  useEffect(() => {
    if (!token || !id || !client) return;
    if (client.csOwnerId !== MARCO_MANIGRASSI_HUBSPOT_OWNER_ID) {
      setAccountBrief(null);
      setAccountBriefError(null);
      return;
    }
    loadAccountBrief();
  }, [token, id, client, loadAccountBrief]);

  useEffect(() => {
    if (!token || !id) return;
    if (tab === 'tickets' && tickets.length === 0) {
      clientsApi.getTickets(token, id).then(r => setTickets(r.data ?? []));
    }
    if (tab === 'contacts' && contacts.length === 0) {
      clientsApi.getContacts(token, id).then(r => setContacts(r.data ?? []));
    }
    if (tab === 'tasks' && hubspotTasks.length === 0 && engagements.length > 0) {
      setHubspotTasks(engagements.filter(e => e.type === 'TASK'));
    }
  }, [tab, token, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return <div className="p-6 text-slate-500">Cliente non trovato.</div>;
  }

  const renewalDays = client.renewalDate ? differenceInDays(new Date(client.renewalDate), new Date()) : null;

  function renderDealList(deals: ClientDeal[]) {
    if (deals.length === 0) {
      return <p className="text-sm text-slate-400 text-center py-4">Nessun deal in questa pipeline.</p>;
    }
    return (
      <div className="space-y-3">
        {deals.map(d => {
          const progress = d.totalStages > 1 ? Math.round(((d.stageOrder) / (d.totalStages - 1)) * 100) : 0;
          const barColor = d.isWon ? 'bg-emerald-500' : d.isClosed ? 'bg-red-400' : 'bg-blue-500';
          return (
            <a
              key={d.id}
              href={`https://app-eu1.hubspot.com/contacts/47964451/deal/${d.hubspotId}`}
              target="_blank"
              rel="noreferrer"
              className="block border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{d.dealName ?? 'Deal senza nome'}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                      d.isWon ? 'bg-emerald-100 text-emerald-700'
                      : d.isClosed ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>
                      {d.stageLabel}
                    </span>
                    {d.daysInStage != null && !d.isClosed && (
                      <span className="text-xs text-slate-400">{d.daysInStage} gg nello stage</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {d.amount != null && (
                    <p className="text-sm font-semibold text-slate-900">
                      {d.amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                    </p>
                  )}
                  {d.closeDate && (
                    <p className="text-xs text-slate-400">
                      Chiusura: {format(new Date(d.closeDate), 'd MMM yyyy', { locale: it })}
                    </p>
                  )}
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${d.isClosed ? 100 : progress}%` }} />
              </div>
              {d.ownerName && (
                <p className="text-xs text-slate-400 mt-1.5">Owner: {d.ownerName}</p>
              )}
            </a>
          );
        })}
      </div>
    );
  }

  const hasOnboarding = onboardingHistory && onboardingHistory.steps.length > 0;
  const engagementMap = new Map(engagements.map(e => [e.id, e]));

  function getGoalBinDate(g: ClientGoal): Date | null {
    if (g.sourceEngagementId) {
      const eng = engagementMap.get(g.sourceEngagementId);
      if (eng) return new Date(eng.occurredAt);
    }
    if (g.mentionedAt) return new Date(g.mentionedAt);
    return null;
  }

  const stepperGoalIds = new Set<string>();
  if (hasOnboarding) {
    onboardingHistory.steps.forEach((step, i) => {
      const stepDate = step.completedAt ? new Date(step.completedAt) : null;
      const nextCompletedStep = onboardingHistory.steps.slice(i + 1).find(s => s.completedAt);
      const nextDate = nextCompletedStep?.completedAt ? new Date(nextCompletedStep.completedAt) : null;
      if (stepDate) {
        goals.forEach(g => {
          if (stepperGoalIds.has(g.id)) return;
          const gDate = getGoalBinDate(g);
          if (!gDate) return;
          if (gDate >= stepDate && (!nextDate || gDate <= nextDate)) {
            stepperGoalIds.add(g.id);
          }
        });
      }
    });
  }
  const orphanGoals = goals.filter(g => !stepperGoalIds.has(g.id));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <ArrowLeft className="w-4 h-4" /> Torna ai clienti
      </Link>

      {/* Client header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{client.name}</h1>
            <ParetoTag accountId={client.hubspotId} />
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {client.domain && (
              <a href={`https://${client.domain}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-600">
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
            onClick={async () => {
              if (!token || aiLoading) return;
              setAiLoading(true);
              try {
                const res = await clientsApi.getAiAnalysis(token, id);
                setAiAnalysis(res.data ?? null);
              } catch { /* ignore */ }
              finally { setAiLoading(false); }
            }}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Analisi AI
          </button>
          <button
            onClick={() => setShowQbrModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors"
          >
            <Presentation className="w-4 h-4" />
            QBR
          </button>
          <button
            onClick={() => setShowEmailModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
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

      {client.csOwnerId === MARCO_MANIGRASSI_HUBSPOT_OWNER_ID && (
        <AccountBriefCard
          brief={accountBrief}
          loading={accountBriefLoading}
          error={accountBriefError}
          onRegenerate={loadAccountBrief}
        />
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">MRR</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatMrrDisplay(client.mrr)}
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

      {/* Deal Pipelines */}
      {(salesDeals.length > 0 || upsellingDeals.length > 0) && (
        <Card className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setDealTab('sales')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dealTab === 'sales' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <span className="inline-flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Sales Pipeline ({salesDeals.length})</span>
              </button>
              <button
                onClick={() => setDealTab('upselling')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dealTab === 'upselling' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <span className="inline-flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />Upselling ({upsellingDeals.length})</span>
              </button>
            </div>
          </div>
          {renderDealList(dealTab === 'sales' ? salesDeals : upsellingDeals)}
        </Card>
      )}

      {/* Onboarding card */}
      {onboardingHistory && onboardingHistory.steps.length > 0 && (() => {
        const completed = onboardingHistory.steps.filter(s => s.completedAt).length;
        const total = onboardingHistory.steps.length;
        const pct = Math.round((completed / total) * 100);
        const isComplete = onboardingHistory.currentStageId === '1005076483';
        return (
          <Card className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CardTitle>Progresso onboarding</CardTitle>
                {onboardingHistory.ticketHubspotId && (
                  <a
                    href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-5/${onboardingHistory.ticketHubspotId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-600 hover:text-emerald-800"
                  >
                    Apri ticket
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3">
                {onboardingHistory.currentStage && (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                    {onboardingHistory.currentStage}
                  </span>
                )}
                <span className={`text-sm font-semibold ${isComplete ? 'text-emerald-600' : 'text-slate-700'}`}>{pct}%</span>
                <button
                  onClick={() => setOnboardingExpanded(!onboardingExpanded)}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {onboardingExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className={`h-2 bg-slate-100 rounded-full ${onboardingExpanded ? 'mb-6' : ''} overflow-hidden`}>
              <div
                className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-green-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {onboardingExpanded && (() => {
              const renderedGoalIds = new Set<string>();
              return (
              <>
                <ul className="space-y-1">
                  {onboardingHistory.steps.map((step, i) => {
                    const done = !!step.completedAt;
                    const isCurrent = step.id === onboardingHistory.currentStageId;

                    const stepDate = step.completedAt ? new Date(step.completedAt) : null;
                    const nextCompletedStep = onboardingHistory.steps.slice(i + 1).find(s => s.completedAt);
                    const nextDate = nextCompletedStep?.completedAt ? new Date(nextCompletedStep.completedAt) : null;

                    const stepGoals = stepDate
                      ? goals
                          .filter(g => {
                            if (renderedGoalIds.has(g.id)) return false;
                            const gDate = getGoalBinDate(g);
                            if (!gDate) return false;
                            if (gDate < stepDate) return false;
                            if (nextDate && gDate > nextDate) return false;
                            return true;
                          })
                          .sort((a, b) => (getGoalBinDate(a)?.getTime() ?? 0) - (getGoalBinDate(b)?.getTime() ?? 0))
                      : [];
                    stepGoals.forEach(g => renderedGoalIds.add(g.id));

                    return (
                      <li key={step.id}>
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isCurrent ? 'bg-emerald-50' : ''}`}>
                          <div className="flex items-center justify-center w-6">
                            {done ? (
                              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : isCurrent ? (
                              <div className="w-5 h-5 rounded-full border-2 border-emerald-500 bg-emerald-500 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-white" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${done ? 'text-slate-900 font-medium' : isCurrent ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                              {step.label}
                            </p>
                          </div>
                          {step.completedAt && (
                            <p className="text-xs text-slate-400 shrink-0">
                              {format(new Date(step.completedAt), 'd MMM yyyy', { locale: it })}
                            </p>
                          )}
                        </div>
                        {stepGoals.length > 0 && (
                          <div className="ml-12 mt-1 mb-2 space-y-1">
                            {stepGoals.map(g => (
                              <div key={g.id} className="flex items-center gap-2 text-xs">
                                <button
                                  onClick={async () => {
                                    if (!token) return;
                                    const newStatus = g.status === 'achieved' ? 'active' : 'achieved';
                                    await clientsApi.updateGoal(token, id, { goalId: g.id, status: newStatus });
                                    const r = await clientsApi.getGoals(token, id);
                                    setGoals(r.data ?? []);
                                  }}
                                  className="shrink-0"
                                >
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                    g.status === 'achieved'
                                      ? 'bg-emerald-500 border-emerald-500'
                                      : 'border-slate-300 hover:border-emerald-400'
                                  }`}>
                                    {g.status === 'achieved' && (
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </button>
                                <span className={g.status === 'achieved' ? 'line-through text-slate-400' : g.status === 'abandoned' ? 'line-through text-slate-300' : 'text-slate-600'}>
                                  {g.title}
                                </span>
                                {g.mentionedAt && (
                                  <span className="text-slate-400">
                                    {format(new Date(g.mentionedAt), 'd MMM yyyy', { locale: it })}
                                  </span>
                                )}
                                {g.sourceEngagementId && engagementMap.has(g.sourceEngagementId) && (() => {
                                  const eng = engagementMap.get(g.sourceEngagementId!)!;
                                  const typeLabel = eng.noteCategory ?? ({ CALL: 'Call', EMAIL: 'Email', INCOMING_EMAIL: 'Email', FORWARDED_EMAIL: 'Email', MEETING: 'Meeting', NOTE: 'Nota', TASK: 'Task' }[eng.type] ?? eng.type);
                                  const ownerName = getOwnerName(eng.ownerId);
                                  return (
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                      {typeLabel}{ownerName !== '—' ? ` di ${ownerName}` : ''} - {format(new Date(eng.occurredAt), 'd MMM', { locale: it })}
                                    </span>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {onboardingHistory.issues && onboardingHistory.issues.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-900 mb-2">Problemi riscontrati</p>
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
                  </div>
                )}

                {/* Goal management toolbar */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-900">Gestione obiettivi</p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          if (!token || extracting) return;
                          setExtracting(true);
                          setGoalsError(null);
                          try {
                            await clientsApi.extractGoals(token, id);
                            const r = await clientsApi.getGoals(token, id);
                            setGoals(r.data ?? []);
                          } catch (err) {
                            setGoalsError(err instanceof Error ? err.message : 'Estrazione fallita.');
                          } finally { setExtracting(false); }
                        }}
                        disabled={extracting}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-50"
                      >
                        {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Estrai
                      </button>
                      <button
                        onClick={() => setShowAddGoal(!showAddGoal)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        + Aggiungi
                      </button>
                      {goals.length > 0 && (
                        <button
                          onClick={async () => {
                            if (!token || syncing) return;
                            setSyncing(true);
                            setGoalsError(null);
                            try { await clientsApi.syncGoalsToHubspot(token, id); }
                            catch (err) { setGoalsError(err instanceof Error ? err.message : 'Sincronizzazione fallita.'); }
                            finally { setSyncing(false); }
                          }}
                          disabled={syncing}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-amber-500" />}
                          Sync
                        </button>
                      )}
                    </div>
                  </div>

                  {goalsError && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 mb-3">
                      <span>{goalsError}</span>
                      <button onClick={() => setGoalsError(null)} className="shrink-0 text-red-400 hover:text-red-600">&times;</button>
                    </div>
                  )}

                  {showAddGoal && (
                    <div className="space-y-2 mb-3 p-3 bg-slate-50 rounded-lg">
                      <input
                        type="text"
                        placeholder="Titolo obiettivo"
                        value={newGoalTitle}
                        onChange={e => setNewGoalTitle(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <textarea
                        placeholder="Descrizione (opzionale)"
                        value={newGoalDesc}
                        onChange={e => setNewGoalDesc(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!token || !newGoalTitle.trim()) return;
                            await clientsApi.createGoal(token, id, { title: newGoalTitle.trim(), description: newGoalDesc.trim() || undefined });
                            const r = await clientsApi.getGoals(token, id);
                            setGoals(r.data ?? []);
                            setNewGoalTitle('');
                            setNewGoalDesc('');
                            setShowAddGoal(false);
                          }}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                          Salva
                        </button>
                        <button
                          onClick={() => { setShowAddGoal(false); setNewGoalTitle(''); setNewGoalDesc(''); }}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
              );
            })()}
          </Card>
        );
      })()}

      {/* Goals card -- orphan-only when onboarding exists, full when no onboarding */}
      {(!hasOnboarding || orphanGoals.length > 0) && (() => {
        const displayGoals = hasOnboarding ? orphanGoals : goals;
        return (
          <Card className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-600" />
                <CardTitle>{hasOnboarding ? 'Altri obiettivi' : 'Obiettivi'}</CardTitle>
                {displayGoals.length > 0 && (
                  <span className="text-xs text-slate-400">
                    {displayGoals.filter(g => g.status === 'achieved').length} completati, {displayGoals.filter(g => g.status === 'active').length} attivi su {displayGoals.length}
                  </span>
                )}
              </div>
              {!hasOnboarding && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={async () => {
                      if (!token || extracting) return;
                      setExtracting(true);
                      setGoalsError(null);
                      try {
                        await clientsApi.extractGoals(token, id);
                        const r = await clientsApi.getGoals(token, id);
                        setGoals(r.data ?? []);
                      } catch (err) {
                        setGoalsError(err instanceof Error ? err.message : 'Estrazione fallita.');
                      } finally { setExtracting(false); }
                    }}
                    disabled={extracting}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-50"
                  >
                    {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Estrai
                  </button>
                  <button
                    onClick={() => setShowAddGoal(!showAddGoal)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    + Aggiungi
                  </button>
                  {goals.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!token || syncing) return;
                        setSyncing(true);
                        setGoalsError(null);
                        try { await clientsApi.syncGoalsToHubspot(token, id); }
                        catch (err) { setGoalsError(err instanceof Error ? err.message : 'Sincronizzazione fallita.'); }
                        finally { setSyncing(false); }
                      }}
                      disabled={syncing}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-amber-500" />}
                      Sync
                    </button>
                  )}
                </div>
              )}
            </div>

            {!hasOnboarding && goalsError && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 mb-3">
                <span>{goalsError}</span>
                <button onClick={() => setGoalsError(null)} className="shrink-0 text-red-400 hover:text-red-600">&times;</button>
              </div>
            )}

            {!hasOnboarding && showAddGoal && (
              <div className="space-y-2 mb-3 p-3 bg-slate-50 rounded-lg">
                <input
                  type="text"
                  placeholder="Titolo obiettivo"
                  value={newGoalTitle}
                  onChange={e => setNewGoalTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <textarea
                  placeholder="Descrizione (opzionale)"
                  value={newGoalDesc}
                  onChange={e => setNewGoalDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!token || !newGoalTitle.trim()) return;
                      await clientsApi.createGoal(token, id, { title: newGoalTitle.trim(), description: newGoalDesc.trim() || undefined });
                      const r = await clientsApi.getGoals(token, id);
                      setGoals(r.data ?? []);
                      setNewGoalTitle('');
                      setNewGoalDesc('');
                      setShowAddGoal(false);
                    }}
                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    Salva
                  </button>
                  <button
                    onClick={() => { setShowAddGoal(false); setNewGoalTitle(''); setNewGoalDesc(''); }}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {displayGoals.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-4">
                Nessun obiettivo. Usa &quot;Estrai&quot; per analizzare gli engagement con l&apos;AI.
              </p>
            ) : (
              <ul className="space-y-1">
                {displayGoals.map(g => (
                  <li key={g.id} className="flex items-center gap-2 py-1">
                    <button
                      onClick={async () => {
                        if (!token) return;
                        const newStatus = g.status === 'achieved' ? 'active' : 'achieved';
                        await clientsApi.updateGoal(token, id, { goalId: g.id, status: newStatus });
                        const r = await clientsApi.getGoals(token, id);
                        setGoals(r.data ?? []);
                      }}
                      className="shrink-0"
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        g.status === 'achieved'
                          ? 'bg-emerald-500 border-emerald-500'
                          : g.status === 'abandoned'
                            ? 'border-slate-200 bg-slate-50'
                            : 'border-slate-300 hover:border-emerald-400'
                      }`}>
                        {g.status === 'achieved' && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                    <span className={`text-sm flex-1 min-w-0 truncate ${
                      g.status === 'achieved' ? 'line-through text-slate-400'
                      : g.status === 'abandoned' ? 'line-through text-slate-300'
                      : 'text-slate-700'
                    }`}>
                      {g.title}
                    </span>
                    {g.sourceEngagementId && engagementMap.has(g.sourceEngagementId) && (() => {
                      const eng = engagementMap.get(g.sourceEngagementId!)!;
                      const typeLabel = eng.noteCategory ?? ({ CALL: 'Call', EMAIL: 'Email', INCOMING_EMAIL: 'Email', FORWARDED_EMAIL: 'Email', MEETING: 'Meeting', NOTE: 'Nota', TASK: 'Task' }[eng.type] ?? eng.type);
                      const ownerName = getOwnerName(eng.ownerId);
                      return (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          {typeLabel}{ownerName !== '—' ? ` di ${ownerName}` : ''} - {format(new Date(eng.occurredAt), 'd MMM', { locale: it })}
                        </span>
                      );
                    })()}
                    {g.mentionedAt && (
                      <span className="text-xs text-slate-400 shrink-0">
                        {format(new Date(g.mentionedAt), 'd MMM yyyy', { locale: it })}
                      </span>
                    )}
                    <Badge variant="default" size="sm">
                      {g.source === 'playbook' ? 'Playbook' : g.source === 'ai_extracted' ? 'AI' : 'Manuale'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })()}

      {/* AI Analysis */}
      {aiAnalysis && (
        <Card className="mb-6 border-purple-200 bg-purple-50/30">
          <div className="flex items-start gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-900">Analisi AI</h3>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  aiAnalysis.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                  aiAnalysis.riskLevel === 'high' ? 'bg-orange-100 text-orange-700' :
                  aiAnalysis.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  Rischio: {aiAnalysis.riskLevel}
                </span>
              </div>
              <p className="text-sm text-slate-600 mb-4">{aiAnalysis.summary}</p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                {aiAnalysis.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Punti di forza</p>
                    <ul className="space-y-1">
                      {aiAnalysis.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                          <span className="text-emerald-500 shrink-0">+</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiAnalysis.concerns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-1">Criticita</p>
                    <ul className="space-y-1">
                      {aiAnalysis.concerns.map((c, i) => (
                        <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                          <span className="text-red-500 shrink-0">!</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {aiAnalysis.actions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">Azioni consigliate</p>
                  <ul className="space-y-2">
                    {aiAnalysis.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Badge
                          variant={a.priority === 'alta' ? 'danger' : a.priority === 'media' ? 'warning' : 'default'}
                          size="sm"
                        >
                          {a.priority}
                        </Badge>
                        <div>
                          <p className="text-xs font-medium text-slate-800">{a.title}</p>
                          <p className="text-xs text-slate-500">{a.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-emerald-600 text-emerald-600'
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

      {tab === 'tasks' && (
        <Card padding="none">
          {hubspotTasks.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Nessun task per questo cliente.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hubspotTasks.map(t => {
                const task = t as typeof t & { taskSubject?: string; taskStatus?: string; taskPriority?: string; taskType?: string };
                const isCompleted = task.taskStatus === 'COMPLETED';
                return (
                  <li key={t.id}>
                    <a
                      href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${client.hubspotId}/view/1?engagement=${t.hubspotId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <CheckSquare className={`w-4 h-4 shrink-0 ${isCompleted ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {task.taskSubject || t.title || 'Task'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.taskType && <span className="text-xs text-slate-400">{task.taskType}</span>}
                          {task.taskStatus && <Badge variant={isCompleted ? 'success' : 'info'} size="sm">{task.taskStatus}</Badge>}
                          {task.taskPriority && task.taskPriority !== 'NONE' && (
                            <Badge variant={task.taskPriority === 'HIGH' ? 'danger' : task.taskPriority === 'MEDIUM' ? 'warning' : 'default'} size="sm">{task.taskPriority}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">
                          {formatDistanceToNow(new Date(t.occurredAt), { addSuffix: true, locale: it })}
                        </p>
                        {t.ownerId && <p className="text-xs text-slate-400">{getOwnerName(t.ownerId)}</p>}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'financials' && (
        <div className="space-y-4">
          <MrrTrendChart accountId={client.hubspotId} />
          <div className="grid md:grid-cols-2 gap-4">
            <AccountForecast accountId={client.hubspotId} />
            <PaymentStatusCard accountId={client.hubspotId} />
          </div>
          <SubscriptionTimeline accountId={client.hubspotId} />
        </div>
      )}


      <WorkflowEnrollModal
        open={showWorkflowModal}
        onClose={() => setShowWorkflowModal(false)}
        companyName={client.name}
        clientId={id}
      />
      <EmailGeneratorModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        clientId={id}
        clientName={client.name}
      />
      <QbrModal
        open={showQbrModal}
        onClose={() => setShowQbrModal(false)}
        clientId={id}
        clientName={client.name}
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
                      active ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {role === 'all' ? 'Tutti' : role}
                    <span className={`ml-1.5 text-xs ${active ? 'text-emerald-500' : 'text-slate-400'}`}>({count})</span>
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
                            <span key={role} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-100">
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
