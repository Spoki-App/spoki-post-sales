// ─── MRR History ─────────────────────────────────────────────────────────────
export interface MrrHistoryRow {
  month: string;
  mrrAmount: number;
  previousMrrAmount: number;
  isNewCustomer: boolean;
  isReactivation: boolean;
  planSlug: string;
  paymentType: string;
  accountId: string;
  accountName: string;
}

export interface MrrMonthSummary {
  month: string;
  totalMrr: number;
  isPartial: boolean;
}

// ─── NRR / GRR ───────────────────────────────────────────────────────────────
export interface NrrGrrMonth {
  month: string;
  isPartial: boolean;
  nrrPct: number;
  grrPct: number;
  mrrExisting: number;
  mrrActual: number;
  totalMrr: number;
  newMrr: number;
  newCount: number;
  churnedRevenue: number;
  churnedCount: number;
  expansionRevenue: number;
  expandedCount: number;
  contractionRevenue: number;
  contractedCount: number;
  reactivationRevenue: number;
  reactivationCount: number;
  retainedCount: number;
}

// ─── Account Payments ────────────────────────────────────────────────────────
export interface PaymentLine {
  date: string;
  amount: number;
  plan: string;
  description: string;
}

export interface AccountPayments {
  accountId: number;
  period: string;
  subscriptions: { total: number; lines: PaymentLine[] };
  recharges: { total: number; lines: PaymentLine[] };
}

// ─── Failed Payments ─────────────────────────────────────────────────────────
export interface FailedPayment {
  invoiceId: string;
  stripeCustomerId: string;
  customerEmail: string | null;
  customerName: string | null;
  amountDue: number;
  currency: string;
  dueDate: string | null;
  created: string;
  attemptCount: number;
  nextPaymentAttempt: string | null;
  accountId: number | null;
  accountName: string | null;
  statusResolution: 'pending' | 'resolved';
}

export interface FailedPaymentsSummary {
  total: number;
  totalAmount: number;
  pending: number;
  resolved: number;
}

// ─── Subscription History ────────────────────────────────────────────────────
export interface SubscriptionHistoryEntry {
  planSlug: string;
  periodStart: string | null;
  periodEnd: string | null;
  billing: string;
  conversations: number;
}

// ─── Churn Details ───────────────────────────────────────────────────────────
export interface ChurnRecord {
  accountId: number;
  accountName: string;
  planSlug: string;
  conversationLimit: number | null;
  mrrLost: number;
  subscriptionEndDate: string;
  paymentType: string;
  daysSinceExpiry: number;
  hsId: string | null;
  isPartner: boolean;
  firstPaymentDate: string | null;
  firstPlanSlug: string | null;
  primaryContact: string | null;
}

// ─── Pareto Analysis ─────────────────────────────────────────────────────────
export interface ParetoTrend {
  month: string;
  totalAccounts: number;
  totalMrr: number;
  pctMrrTop10: number;
  pctMrrTop20: number;
  pctMrrTop50: number;
}

export interface ParetoTopAccount {
  rank: number;
  accountId: string;
  accountName: string;
  mrr: number;
  arr: number;
  pctOfTotal: number;
  planSlug: string;
}

export interface ParetoAnalysis {
  summary: ParetoTrend | null;
  trend: ParetoTrend[];
  topAccounts: ParetoTopAccount[];
  distribution: Array<{ bucket: string; count: number; totalMrr: number }>;
}

// ─── Daily KPIs ──────────────────────────────────────────────────────────────
export interface DailyKpis {
  dashboardCards: {
    subscriptionMRR: number;
    credit: number;
    otherRevenue: number;
  };
  revenue: {
    currentMonth: number;
    previousMonth: number;
    monthChangePct: number;
    today: number;
    yesterday: number;
    dayChangePct: number;
  };
  ytd: {
    total: number;
    lastYear: number;
    yoyChangePct: number;
    yoyDelta: number;
  };
  churn: {
    monthly: {
      totalCurrent: number;
      totalPrevious: number;
      mrrCurrent: number;
      mrrPrevious: number;
    };
  };
  newCustomers: {
    monthCount: number;
    previousMonthCount: number;
    monthChangePct: number;
    yesterdayCount: number;
  };
  newARR: {
    today: number;
    todayCount: number;
    yesterday: number;
    yesterdayCount: number;
    month: number;
    previousMonth: number;
    monthChangePct: number;
  };
}
