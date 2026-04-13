export const CHURN_STATUSES = [
  'nuovo', 'contattato', 'nessuna_risposta', 'messaggio_wa',
  'in_trattativa', 'recuperato', 'perso', 'rinnovato_auto',
] as const;

export type ChurnStatus = typeof CHURN_STATUSES[number];

export const CHURN_STATUS_LABELS: Record<ChurnStatus, string> = {
  nuovo: 'Nuovo',
  contattato: 'Contattato',
  nessuna_risposta: 'Nessuna risposta',
  messaggio_wa: 'Messaggio WA',
  in_trattativa: 'In trattativa',
  recuperato: 'Recuperato',
  perso: 'Perso',
  rinnovato_auto: 'Rinnovato (auto)',
};

export const CHURN_STATUS_COLORS: Record<ChurnStatus, string> = {
  nuovo: 'text-red-600 bg-red-50 border-red-200',
  contattato: 'text-amber-600 bg-amber-50 border-amber-200',
  nessuna_risposta: 'text-orange-600 bg-orange-50 border-orange-200',
  messaggio_wa: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  in_trattativa: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  recuperato: 'text-emerald-700 bg-emerald-50 border-emerald-300',
  perso: 'text-slate-500 bg-slate-50 border-slate-200',
  rinnovato_auto: 'text-teal-600 bg-teal-50 border-teal-200',
};

export const ACTIVE_STATUSES: ChurnStatus[] = [
  'nuovo', 'contattato', 'nessuna_risposta', 'messaggio_wa', 'in_trattativa',
];

export const CHURN_REASONS = {
  payment_failed: 'Pagamento fallito',
  quality: 'Qualita del servizio',
  seasonality: 'Stagionalita del business',
  expectations: 'Aspettative non mantenute',
} as const;

export type ChurnReason = keyof typeof CHURN_REASONS;

export const CONTACT_OUTCOMES = {
  paghera: 'Paghera',
  churn_definitivo: 'Churn definitivo',
  da_ricontattare: 'Da ricontattare',
} as const;

export type ContactOutcome = keyof typeof CONTACT_OUTCOMES;

export interface ChurnTrackerRecord {
  id: string;
  accountId: number;
  accountName: string | null;
  planSlug: string | null;
  conversationLimit: number | null;
  mrrLost: number;
  subscriptionEndDate: string | null;
  paymentType: string | null;
  daysSinceExpiry: number;
  hsId: string | null;
  isPartner: boolean;
  firstPaymentDate: string | null;
  firstPlanSlug: string | null;
  primaryContact: string | null;
  status: ChurnStatus;
  churnReason: string | null;
  contactOutcome: string | null;
  assignedTo: { name: string; email?: string } | null;
  statusChangedAt: string | null;
  firstDetectedAt: string;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChurnNote {
  id: string;
  churnRecordId: string;
  accountId: number;
  text: string;
  author: string | null;
  createdAt: string;
}

export interface ChurnSummary {
  total: number;
  active: number;
  mrrAtRisk: number;
  recovered: number;
  mrrRecovered: number;
  lost: number;
  mrrLost: number;
  recoveryRate: number;
}
