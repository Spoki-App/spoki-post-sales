/**
 * Typed API client for frontend → Next.js API routes communication.
 */

import type { Client, ClientWithHealth, Ticket, Engagement, Contact, HealthScore, Task, OnboardingProgress, OnboardingTemplate, Alert, AlertRule, PaginatedResponse, ApiResponse } from '@/types';

async function fetchApi<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const { token, ...rest } = options ?? {};

  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Clients ─────────────────────────────────────────────────────────────────
export const clientsApi = {
  list: (token: string, params?: { page?: number; q?: string; status?: string; owner?: string; viewAll?: boolean; section?: string }) => {
    const qs = new URLSearchParams(params as unknown as Record<string, string>).toString();
    return fetchApi<PaginatedResponse<ClientWithHealth>>(`/clients${qs ? `?${qs}` : ''}`, { token });
  },
  get: (token: string, id: string) =>
    fetchApi<ApiResponse<Client>>(`/clients/${id}`, { token }),
  getHealth: (token: string, id: string) =>
    fetchApi<ApiResponse<HealthScore>>(`/clients/${id}/health`, { token }),
  getTickets: (token: string, id: string) =>
    fetchApi<ApiResponse<Ticket[]>>(`/clients/${id}/tickets`, { token }),
  getEngagements: (token: string, id: string) =>
    fetchApi<ApiResponse<Engagement[]>>(`/clients/${id}/engagements`, { token }),
  getContacts: (token: string, id: string) =>
    fetchApi<ApiResponse<Contact[]>>(`/clients/${id}/contacts`, { token }),
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

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsApi = {
  summary: (token: string) =>
    fetchApi<ApiResponse<Record<string, unknown>>>('/reports/summary', { token }),
  healthTrend: (token: string, days = 30) =>
    fetchApi<ApiResponse<Record<string, unknown>>>(`/reports/health-trend?days=${days}`, { token }),
};
