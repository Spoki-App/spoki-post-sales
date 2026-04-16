/**
 * Typed API client for frontend → Next.js API routes communication.
 */

import type { Client, ClientWithHealth, ClientGoal, Ticket, Engagement, Contact, Task, OnboardingProgress, OnboardingTemplate, Alert, AlertRule, Workflow, PaginatedResponse, ApiResponse, AccountBriefPayload } from '@/types';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useAuthStore } from '@/lib/store/auth';

async function fetchApi<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const { token, ...rest } = options ?? {};

  const request = (authToken: string | undefined) =>
    fetch(`/api/v1${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...rest.headers,
      },
    });

  let res = await request(token);

  if (res.status === 401 && token) {
    const user = getFirebaseAuth().currentUser;
    if (user) {
      const fresh = await user.getIdToken(true);
      useAuthStore.getState().setToken(fresh);
      res = await request(fresh);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Clients ─────────────────────────────────────────────────────────────────
export const clientsApi = {
  list: (
    token: string,
    params?: { page?: number; q?: string; owner?: string; onboardingOwner?: string; viewAll?: boolean; section?: string; sort?: string; dir?: string },
    signal?: AbortSignal
  ) => {
    const qs = new URLSearchParams(params as unknown as Record<string, string>).toString();
    return fetchApi<PaginatedResponse<ClientWithHealth>>(`/clients${qs ? `?${qs}` : ''}`, { token, signal });
  },
  get: (token: string, id: string) =>
    fetchApi<ApiResponse<Client>>(`/clients/${id}`, { token }),
  getTickets: (token: string, id: string) =>
    fetchApi<ApiResponse<Ticket[]>>(`/clients/${id}/tickets`, { token }),
  getEngagements: (token: string, id: string) =>
    fetchApi<ApiResponse<Engagement[]>>(`/clients/${id}/engagements`, { token }),
  getContacts: (token: string, id: string, role?: string) =>
    fetchApi<ApiResponse<Contact[]>>(`/clients/${id}/contacts${role ? `?role=${encodeURIComponent(role)}` : ''}`, { token }),
  getAiAnalysis: (token: string, id: string) =>
    fetchApi<ApiResponse<{
      summary: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      strengths: string[];
      concerns: string[];
      actions: Array<{ title: string; priority: string; description: string }>;
    }>>(`/clients/${id}/ai-analysis`, { method: 'POST', token }),
  getOnboardingHistory: (token: string, id: string) =>
    fetchApi<ApiResponse<{
      steps: Array<{ id: string; label: string; completedAt: string | null }>;
      currentStage: string | null;
      currentStageId: string | null;
      ticketHubspotId: string | null;
      issues: Array<{ label: string; occurredAt: string }>;
    }>>(`/clients/${id}/onboarding-history`, { token }),
  getAccountBrief: (token: string, id: string) =>
    fetchApi<ApiResponse<AccountBriefPayload>>(`/clients/${id}/account-brief`, { method: 'POST', token }),
  getGoals: (token: string, id: string) =>
    fetchApi<ApiResponse<ClientGoal[]>>(`/clients/${id}/goals`, { token }),
  createGoal: (token: string, id: string, data: { title: string; description?: string; dueDate?: string }) =>
    fetchApi<ApiResponse<{ id: string }>>(`/clients/${id}/goals`, { method: 'POST', token, body: JSON.stringify(data) }),
  updateGoal: (token: string, id: string, data: { goalId: string; title?: string; description?: string; status?: string; dueDate?: string }) =>
    fetchApi<ApiResponse<{ updated: boolean }>>(`/clients/${id}/goals`, { method: 'PATCH', token, body: JSON.stringify(data) }),
  extractGoals: (token: string, id: string) =>
    fetchApi<ApiResponse<{ extracted: number }>>(`/clients/${id}/goals/extract`, { method: 'POST', token }),
  syncGoalsToHubspot: (token: string, id: string) =>
    fetchApi<ApiResponse<{ noteId: string; goalsCount: number }>>(`/clients/${id}/goals/sync-hubspot`, { method: 'POST', token }),
};

// ─── Customer Success ──────────────────────────────────────────────────────────
export const customerSuccessApi = {
  dashboards: (token: string) =>
    fetchApi<
      ApiResponse<{
        owner: { id: string; name: string };
        portfolio: { clientCount: number; totalMrr: number };
        renewals: Record<string, { count: number; totalMrr: number }>;
        pipeline: {
          inPipeline: number;
          completed: number;
          totalInCsFlow: number;
          eligibleToAddCount: number;
          byStage: Array<{ stage: string; label: string; count: number }>;
        };
        hubspotDashboard: {
          title: string;
          embedUrl: string;
          openUrl: string;
        } | null;
      }>
    >('/customer-success/dashboards', { token }),
  clients: (token: string, params?: { page?: number; q?: string }) => {
    const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return fetchApi<
      PaginatedResponse<{
        id: string;
        hubspotId: string;
        name: string;
        domain: string | null;
        plan: string | null;
        mrr: number | null;
        renewalDate: string | null;
      }>
    >(`/customer-success/clients${qs ? `?${qs}` : ''}`, { token });
  },
  pipeline: (token: string) =>
    fetchApi<
      ApiResponse<{
        cards: Array<{
          clientId: string;
          stage: string;
          name: string;
          hubspotId: string;
          mrr: number | null;
          activatedAt: string | null;
          hasPipelineRow?: boolean;
        }>;
      }>
    >('/customer-success/pipeline', { token }),
  addToPipeline: (token: string, clientId: string) =>
    fetchApi<ApiResponse<{ ok: boolean }>>('/customer-success/pipeline', {
      method: 'POST',
      body: JSON.stringify({ clientId }),
      token,
    }),
  movePipelineStage: (token: string, clientId: string, stage: string) =>
    fetchApi<ApiResponse<{ ok: boolean }>>(`/customer-success/pipeline/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
      token,
    }),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (token: string, params?: { page?: number; status?: string; assignedTo?: string; clientId?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<PaginatedResponse<Task>>(`/tasks${qs ? `?${qs}` : ''}`, { token });
  },
  create: (token: string, body: Partial<Task>) =>
    fetchApi<ApiResponse<Task>>('/tasks', { method: 'POST', body: JSON.stringify(body), token }),
  update: (token: string, id: string, body: Partial<Task>) =>
    fetchApi<ApiResponse<Task>>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
  delete: (token: string, id: string) =>
    fetchApi<ApiResponse<void>>(`/tasks/${id}`, { method: 'DELETE', token }),
};

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const alertsApi = {
  list: (token: string, params?: { resolved?: boolean; page?: number }) => {
    const qs = new URLSearchParams(params as unknown as Record<string, string>).toString();
    return fetchApi<PaginatedResponse<Alert>>(`/alerts${qs ? `?${qs}` : ''}`, { token });
  },
  resolve: (token: string, id: string) =>
    fetchApi<ApiResponse<Alert>>(`/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved: true }), token }),
  listRules: (token: string) =>
    fetchApi<ApiResponse<AlertRule[]>>('/alerts/rules', { token }),
  createRule: (token: string, body: Partial<AlertRule>) =>
    fetchApi<ApiResponse<AlertRule>>('/alerts/rules', { method: 'POST', body: JSON.stringify(body), token }),
  updateRule: (token: string, id: string, body: Partial<AlertRule>) =>
    fetchApi<ApiResponse<AlertRule>>(`/alerts/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
};

// ─── Onboarding ───────────────────────────────────────────────────────────────
export const onboardingApi = {
  getProgress: (token: string, clientId: string) =>
    fetchApi<ApiResponse<OnboardingProgress>>(`/onboarding/${clientId}`, { token }),
  updateProgress: (token: string, clientId: string, steps: OnboardingProgress['steps']) =>
    fetchApi<ApiResponse<OnboardingProgress>>(`/onboarding/${clientId}`, {
      method: 'PATCH', body: JSON.stringify({ steps }), token,
    }),
  listTemplates: (token: string) =>
    fetchApi<ApiResponse<OnboardingTemplate[]>>('/onboarding/templates', { token }),
  assignTemplate: (token: string, clientId: string, templateId: string) =>
    fetchApi<ApiResponse<OnboardingProgress>>(`/onboarding/${clientId}`, {
      method: 'POST', body: JSON.stringify({ templateId }), token,
    }),
};

// ─── Onboarding Hub ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onboardingHubApi = {
  clients: (token: string, params: { q?: string; page?: number }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<PaginatedResponse<any>>(`/onboarding-hub/clients${qs ? `?${qs}` : ''}`, { token });
  },
  dashboard: (token: string) =>
    fetchApi<ApiResponse<any>>('/onboarding-hub/dashboard', { token }),
  pipeline: (token: string) =>
    fetchApi<ApiResponse<any>>('/onboarding-hub/pipeline', { token }),
};

// ─── Workflows ────────────────────────────────────────────────────────────────
export const workflowsApi = {
  list: (token: string) =>
    fetchApi<ApiResponse<Workflow[]>>('/hubspot/workflows', { token }),
  enroll: (token: string, workflowId: string, objectId: string, objectType: 'contacts' | 'companies' | 'tickets', contactEmail?: string) =>
    fetchApi<ApiResponse<{ enrolled: boolean }>>('/hubspot/workflows/enroll', {
      method: 'POST',
      body: JSON.stringify({ workflowId, objectId, objectType, ...(contactEmail ? { contactEmail } : {}) }),
      token,
    }),
};

// ─── AI ──────────────────────────────────────────────────────────────────────
export const aiApi = {
  chat: (token: string, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) =>
    fetchApi<ApiResponse<{ message: string }>>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
      token,
    }),
  portfolioInsights: (token: string) =>
    fetchApi<ApiResponse<{
      overview: string;
      riskDistribution: { low: number; medium: number; high: number; critical: number };
      topRisks: Array<{ client: string; reason: string }>;
      topOpportunities: Array<{ client: string; reason: string }>;
      recommendations: string[];
    }>>('/ai/portfolio-insights', { method: 'POST', token }),
  generateQbr: (token: string, clientId: string, language?: string) =>
    fetchApi<ApiResponse<Array<{ title: string; content: string; type: string }>>>('/ai/generate-qbr', {
      method: 'POST',
      body: JSON.stringify({ clientId, language }),
      token,
    }),
  generateEmail: (token: string, clientId: string, type: string, customInstructions?: string) =>
    fetchApi<ApiResponse<{ subject: string; body: string }>>('/ai/generate-email', {
      method: 'POST',
      body: JSON.stringify({ clientId, type, customInstructions }),
      token,
    }),
};

// ─── QBR ──────────────────────────────────────────────────────────────────────
export const qbrApi = {
  send: (token: string, clientName: string, recipientEmails: string[], pdfBase64: string) =>
    fetchApi<ApiResponse<{ sent: number }>>('/qbr/send', {
      method: 'POST',
      body: JSON.stringify({ clientName, recipientEmails, pdfBase64 }),
      token,
    }),
};

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsApi = {
  summary: (token: string) =>
    fetchApi<ApiResponse<Record<string, unknown>>>('/reports/summary', { token }),
};

export type TeamReportCallRow = {
  hubspotId: string;
  title: string;
  date: string;
  outcome: string | null;
  owner: { id: string | null; name: string };
  client: { id: string | null; hubspotId: string | null; name: string; domain: string | null } | null;
};

export type ActivationCheckpointAnalysis = Record<string, boolean>;
export type TrainingCheckpointAnalysis = Record<string, boolean>;

export const teamReportsApi = {
  listCalls: (token: string, params: { type: string; days: number; owner?: string; outcome?: string }) => {
    const qs = new URLSearchParams();
    qs.set('type', params.type);
    qs.set('days', String(params.days));
    if (params.owner) qs.set('owner', params.owner);
    if (params.outcome) qs.set('outcome', params.outcome);
    const q = qs.toString();
    return fetchApi<ApiResponse<TeamReportCallRow[]> & { total?: number }>(
      `/team-reports/calls${q ? `?${q}` : ''}`,
      { token },
    );
  },

  analyzeCall: (token: string, hubspotId: string) =>
    fetchApi<ApiResponse<{ analysis: ActivationCheckpointAnalysis; fathomUrl?: string }>>(
      `/team-reports/calls/${encodeURIComponent(hubspotId)}/analyze`,
      { method: 'POST', token },
    ),

  analyzeBatch: async (token: string, hubspotIds: string[], signal?: AbortSignal) => {
    const post = (authToken: string | undefined) =>
      fetch('/api/v1/team-reports/calls/analyze-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ hubspotIds }),
        signal,
      });

    let res = await post(token);
    if (res.status === 401 && token) {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        const fresh = await user.getIdToken(true);
        useAuthStore.getState().setToken(fresh);
        res = await post(fresh);
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `API error ${res.status}`);
    }
    return res;
  },
};

export const trainingReportsApi = {
  listCalls: (token: string, params: { days: number; owner?: string; outcome?: string }) => {
    const qs = new URLSearchParams();
    qs.set('days', String(params.days));
    if (params.owner) qs.set('owner', params.owner);
    if (params.outcome) qs.set('outcome', params.outcome);
    const q = qs.toString();
    return fetchApi<ApiResponse<TeamReportCallRow[]> & { total?: number }>(
      `/training-reports/calls${q ? `?${q}` : ''}`,
      { token },
    );
  },

  analyzeCall: (token: string, hubspotId: string) =>
    fetchApi<ApiResponse<{ analysis: TrainingCheckpointAnalysis; fathomUrl?: string }>>(
      `/training-reports/calls/${encodeURIComponent(hubspotId)}/analyze`,
      { method: 'POST', token },
    ),

  analyzeBatch: async (token: string, hubspotIds: string[], signal?: AbortSignal) => {
    const post = (authToken: string | undefined) =>
      fetch('/api/v1/training-reports/calls/analyze-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ hubspotIds }),
        signal,
      });

    let res = await post(token);
    if (res.status === 401 && token) {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        const fresh = await user.getIdToken(true);
        useAuthStore.getState().setToken(fresh);
        res = await post(fresh);
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `API error ${res.status}`);
    }
    return res;
  },
};

// ─── Dashboard Data (Metabase integration) ────────────────────────────────────
import type {
  NrrGrrMonth, AccountPayments, SubscriptionHistoryEntry,
  ChurnRecord, ParetoAnalysis, DailyKpis,
} from '@/types/dashboard';

export const dashboardDataApi = {
  mrrHistory: (token: string, accountId?: string) => {
    const qs = accountId ? `?account_id=${accountId}` : '';
    return fetchApi<ApiResponse<NrrGrrMonth[]> & { accountMrr?: Array<{ month: string; mrr: number; prevMrr: number; category: string }> }>(
      `/dashboard-data/mrr-history${qs}`, { token }
    );
  },
  nrrGrr: (token: string) =>
    fetchApi<ApiResponse<NrrGrrMonth[]>>('/dashboard-data/nrr-grr', { token }),
  paymentStatus: (token: string, accountId: string) =>
    fetchApi<ApiResponse<AccountPayments>>(`/dashboard-data/payment-status?account_id=${accountId}`, { token }),
  subscriptionHistory: (token: string, accountId: string) =>
    fetchApi<ApiResponse<{ accountId: number; subscriptions: SubscriptionHistoryEntry[] }>>(
      `/dashboard-data/subscription-history?account_id=${accountId}`, { token }
    ),
  churnDetails: (token: string) =>
    fetchApi<ApiResponse<ChurnRecord[]> & { summary?: { total: number; totalMrrAtRisk: number } }>(
      '/dashboard-data/churn-details', { token }
    ),
  pareto: (token: string, month?: string) => {
    const qs = month ? `?month=${month}` : '';
    return fetchApi<ApiResponse<ParetoAnalysis>>(`/dashboard-data/pareto${qs}`, { token });
  },
  dailyKpis: (token: string) =>
    fetchApi<ApiResponse<DailyKpis>>('/dashboard-data/daily-kpis', { token }),
  forecast: (token: string, accountId: string) =>
    fetchApi<ApiResponse<{
      currentMrr: number; forecastMrr: number; trend3m: number;
      churnRisk: 'low' | 'medium' | 'high';
      predictedOutcome: 'renew' | 'churn' | 'expansion' | 'contraction';
      confidence: number;
    }>>(`/dashboard-data/forecast?account_id=${accountId}`, { token }),
};

// ─── Churn Tracker ────────────────────────────────────────────────────────────
import type { ChurnTrackerRecord, ChurnNote, ChurnSummary } from '@/types/churn';

export const churnTrackerApi = {
  listRecords: (token: string, params?: { filter?: string; status?: string; reason?: string; assigned?: string; q?: string }) => {
    const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return fetchApi<ApiResponse<ChurnTrackerRecord[]> & { total?: number }>(
      `/churn-tracker/records${qs ? `?${qs}` : ''}`, { token }
    );
  },
  updateRecord: (token: string, id: string, body: Partial<{ status: string; churnReason: string | null; contactOutcome: string | null; assignedTo: { name: string; email?: string } | null }>) =>
    fetchApi<ApiResponse<unknown>>(`/churn-tracker/records/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
  batchAction: (token: string, body: { ids: string[]; action: 'status' | 'assign'; status?: string; assignedTo?: { name: string; email?: string } | null }) =>
    fetchApi<ApiResponse<{ updated: number }>>('/churn-tracker/records/batch', { method: 'POST', body: JSON.stringify(body), token }),
  getNotes: (token: string, recordId: string) =>
    fetchApi<ApiResponse<ChurnNote[]>>(`/churn-tracker/records/${recordId}/notes`, { token }),
  addNote: (token: string, recordId: string, text: string) =>
    fetchApi<ApiResponse<ChurnNote>>(`/churn-tracker/records/${recordId}/notes`, { method: 'POST', body: JSON.stringify({ text }), token }),
  sync: (token: string) =>
    fetchApi<ApiResponse<{ added: number; updated: number; renewed: number; total: number }>>('/churn-tracker/sync', { method: 'POST', token }),
  summary: (token: string) =>
    fetchApi<ApiResponse<ChurnSummary>>('/churn-tracker/summary', { token }),
};
