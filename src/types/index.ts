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

export type HealthStatus = 'green' | 'yellow' | 'red';

export interface ClientPlanUsage {
  used: number;
  included: number;
}

export interface ClientWithHealth extends Client {
  onboardingStage?: string | null;
  onboardingStageType?: 'normal' | 'warning' | 'danger' | string | null;
  onboardingTicket: {
    hubspotId: string;
    pipeline: string | null;
    status: string | null;
    subject: string | null;
    activatedAt: string | null;
  } | null;
  supportTicketsCount: number;
  latestSupportTicket: {
    hubspotId: string;
    status: string | null;
    subject: string | null;
  } | null;
  purchaseSource: string | null;
  lastContactDate: string | null;
  lastEngagement: {
    hubspotId: string | null;
    type: string | null;
    occurredAt: string;
    ownerId: string | null;
    emailFrom: string | null;
    emailTo: string | null;
    callDirection: string | null;
    callDisposition: string | null;
    callTitle: string | null;
  } | null;
  /** Primary HubSpot contact for list views: most recently active, then name order. */
  contactPerson: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    hubspotId: string;
  } | null;
  planUsage?: ClientPlanUsage | null;
  /** Raw value from optional HubSpot company property (`accountQualityScore`); used for quality dot when set. */
  accountQualityScore?: string | null;
  salesDeal: DealSummary | null;
  upsellingDeal: DealSummary | null;
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
  noteCategory: string | null;
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

// ─── Client Goal ─────────────────────────────────────────────────────────────
export type GoalStatus = 'active' | 'achieved' | 'abandoned';
export type GoalSource = 'manual' | 'ai_extracted' | 'playbook';

export interface ClientGoal {
  id: string;
  clientId: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  source: GoalSource;
  sourceEngagementId: string | null;
  mentionedAt: string | null;
  dueDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Deal ─────────────────────────────────────────────────────────────────────
export interface DealSummary {
  pipelineId: string;
  pipelineLabel: string;
  stageLabel: string;
  stageOrder: number;
  totalStages: number;
  isClosed: boolean;
  isWon: boolean;
  dealName: string | null;
  amount: number | null;
  closeDate: string | null;
  daysInStage: number | null;
}

export interface ClientDeal {
  id: string;
  hubspotId: string;
  clientId: string;
  pipelineId: string;
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  totalStages: number;
  isClosed: boolean;
  isWon: boolean;
  dealName: string | null;
  amount: number | null;
  closeDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  daysInStage: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────
export interface Workflow {
  id: string;
  name: string;
  isEnabled: boolean;
  objectTypeId: string;
  type: string;
  updatedAt: string;
}

export type WorkflowObjectType = 'contacts' | 'companies' | 'tickets';

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

export interface AccountBriefSections {
  sintesiCliente: string;
  featureSummary: string;
  ticketSummary: string;
  campagneSummary: string;
  utilizzoPiattaforma: string;
  rischioChurn: string;
  prossimaBestAction: string;
}

export interface AccountBriefPayload {
  generatedAt: string;
  sections: AccountBriefSections;
  model: string | null;
  fallback: boolean;
  context?: Record<string, unknown>;
}

// ─── NAR module re-exports ────────────────────────────────────────────────────
export type {
  NarUpload,
  NarRow,
  NarBucketKey,
  NarBucketStats,
  NarBucketResult,
  NarFilterType,
  NarFilters,
  NarSnapshot,
  NarSnapshotBucket,
  NarSnapshotStats,
  NarExclusionReason,
  NarExcludedAccount,
  NarOperatorSource,
  NarOperatorEntry,
  NarFindingSeverity,
  NarSignalType,
  NarFinding,
  NarSignal,
  NarPathAccount,
  NarPathKey,
  NarPlanRiskRow,
  NarAction,
  NarInsights,
  NarN8nForwardRequest,
  NarN8nForwardResult,
} from './nar';
