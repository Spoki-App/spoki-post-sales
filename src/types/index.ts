// ─── Client ───────────────────────────────────────────────────────────────────
export interface Client {
  id: string;
  hubspotId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  lifecycleStage: string | null;
  plan: string | null;
  mrr: number | null;
  contractValue: number | null;
  contractStartDate: string | null;
  renewalDate: string | null;
  onboardingStatus: string | null;
  csOwnerId: string | null;
  churnRisk: string | null;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientWithHealth extends Client {
  healthScore: HealthScore | null;
  openTicketsCount: number;
  lastContactDate: string | null;
}

// ─── Contact ──────────────────────────────────────────────────────────────────
export interface Contact {
  id: string;
  hubspotId: string;
  clientId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  jobTitle: string | null;
  lifecycleStage: string | null;
  ownerId: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

// ─── Ticket ───────────────────────────────────────────────────────────────────
export interface Ticket {
  id: string;
  hubspotId: string;
  clientId: string | null;
  subject: string | null;
  content: string | null;
  status: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  pipeline: string | null;
  ownerId: string | null;
  openedAt: string | null;
  closedAt: string | null;
  lastModifiedAt: string | null;
}

// ─── Engagement ───────────────────────────────────────────────────────────────
export interface Engagement {
  id: string;
  hubspotId: string;
  clientId: string | null;
  contactId: string | null;
  type: string;
  occurredAt: string;
  ownerId: string | null;
  title: string | null;
}

// ─── Health Score ─────────────────────────────────────────────────────────────
export type HealthStatus = 'green' | 'yellow' | 'red';

export interface HealthScore {
  id: string;
  clientId: string;
  score: number;
  status: HealthStatus;
  scoreLastContact: number;
  scoreTickets: number;
  scoreOnboarding: number;
  scoreRenewal: number;
  daysSinceLastContact: number | null;
  openTicketsCount: number;
  openHighTicketsCount: number;
  onboardingPct: number;
  daysToRenewal: number | null;
  calculatedAt: string;
}

// ─── Task ─────────────────────────────────────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  clientId: string | null;
  clientName?: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignedTo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
export interface OnboardingStep {
  id: string;
  label: string;
  description?: string;
  completedAt?: string | null;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  description: string | null;
  planFilter: string | null;
  steps: Omit<OnboardingStep, 'completedAt'>[];
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProgress {
  id: string;
  clientId: string;
  templateId: string | null;
  steps: OnboardingStep[];
  pctComplete: number;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

// ─── Alert ────────────────────────────────────────────────────────────────────
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  type: string;
  threshold: number | null;
  severity: AlertSeverity;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  clientId: string;
  clientName?: string | null;
  ruleId: string | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  metadata: Record<string, unknown> | null;
  readBy: string[];
  resolved: boolean;
  resolvedAt: string | null;
  triggeredAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
