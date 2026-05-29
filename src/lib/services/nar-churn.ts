/**
 * Analisi churn — porting da `churnAnalysis` di App.jsx.
 * Calcola NAR per piano, at-risk accounts, decay settimanale, breakpoint analysis,
 * monthly churn e churn per segment/plan/tier.
 */

import type { NarRow, NarOperatorEntry } from '@/types/nar';
import { isDirectClient, isPartnerChild, type ExclusionSets } from './nar-buckets';

interface AccountInfo {
  accountId: number;
  planSlug: string;
  conversationTier: number;
  partnerId: string;
  partnerType: string;
  countryCode: string;
  accountName: string;
  isDirect: boolean;
  isPartner: boolean;
}

interface ChurnSegmentResult {
  total: number;
  active: number;
  churned: number;
  activePercent: number;
  churnPercent: number;
  activeAccounts: ChurnAccountRow[];
  churnedAccounts: ChurnAccountRow[];
}

export interface ChurnAccountRow {
  accountId: number;
  accountName: string;
  plan: string;
  tier: number;
  totalConsumption: number;
  operator: string;
}

export interface AtRiskAccount {
  accountId: number;
  accountName: string;
  plan: string;
  tier: number;
  sumConv: number;
  nar: number;
  operator: string;
}

export interface PlanRow {
  plan: string;
  accounts?: number;
  total?: number;
  churnPercent?: number;
  active?: number;
  churned?: number;
  activePercent?: number;
  sumConv?: number;
  sumTier?: number;
  nar?: number;
}

export interface DecayRate {
  plan: string;
  week1: number;
  week4: number;
  lastWeek: number;
  firstMonthDecay: number;
  avgWeeklyDrop: number;
  totalDecay: number;
  decaySpeed: number;
}

export interface BreakpointAccount {
  accountId: number;
  plan: string;
  tier: number;
  totalConsumption: number;
  firstActiveWeek: number | null;
  lastActiveWeek: number | null;
  maxWeek: number;
}

export interface BreakpointSummary {
  total: number;
  neverUsed: number;
  neverUsedPercent: number;
  stoppedMonth1: number;
  stoppedMonth1Percent: number;
  stoppedMonth2: number;
  stoppedMonth2Percent: number;
  stoppedMonth3: number;
  stoppedMonth3Percent: number;
  stoppedMonth4Plus: number;
  stoppedMonth4PlusPercent: number;
  stillActive: number;
  stillActivePercent: number;
}

export interface MonthlyChurnPoint {
  month: number;
  monthLabel: string;
  total: number;
  using: number;
  notUsing: number;
  usingPercent: number;
  churnRate: number;
}

export interface NarChurnAnalysis {
  byPlan: Array<{ plan: string; accounts: number; sumConv: number; sumTier: number; nar: number }>;
  byPlanMonth: Array<{ plan: string; monthData: Array<{ month: number; nar: number; accounts: number }> }>;
  atRisk: AtRiskAccount[];
  atRiskOperators: string[];
  planTrends: Array<{ plan: string; trend: number; firstNar: number; lastNar: number; direction: string; months?: number }>;
  chartData: Array<Record<string, number | string>>;
  plans: string[];
  weeklyDecay: Array<Record<string, number | string>>;
  decayRates: DecayRate[];
  earlyChurnByPlan: Array<{ plan: string; total: number; churned: number; completed: number; churnRate: number; avgChurnWeek: number }>;
  cohortByWeek: Array<{ week: number; weekLabel: string; accounts: number; sumConv: number; sumTier: number; avgNar: number; avgConvPerAccount: number; avgTierPerAccount: number }>;
  retentionByWeek: Array<{ week: number; accounts: number; retention: number }>;
  totalAccountsWeek1: number;
  monthlyChurn: MonthlyChurnPoint[];
  monthlyChurnPieData: Array<{ month: number; monthLabel: string; data: Array<{ name: string; value: number; color: string }>; usingPercent: number; churnRate: number; total: number }>;
  churnBySegment: Record<'all' | 'directAll' | 'directNoEs' | 'directEs' | 'partner', ChurnSegmentResult>;
  churnByPlan: Array<{ plan: string } & ChurnSegmentResult>;
  churnByTier: Array<{ tier: string; tierValue: number } & ChurnSegmentResult>;
  breakpointStats: {
    neverUsed: BreakpointAccount[];
    stoppedMonth1: BreakpointAccount[];
    stoppedMonth2: BreakpointAccount[];
    stoppedMonth3: BreakpointAccount[];
    stoppedMonth4Plus: BreakpointAccount[];
    stillActive: BreakpointAccount[];
  };
  breakpointSummary: BreakpointSummary;
  weeklyBreakdownArray: Array<{ week: number; month: number; stoppedCount: number; accounts: BreakpointAccount[] }>;
  breakpointByPlan: Array<{
    plan: string;
    total: number;
    neverUsed: number;
    neverUsedPercent: number;
    stoppedM1: number;
    stoppedM1Percent: number;
    stoppedM2: number;
    stoppedM2Percent: number;
    stoppedM3: number;
    stoppedM3Percent: number;
    earlyChurnTotal: number;
    earlyChurnPercent: number;
  }>;
}

const TIER_VALUES = [150, 400, 900, 2400, 4800, 14000, 30000];

export function emptyChurnAnalysis(): NarChurnAnalysis {
  return {
    byPlan: [], byPlanMonth: [], atRisk: [], atRiskOperators: [],
    planTrends: [], chartData: [], plans: [], weeklyDecay: [], decayRates: [],
    earlyChurnByPlan: [], cohortByWeek: [], retentionByWeek: [], totalAccountsWeek1: 0,
    monthlyChurn: [], monthlyChurnPieData: [],
    churnBySegment: {
      all: emptySegment(), directAll: emptySegment(), directNoEs: emptySegment(),
      directEs: emptySegment(), partner: emptySegment(),
    },
    churnByPlan: [], churnByTier: [],
    breakpointStats: { neverUsed: [], stoppedMonth1: [], stoppedMonth2: [], stoppedMonth3: [], stoppedMonth4Plus: [], stillActive: [] },
    breakpointSummary: {
      total: 0, neverUsed: 0, neverUsedPercent: 0,
      stoppedMonth1: 0, stoppedMonth1Percent: 0, stoppedMonth2: 0, stoppedMonth2Percent: 0,
      stoppedMonth3: 0, stoppedMonth3Percent: 0, stoppedMonth4Plus: 0, stoppedMonth4PlusPercent: 0,
      stillActive: 0, stillActivePercent: 0,
    },
    weeklyBreakdownArray: [], breakpointByPlan: [],
  };
}

function emptySegment(): ChurnSegmentResult {
  return { total: 0, active: 0, churned: 0, activePercent: 0, churnPercent: 0, activeAccounts: [], churnedAccounts: [] };
}

export function computeChurnAnalysis(
  filteredRows: NarRow[],
  operators: NarOperatorEntry[],
  exclusionSets: ExclusionSets
): NarChurnAnalysis {
  if (filteredRows.length === 0) return emptyChurnAnalysis();

  const plans = [...new Set(filteredRows.map(r => r.planSlug || 'N/A'))];
  const months = [...new Set(filteredRows.map(r => r.monthCount))].sort((a, b) => a - b);

  const operatorMap = new Map<string, string>();
  for (const op of operators) operatorMap.set(String(op.accountId), op.operator);

  // ─── NAR by plan ──────────────────────────────────────────────────────────
  const byPlan = plans.map(plan => {
    const rows = filteredRows.filter(r => (r.planSlug || 'N/A') === plan && r.weekCount > 0);
    const sumConv = rows.reduce((a, r) => a + Number(r.weekConversationCount), 0);
    const sumTier = rows.reduce((a, r) => a + Number(r.conversationTier), 0);
    const accounts = new Set(rows.map(r => r.accountId)).size;
    return {
      plan,
      accounts,
      sumConv,
      sumTier,
      nar: sumTier > 0 ? (sumConv / sumTier) * 100 : 0,
    };
  }).sort((a, b) => a.nar - b.nar);

  const byPlanMonth = plans.map(plan => {
    const monthData = months.map(month => {
      const rows = filteredRows.filter(r => (r.planSlug || 'N/A') === plan && r.monthCount === month && r.weekCount > 0);
      const seen = new Set<number>();
      let sumConv = 0;
      let sumTier = 0;
      for (const r of rows) {
        if (!seen.has(r.accountId)) {
          seen.add(r.accountId);
          sumConv += Number(r.monthConversationCount || 0);
          sumTier += Number(r.conversationTier || 0);
        }
      }
      return {
        month,
        nar: sumTier > 0 ? (sumConv / sumTier) * 100 : 0,
        accounts: seen.size,
      };
    });
    return { plan, monthData };
  });

  const planTrends = plans.map(plan => {
    const planMonths = byPlanMonth.find(p => p.plan === plan)?.monthData || [];
    const validMonths = planMonths.filter(m => m.accounts > 0);
    if (validMonths.length < 2) return { plan, trend: 0, firstNar: 0, lastNar: 0, direction: 'stable' };
    const firstNar = validMonths[0].nar;
    const lastNar = validMonths[validMonths.length - 1].nar;
    const trend = lastNar - firstNar;
    const direction = trend < -5 ? 'declining' : trend > 5 ? 'growing' : 'stable';
    return { plan, trend, firstNar, lastNar, direction, months: validMonths.length };
  }).sort((a, b) => a.trend - b.trend);

  // ─── At-risk (NAR < 10 nell'ultimo mese) ──────────────────────────────────
  const lastMonth = months.length > 0 ? Math.max(...months) : 0;
  const atRisk: AtRiskAccount[] = [];
  const seenAtRisk = new Set<number>();
  for (const r of filteredRows.filter(rr => rr.monthCount === lastMonth)) {
    if (seenAtRisk.has(r.accountId)) continue;
    seenAtRisk.add(r.accountId);
    const accountRows = filteredRows.filter(ar => ar.accountId === r.accountId && ar.weekCount > 0);
    const monthSeen = new Set<number>();
    let sumConv = 0;
    for (const ar of accountRows) {
      if (!monthSeen.has(ar.monthCount)) {
        monthSeen.add(ar.monthCount);
        sumConv += Number(ar.monthConversationCount || 0);
      }
    }
    const tier = Number(r.conversationTier) || 0;
    const nar = tier > 0 ? (sumConv / tier) * 100 : 0;
    if (nar < 10 && tier > 0) {
      atRisk.push({
        accountId: r.accountId,
        accountName: r.accountName,
        plan: r.planSlug || 'N/A',
        tier,
        sumConv,
        nar,
        operator: operatorMap.get(String(r.accountId)) || 'NA operatore',
      });
    }
  }
  atRisk.sort((a, b) => a.nar - b.nar);
  const atRiskOperators = [...new Set(atRisk.map(a => a.operator))].sort((a, b) => {
    if (a === 'NA operatore') return 1;
    if (b === 'NA operatore') return -1;
    return a.localeCompare(b);
  });

  const chartData = months.map(month => {
    const row: Record<string, number | string> = { month: `M${month}` };
    for (const plan of plans) {
      const pm = byPlanMonth.find(p => p.plan === plan)?.monthData.find(m => m.month === month);
      row[plan] = pm ? Number(pm.nar.toFixed(2)) : 0;
    }
    return row;
  });

  // ─── Weekly decay ─────────────────────────────────────────────────────────
  const weeks = [...new Set(filteredRows.map(r => r.weekCount))].filter(w => w >= 1).sort((a, b) => a - b);
  const weeklyDecay = weeks.map(week => {
    const row: Record<string, number | string> = { week: `W${week}` };
    for (const plan of plans) {
      const rows = filteredRows.filter(r => (r.planSlug || 'N/A') === plan && r.weekCount === week);
      const sumConv = rows.reduce((a, r) => a + Number(r.weekConversationCount), 0);
      const sumTier = rows.reduce((a, r) => a + Number(r.conversationTier), 0);
      row[plan] = sumTier > 0 ? Number(((sumConv / sumTier) * 100).toFixed(2)) : 0;
    }
    return row;
  });

  const decayRates: DecayRate[] = plans.map(plan => {
    const week1 = Number(weeklyDecay.find(w => w.week === 'W1')?.[plan] ?? 0);
    const week4 = Number(weeklyDecay.find(w => w.week === 'W4')?.[plan] ?? 0);
    const lastWeek = Number(weeklyDecay[weeklyDecay.length - 1]?.[plan] ?? 0);

    const validWeeks = weeklyDecay.filter(w => Number(w[plan]) > 0);
    let totalDrop = 0;
    for (let i = 1; i < validWeeks.length; i++) {
      totalDrop += Number(validWeeks[i - 1][plan]) - Number(validWeeks[i][plan]);
    }
    const avgWeeklyDrop = validWeeks.length > 1 ? totalDrop / (validWeeks.length - 1) : 0;
    const firstMonthDecay = week1 - week4;

    return {
      plan,
      week1, week4, lastWeek,
      firstMonthDecay, avgWeeklyDrop,
      totalDecay: week1 - lastWeek,
      decaySpeed: week1 > 0 ? ((week1 - lastWeek) / week1) * 100 : 0,
    };
  }).sort((a, b) => b.decaySpeed - a.decaySpeed);

  // ─── Early churn by plan ──────────────────────────────────────────────────
  const maxWeekByAccount = new Map<number, number>();
  for (const r of filteredRows) {
    const current = maxWeekByAccount.get(r.accountId) || 0;
    if (r.weekCount > current) maxWeekByAccount.set(r.accountId, r.weekCount);
  }
  const earlyChurnByPlan = plans.map(plan => {
    const planAccounts = [...new Set(filteredRows.filter(r => (r.planSlug || 'N/A') === plan).map(r => r.accountId))];
    const churned = planAccounts.filter(id => (maxWeekByAccount.get(id) || 0) < 16);
    const completed = planAccounts.filter(id => (maxWeekByAccount.get(id) || 0) >= 16);
    const avgChurnWeek = churned.length > 0
      ? churned.reduce((a, id) => a + (maxWeekByAccount.get(id) || 0), 0) / churned.length
      : 0;
    return {
      plan,
      total: planAccounts.length,
      churned: churned.length,
      completed: completed.length,
      churnRate: planAccounts.length > 0 ? (churned.length / planAccounts.length) * 100 : 0,
      avgChurnWeek,
    };
  }).filter(p => p.total > 0).sort((a, b) => b.churnRate - a.churnRate);

  // ─── Cohort by week / retention ───────────────────────────────────────────
  const cohortByWeek = weeks.map(week => {
    const weekRows = filteredRows.filter(r => r.weekCount === week);
    const accounts = new Set(weekRows.map(r => r.accountId)).size;
    const sumConv = weekRows.reduce((a, r) => a + Number(r.weekConversationCount), 0);
    const sumTier = weekRows.reduce((a, r) => a + Number(r.conversationTier), 0);
    const avgNar = sumTier > 0 ? (sumConv / sumTier) * 100 : 0;
    return {
      week,
      weekLabel: `Settimana ${week}`,
      accounts, sumConv, sumTier, avgNar,
      avgConvPerAccount: accounts > 0 ? Math.round(sumConv / accounts) : 0,
      avgTierPerAccount: accounts > 0 ? Math.round(sumTier / accounts) : 0,
    };
  });
  const totalAccountsWeek1 = cohortByWeek.find(w => w.week === 1)?.accounts || 1;
  const retentionByWeek = cohortByWeek.map(w => ({
    ...w,
    retention: (w.accounts / totalAccountsWeek1) * 100,
  }));

  // ─── Churn by segment ─────────────────────────────────────────────────────
  const accountTotalConsumption = new Map<number, number>();
  const accountInfo = new Map<number, AccountInfo>();
  for (const r of filteredRows) {
    const id = r.accountId;
    accountTotalConsumption.set(id, (accountTotalConsumption.get(id) || 0) + Number(r.monthConversationCount || 0));
    if (!accountInfo.has(id)) {
      accountInfo.set(id, {
        accountId: id,
        planSlug: r.planSlug || 'N/A',
        conversationTier: Number(r.conversationTier) || 0,
        partnerId: r.partnerId,
        partnerType: r.partnerType,
        countryCode: r.countryCode,
        accountName: r.accountName,
        isDirect: isDirectClient(r),
        isPartner: isPartnerChild(r),
      });
    }
  }

  const calcSegmentChurn = (filterFn: (info: AccountInfo) => boolean): ChurnSegmentResult => {
    let total = 0, active = 0, churned = 0;
    const activeAccounts: ChurnAccountRow[] = [];
    const churnedAccounts: ChurnAccountRow[] = [];
    for (const [id, info] of accountInfo) {
      if (!filterFn(info)) continue;
      total++;
      const consumption = accountTotalConsumption.get(id) || 0;
      const operator = operatorMap.get(String(id)) || 'NA operatore';
      const data: ChurnAccountRow = {
        accountId: id,
        accountName: info.accountName || '—',
        plan: info.planSlug,
        tier: info.conversationTier,
        totalConsumption: consumption,
        operator,
      };
      if (consumption > 0) { active++; activeAccounts.push(data); }
      else { churned++; churnedAccounts.push(data); }
    }
    return {
      total, active, churned,
      activePercent: total > 0 ? (active / total) * 100 : 0,
      churnPercent: total > 0 ? (churned / total) * 100 : 0,
      activeAccounts, churnedAccounts,
    };
  };

  const excludeDirectListed = (info: AccountInfo) =>
    exclusionSets.directExclusionIds.size === 0 || !exclusionSets.directExclusionIds.has(String(info.accountId));

  const churnBySegment = {
    all: calcSegmentChurn(() => true),
    directAll: calcSegmentChurn(info => info.isDirect && excludeDirectListed(info)),
    directNoEs: calcSegmentChurn(info => info.isDirect && info.countryCode !== 'ES' && excludeDirectListed(info)),
    directEs: calcSegmentChurn(info => info.isDirect && info.countryCode === 'ES' && excludeDirectListed(info)),
    partner: calcSegmentChurn(info => info.isPartner),
  };

  const churnByPlan = plans.map(plan => {
    const stats = calcSegmentChurn(info => info.planSlug === plan);
    return { plan, ...stats };
  }).filter(p => p.total > 0).sort((a, b) => b.churnPercent - a.churnPercent);

  const churnByTier = TIER_VALUES.map(tier => {
    const stats = calcSegmentChurn(info => info.conversationTier === tier);
    return { tier: tier.toLocaleString('it-IT'), tierValue: tier, ...stats };
  }).filter(t => t.total > 0).sort((a, b) => a.tierValue - b.tierValue);

  // ─── Monthly churn + pie ──────────────────────────────────────────────────
  const monthsExcluding0 = months.filter(m => m > 0);
  const monthlyChurn: MonthlyChurnPoint[] = monthsExcluding0.map(month => {
    const monthRows = filteredRows.filter(r => r.monthCount === month);
    const accountConsumption = new Map<number, number>();
    for (const r of monthRows) {
      if (!accountConsumption.has(r.accountId)) {
        accountConsumption.set(r.accountId, Number(r.monthConversationCount || 0));
      }
    }
    let using = 0, notUsing = 0;
    for (const consumption of accountConsumption.values()) {
      if (consumption > 0) using++; else notUsing++;
    }
    const total = using + notUsing;
    return {
      month,
      monthLabel: `Mese ${month}`,
      total, using, notUsing,
      usingPercent: total > 0 ? (using / total) * 100 : 0,
      churnRate: total > 0 ? (notUsing / total) * 100 : 0,
    };
  });
  const monthlyChurnPieData = monthlyChurn.slice(0, 4).map(m => ({
    month: m.month,
    monthLabel: m.monthLabel,
    data: [
      { name: 'Stanno usando', value: m.using, color: '#10b981' },
      { name: 'Non stanno usando', value: m.notUsing, color: '#ef4444' },
    ],
    usingPercent: m.usingPercent,
    churnRate: m.churnRate,
    total: m.total,
  }));

  // ─── Breakpoint ───────────────────────────────────────────────────────────
  interface UsagePattern {
    accountId: number;
    plan: string;
    tier: number;
    weeklyData: Map<number, number>;
    totalConsumption: number;
    firstActiveWeek: number | null;
    lastActiveWeek: number | null;
    maxWeek: number;
  }
  const accountUsagePattern = new Map<number, UsagePattern>();
  for (const r of filteredRows) {
    const id = r.accountId;
    const week = r.weekCount;
    const consumption = Number(r.weekConversationCount || 0);
    let pattern = accountUsagePattern.get(id);
    if (!pattern) {
      pattern = {
        accountId: id,
        plan: r.planSlug || 'N/A',
        tier: Number(r.conversationTier) || 0,
        weeklyData: new Map(),
        totalConsumption: 0,
        firstActiveWeek: null,
        lastActiveWeek: null,
        maxWeek: 0,
      };
      accountUsagePattern.set(id, pattern);
    }
    pattern.weeklyData.set(week, consumption);
    pattern.totalConsumption += consumption;
    pattern.maxWeek = Math.max(pattern.maxWeek, week);
    if (consumption > 0) {
      if (pattern.firstActiveWeek === null || week < pattern.firstActiveWeek) pattern.firstActiveWeek = week;
      if (pattern.lastActiveWeek === null || week > pattern.lastActiveWeek) pattern.lastActiveWeek = week;
    }
  }

  const breakpointStats = {
    neverUsed: [] as BreakpointAccount[],
    stoppedMonth1: [] as BreakpointAccount[],
    stoppedMonth2: [] as BreakpointAccount[],
    stoppedMonth3: [] as BreakpointAccount[],
    stoppedMonth4Plus: [] as BreakpointAccount[],
    stillActive: [] as BreakpointAccount[],
  };
  const maxWeekInData = accountUsagePattern.size > 0
    ? Math.max(...[...accountUsagePattern.values()].map(p => p.maxWeek))
    : 0;

  for (const pattern of accountUsagePattern.values()) {
    const acc: BreakpointAccount = {
      accountId: pattern.accountId,
      plan: pattern.plan,
      tier: pattern.tier,
      totalConsumption: pattern.totalConsumption,
      firstActiveWeek: pattern.firstActiveWeek,
      lastActiveWeek: pattern.lastActiveWeek,
      maxWeek: pattern.maxWeek,
    };
    if (pattern.totalConsumption === 0) {
      breakpointStats.neverUsed.push(acc);
    } else if (pattern.lastActiveWeek !== null) {
      const isStillActive = pattern.lastActiveWeek >= pattern.maxWeek - 1;
      if (isStillActive && pattern.maxWeek >= maxWeekInData - 2) {
        breakpointStats.stillActive.push(acc);
      } else if (pattern.lastActiveWeek <= 4) {
        breakpointStats.stoppedMonth1.push(acc);
      } else if (pattern.lastActiveWeek <= 8) {
        breakpointStats.stoppedMonth2.push(acc);
      } else if (pattern.lastActiveWeek <= 12) {
        breakpointStats.stoppedMonth3.push(acc);
      } else {
        breakpointStats.stoppedMonth4Plus.push(acc);
      }
    }
  }

  const weeklyBreakdown: Record<number, { week: number; month: number; stoppedCount: number; accounts: BreakpointAccount[] }> = {};
  for (let w = 1; w <= 16; w++) {
    weeklyBreakdown[w] = { week: w, month: Math.ceil(w / 4), stoppedCount: 0, accounts: [] };
  }
  for (const acc of [...breakpointStats.stoppedMonth1, ...breakpointStats.stoppedMonth2, ...breakpointStats.stoppedMonth3, ...breakpointStats.stoppedMonth4Plus]) {
    const lastWeek = acc.lastActiveWeek;
    if (lastWeek && lastWeek <= 16 && weeklyBreakdown[lastWeek]) {
      weeklyBreakdown[lastWeek].stoppedCount++;
      weeklyBreakdown[lastWeek].accounts.push(acc);
    }
  }
  const weeklyBreakdownArray = Object.values(weeklyBreakdown).filter(w => w.stoppedCount > 0);

  const totalAccounts = accountUsagePattern.size;
  const breakpointSummary: BreakpointSummary = {
    total: totalAccounts,
    neverUsed: breakpointStats.neverUsed.length,
    neverUsedPercent: totalAccounts > 0 ? (breakpointStats.neverUsed.length / totalAccounts) * 100 : 0,
    stoppedMonth1: breakpointStats.stoppedMonth1.length,
    stoppedMonth1Percent: totalAccounts > 0 ? (breakpointStats.stoppedMonth1.length / totalAccounts) * 100 : 0,
    stoppedMonth2: breakpointStats.stoppedMonth2.length,
    stoppedMonth2Percent: totalAccounts > 0 ? (breakpointStats.stoppedMonth2.length / totalAccounts) * 100 : 0,
    stoppedMonth3: breakpointStats.stoppedMonth3.length,
    stoppedMonth3Percent: totalAccounts > 0 ? (breakpointStats.stoppedMonth3.length / totalAccounts) * 100 : 0,
    stoppedMonth4Plus: breakpointStats.stoppedMonth4Plus.length,
    stoppedMonth4PlusPercent: totalAccounts > 0 ? (breakpointStats.stoppedMonth4Plus.length / totalAccounts) * 100 : 0,
    stillActive: breakpointStats.stillActive.length,
    stillActivePercent: totalAccounts > 0 ? (breakpointStats.stillActive.length / totalAccounts) * 100 : 0,
  };

  const breakpointByPlan = plans.map(plan => {
    const planAccounts = [...accountUsagePattern.values()].filter(p => p.plan === plan);
    const total = planAccounts.length;
    const neverUsed = planAccounts.filter(p => p.totalConsumption === 0).length;
    const stoppedM1 = planAccounts.filter(p => p.totalConsumption > 0 && p.lastActiveWeek !== null && p.lastActiveWeek <= 4).length;
    const stoppedM2 = planAccounts.filter(p => p.lastActiveWeek !== null && p.lastActiveWeek > 4 && p.lastActiveWeek <= 8).length;
    const stoppedM3 = planAccounts.filter(p => p.lastActiveWeek !== null && p.lastActiveWeek > 8 && p.lastActiveWeek <= 12).length;
    return {
      plan, total, neverUsed,
      neverUsedPercent: total > 0 ? (neverUsed / total) * 100 : 0,
      stoppedM1, stoppedM1Percent: total > 0 ? (stoppedM1 / total) * 100 : 0,
      stoppedM2, stoppedM2Percent: total > 0 ? (stoppedM2 / total) * 100 : 0,
      stoppedM3, stoppedM3Percent: total > 0 ? (stoppedM3 / total) * 100 : 0,
      earlyChurnTotal: neverUsed + stoppedM1 + stoppedM2,
      earlyChurnPercent: total > 0 ? ((neverUsed + stoppedM1 + stoppedM2) / total) * 100 : 0,
    };
  }).filter(p => p.total > 0).sort((a, b) => b.earlyChurnPercent - a.earlyChurnPercent);

  return {
    byPlan, byPlanMonth, atRisk, atRiskOperators, planTrends, chartData, plans,
    weeklyDecay, decayRates,
    earlyChurnByPlan, cohortByWeek, retentionByWeek, totalAccountsWeek1,
    monthlyChurn, monthlyChurnPieData,
    churnBySegment, churnByPlan, churnByTier,
    breakpointStats, breakpointSummary, weeklyBreakdownArray, breakpointByPlan,
  };
}
