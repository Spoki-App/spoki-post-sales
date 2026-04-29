/**
 * Tipi del modulo NAR Dashboard.
 * NAR = Net Active Ratio (rapporto consumo / tier conversazioni) per analisi
 * customer-success di portafoglio aggregato per bucket cliente.
 */

// ─── Dataset ────────────────────────────────────────────────────────────────
/**
 * Sorgenti del dataset NAR:
 *  - 'csv'      — upload manuale di un export Google Sheets (fallback storico).
 *  - 'metabase' — refresh automatico da Metabase (`usage_analytics_mart.conversation_usage_daily`)
 *                 enriched con `clients` (HubSpot sync). Sorgente di default in produzione.
 *  - 'api'      — riservata a integrazioni esterne future (es. push diretto da n8n).
 */
export type NarUploadSource = 'csv' | 'metabase' | 'api';

export interface NarUpload {
  id: string;
  uploadedByEmail: string | null;
  uploadedAt: string;
  source: NarUploadSource;
  rowCount: number;
  fileName: string | null;
  notes: string | null;
  isCurrent: boolean;
}

/**
 * Riga normalizzata del CSV NAR. Riflette le colonne usate dal vecchio dashboard:
 * `account_id`, `plan_slug`, `partner_*`, `country_code`, `week_*`, `month_*`,
 * `conversation_tier`, `company_owner`. Il CSV originale può contenere altre colonne
 * (vedi `raw`).
 */
export interface NarRow {
  accountId: number;
  accountName: string;
  planSlug: string;
  partnerId: string;
  partnerType: string;
  countryCode: string;
  weekCount: number;
  monthCount: number;
  conversationTier: number;
  weekConversationCount: number;
  monthConversationCount: number;
  companyOwner: string;
  raw?: Record<string, unknown> | null;
}

// ─── Buckets ────────────────────────────────────────────────────────────────
export type NarBucketKey = 'direct_all' | 'direct_no_es' | 'direct_es_only' | 'partner_all';

export interface NarBucketStats {
  accounts: number;
  rows: number;
  sumConv: number;
  sumTier: number;
  /** Stringa con 2 decimali (es. "12.34"). Mantenuto stringa per compat con vecchio dashboard. */
  ratio: string;
}

export interface NarBucketResult {
  key: NarBucketKey;
  name: string;
  desc: string;
  pivot: NarBucketStats;
  dedup: NarBucketStats;
}

// ─── Filters ────────────────────────────────────────────────────────────────
export type NarFilterType = 'none' | 'month' | 'week';

export interface NarFilters {
  type: NarFilterType;
  months: number[];
  weeks: number[];
  excludeWeekZero: boolean;
  excludeWithdrawn: boolean;
}

// ─── Snapshots (history) ────────────────────────────────────────────────────
export interface NarSnapshotBucket {
  key: NarBucketKey;
  name: string;
  accounts: number;
  rows: number;
  sumConv: number;
  sumTier: number;
  ratio: number;
}

export interface NarSnapshotStats {
  totalRows: number;
  totalAccounts: number;
  directAccounts: number;
  partnerAccounts: number;
  esAccounts: number;
  noEsAccounts: number;
}

export interface NarSnapshot {
  id: string;
  label: string;
  createdByEmail: string | null;
  createdAt: string;
  filterType: NarFilterType;
  monthFilter: number[];
  weekFilter: number[];
  excludeWeekZero: boolean;
  uploadId: string | null;
  stats: NarSnapshotStats;
  buckets: NarSnapshotBucket[];
}

// ─── Exclusions ─────────────────────────────────────────────────────────────
export type NarExclusionReason = 'withdrawn' | 'direct_exclusion';

export interface NarExcludedAccount {
  accountId: number;
  reason: NarExclusionReason;
  accountName: string | null;
  excludedByEmail: string | null;
  excludedAt: string;
  notes: string | null;
}

// ─── Operators ──────────────────────────────────────────────────────────────
export type NarOperatorSource = 'csv' | 'manual' | 'hubspot';

export interface NarOperatorEntry {
  accountId: number;
  operator: string;
  source: NarOperatorSource;
  accountName: string | null;
  partnerType: string | null;
  plan: string | null;
  status: string | null;
  updatedAt: string;
}

// ─── Insights (ex AI Suggest) ───────────────────────────────────────────────
export type NarFindingSeverity = 'critical' | 'warning' | 'positive';
export type NarSignalType = 'critical' | 'warning' | 'positive' | 'info';

export interface NarFinding {
  severity: NarFindingSeverity;
  title: string;
  detail: string;
  impact: string;
}

export interface NarSignal {
  type: NarSignalType;
  text: string;
  expandable?: boolean;
  accounts?: NarPathAccount[];
}

export interface NarPathAccount {
  accountId: number;
  accountName: string;
  operator: string;
  plan: string;
  tier: number;
  totalConsumption: number;
  weeksActive: number;
  totalWeeks: number;
  maxWeek: number;
  firstActiveWeek: number | null;
  lastActiveWeek: number | null;
}

export type NarPathKey =
  | 'neverStarted'
  | 'fastDrop'
  | 'slowDecline'
  | 'intermittent'
  | 'steady'
  | 'growing';

export interface NarPlanRiskRow {
  plan: string;
  total: number;
  churnPct: number;
  earlyChurnPct: number;
  neverUsedPct: number;
  riskScore: number;
}

export interface NarAction {
  priority: 1 | 2 | 3;
  action: string;
  expectedImpact: string;
}

export interface NarInsights {
  reportDate: string;
  healthScore: number;
  healthLabel: string;
  healthColor: string;
  mainNar: number;
  churnRate: number;
  neverUsedPct: number;
  stillActivePct: number;
  totalAccounts: number;
  churnedAccounts: number;
  neverUsed: number;
  stoppedM1: number;
  stillActive: number;
  totalPathAccounts: number;
  paths: Record<NarPathKey, NarPathAccount[]>;
  criticalFindings: NarFinding[];
  segmentComparison: NarSignal[];
  planRisk: NarPlanRiskRow[];
  trendSignals: NarSignal[];
  weeklyDecayInsights: NarSignal[];
  operatorInsights: NarSignal[];
  historyInsights: NarSignal[];
  actions: NarAction[];
}

// ─── n8n forwarder ──────────────────────────────────────────────────────────
export interface NarN8nForwardRequest {
  webhookUrl: string;
  payload: Record<string, unknown>;
}

export interface NarN8nForwardResult {
  status: number;
  body: string;
}
