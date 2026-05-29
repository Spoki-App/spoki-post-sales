/**
 * Analisi NAR per operatore — porting da `operatorsAnalysis` di App.jsx.
 * Calcola, per ogni operatore presente nel periodo filtrato, le metriche aggregate
 * sui 4 bucket (direct_all, direct_no_es, direct_es_only, partner_all).
 */

import type { NarRow, NarBucketKey, NarFilters, NarOperatorEntry } from '@/types/nar';
import {
  BUCKETS,
  DIRECT_BUCKET_KEYS,
  isDirectClient,
  isPartnerChild,
  rowsWithoutDirectExclusions,
  type ExclusionSets,
} from './nar-buckets';

interface BucketAggregate {
  accounts: number;
  rows: number;
  sumConv: number;
  sumTier: number;
  nar: number;
}

export interface NarOperatorBreakdown {
  operator: string;
  isNA?: boolean;
  totalAccounts: number;
  totalRows: number;
  directAllAccounts: number;
  directAllNar: number;
  directAccounts: number;
  directSumConv: number;
  directSumTier: number;
  directNar: number;
  directEsAccounts: number;
  directEsNar: number;
  partnerAccounts: number;
  partnerSumConv: number;
  partnerSumTier: number;
  partnerNar: number;
  buckets: Record<NarBucketKey, BucketAggregate>;
  totalNar: number;
}

export interface NarOperatorsAnalysis {
  byOperator: NarOperatorBreakdown[];
  operatorsList: string[];
}

function calcBucket(rows: NarRow[], useMonthConv: boolean): BucketAggregate {
  if (useMonthConv) {
    const accountMonthSeen = new Set<string>();
    let sumConv = 0;
    let sumTier = 0;
    const ids = new Set<number>();
    for (const r of rows) {
      ids.add(r.accountId);
      const key = `${r.accountId}_${r.monthCount}`;
      if (!accountMonthSeen.has(key)) {
        accountMonthSeen.add(key);
        sumConv += Number(r.monthConversationCount || 0);
        sumTier += Number(r.conversationTier || 0);
      }
    }
    const nar = sumTier > 0 ? (sumConv / sumTier) * 100 : 0;
    return { accounts: ids.size, rows: rows.length, sumConv, sumTier, nar };
  }
  let sumConv = 0;
  let sumTier = 0;
  const ids = new Set<number>();
  for (const r of rows) {
    ids.add(r.accountId);
    sumConv += Number(r.weekConversationCount || 0);
    sumTier += Number(r.conversationTier || 0);
  }
  const nar = sumTier > 0 ? (sumConv / sumTier) * 100 : 0;
  return { accounts: ids.size, rows: rows.length, sumConv, sumTier, nar };
}

function calcOperatorStats(
  operator: string,
  accountIds: Set<string>,
  filteredRows: NarRow[],
  filters: NarFilters,
  exclusionSets: ExclusionSets
): NarOperatorBreakdown {
  const useMonthConv = filters.type === 'month';
  const baseRows = filteredRows.filter(r => accountIds.has(String(r.accountId)));
  const rows = filters.excludeWeekZero ? baseRows.filter(r => r.weekCount > 0) : baseRows;

  const directAllRows = rows.filter(r => isDirectClient(r));
  const directScoped = rowsWithoutDirectExclusions(directAllRows, exclusionSets.directExclusionIds);
  const directNoEsRows = directScoped.filter(r => r.countryCode !== 'ES');
  const directEsRows = directScoped.filter(r => r.countryCode === 'ES');
  const partnerRows = rows.filter(r => isPartnerChild(r));

  const directAll = calcBucket(directScoped, useMonthConv);
  const directNoEs = calcBucket(directNoEsRows, useMonthConv);
  const directEs = calcBucket(directEsRows, useMonthConv);
  const partner = calcBucket(partnerRows, useMonthConv);
  const total = calcBucket(rows, useMonthConv);

  const totalNar = (directAll.sumTier + partner.sumTier) > 0
    ? ((directAll.sumConv + partner.sumConv) / (directAll.sumTier + partner.sumTier)) * 100
    : 0;

  return {
    operator,
    totalAccounts: total.accounts,
    totalRows: total.rows,
    directAllAccounts: directAll.accounts,
    directAllNar: directAll.nar,
    directAccounts: directNoEs.accounts,
    directSumConv: directNoEs.sumConv,
    directSumTier: directNoEs.sumTier,
    directNar: directNoEs.nar,
    directEsAccounts: directEs.accounts,
    directEsNar: directEs.nar,
    partnerAccounts: partner.accounts,
    partnerSumConv: partner.sumConv,
    partnerSumTier: partner.sumTier,
    partnerNar: partner.nar,
    buckets: {
      direct_all: directAll,
      direct_no_es: directNoEs,
      direct_es_only: directEs,
      partner_all: partner,
    },
    totalNar,
  };
}

export function computeOperatorsAnalysis(
  filteredRows: NarRow[],
  operators: NarOperatorEntry[],
  filters: NarFilters,
  exclusionSets: ExclusionSets
): NarOperatorsAnalysis {
  if (filteredRows.length === 0) {
    return { byOperator: [], operatorsList: [] };
  }

  // Operatori del periodo: solo quelli che hanno almeno un account in `filteredRows`.
  const periodAccountIds = new Set(filteredRows.map(r => String(r.accountId)));
  const periodOperators = operators.filter(o => periodAccountIds.has(String(o.accountId)));
  const operatorsList = [...new Set(periodOperators.map(o => o.operator).filter(Boolean))].sort();

  const byOperator: NarOperatorBreakdown[] = operatorsList.map(op => {
    const ids = new Set(
      periodOperators.filter(o => o.operator === op).map(o => String(o.accountId))
    );
    return calcOperatorStats(op, ids, filteredRows, filters, exclusionSets);
  });

  // Account presenti nel periodo ma senza operatore mappato → "NA operatore"
  const assignedIds = new Set(periodOperators.map(o => String(o.accountId)));
  const unassignedIds = new Set(
    filteredRows
      .filter(r => !assignedIds.has(String(r.accountId)))
      .map(r => String(r.accountId))
  );
  if (unassignedIds.size > 0) {
    const naStats = calcOperatorStats('NA operatore', unassignedIds, filteredRows, filters, exclusionSets);
    naStats.isNA = true;
    byOperator.push(naStats);
  }

  byOperator.sort((a, b) => {
    if (a.isNA) return 1;
    if (b.isNA) return -1;
    return b.totalNar - a.totalNar;
  });

  const finalList = unassignedIds.size > 0 ? [...operatorsList, 'NA operatore'] : operatorsList;
  return { byOperator, operatorsList: finalList };
}

export interface NarOperatorAccountRow {
  accountId: number;
  accountName: string;
  partnerId: string;
  partnerType: string;
  countryCode: string;
  plan: string;
  tier: number;
  sumConv: number;
  nar: number;
  isDirect: boolean;
  isPartner: boolean;
}

/**
 * Lista account per uno specifico operatore (sezione "drilldown" del vecchio dashboard
 * sotto "Operatore"). NAR per account calcolato sulla base del filtro corrente.
 */
export function computeOperatorAccountsList(
  filteredRows: NarRow[],
  operators: NarOperatorEntry[],
  selectedOperator: string,
  filters: NarFilters
): NarOperatorAccountRow[] {
  if (selectedOperator === 'all') return [];
  const useMonthConv = filters.type === 'month';

  let targetIds: Set<string>;
  if (selectedOperator === 'NA operatore') {
    const assignedIds = new Set(operators.map(o => String(o.accountId)));
    targetIds = new Set(
      filteredRows.filter(r => !assignedIds.has(String(r.accountId))).map(r => String(r.accountId))
    );
  } else {
    const periodIds = new Set(filteredRows.map(r => String(r.accountId)));
    targetIds = new Set(
      operators
        .filter(o => o.operator === selectedOperator && periodIds.has(String(o.accountId)))
        .map(o => String(o.accountId))
    );
  }

  const seen = new Set<number>();
  const accounts: NarOperatorAccountRow[] = [];
  for (const r of filteredRows) {
    if (!targetIds.has(String(r.accountId))) continue;
    if (seen.has(r.accountId)) continue;
    seen.add(r.accountId);

    const accountRows = filteredRows.filter(ar => ar.accountId === r.accountId);
    const rows = filters.excludeWeekZero ? accountRows.filter(ar => ar.weekCount > 0) : accountRows;
    const sumConv = rows.reduce(
      (a, ar) => a + Number(useMonthConv ? ar.monthConversationCount : ar.weekConversationCount),
      0
    );
    const tier = Number(r.conversationTier) || 0;
    const nar = tier > 0 ? (sumConv / tier) * 100 : 0;

    accounts.push({
      accountId: r.accountId,
      accountName: r.accountName,
      partnerId: r.partnerId,
      partnerType: r.partnerType,
      countryCode: r.countryCode,
      plan: r.planSlug,
      tier,
      sumConv,
      nar,
      isDirect: isDirectClient(r),
      isPartner: isPartnerChild(r),
    });
  }
  accounts.sort((a, b) => b.nar - a.nar);
  return accounts;
}

/**
 * Per la sezione "Bucket" del vecchio dashboard: per il bucket selezionato,
 * costruisce l'elenco account + distribuzione operatori.
 */
export interface NarBucketSegmentBreakdown {
  segmentName: string;
  totalAccounts: number;
  naCount: number;
  distribution: Array<{ operator: string; count: number; sumConv: number; sumTier: number; nar: number }>;
  accountsList: Array<{
    accountId: number;
    accountName: string;
    operator: string;
    plan: string;
    tier: number;
    conv: number;
    nar: number;
  }>;
}

export function computeBucketSegmentBreakdown(
  filteredRows: NarRow[],
  bucketKey: NarBucketKey,
  operators: NarOperatorEntry[],
  filters: NarFilters,
  exclusionSets: ExclusionSets
): NarBucketSegmentBreakdown {
  const useMonthConv = filters.type === 'month';
  let rows = filteredRows.filter(BUCKETS[bucketKey].filter);
  if (DIRECT_BUCKET_KEYS.has(bucketKey)) {
    rows = rowsWithoutDirectExclusions(rows, exclusionSets.directExclusionIds);
  }
  const baseFiltered = filters.excludeWeekZero ? rows.filter(r => r.weekCount !== 0) : rows;

  const byAccount = new Map<string, NarRow>();
  for (const r of baseFiltered) {
    const id = String(r.accountId);
    if (!byAccount.has(id)) byAccount.set(id, r);
  }

  const operatorLookup = new Map<string, string>();
  for (const op of operators) operatorLookup.set(String(op.accountId), op.operator);

  const accountsList: NarBucketSegmentBreakdown['accountsList'] = [];
  const opStats = new Map<string, { count: number; sumConv: number; sumTier: number }>();

  for (const [id, row] of byAccount) {
    const operator = operatorLookup.get(id) || 'NA operatore';
    const tier = Number(row.conversationTier || 0);
    const conv = Number(useMonthConv ? row.monthConversationCount : row.weekConversationCount) || 0;
    const stats = opStats.get(operator) || { count: 0, sumConv: 0, sumTier: 0 };
    stats.count++;
    stats.sumConv += conv;
    stats.sumTier += tier;
    opStats.set(operator, stats);

    accountsList.push({
      accountId: row.accountId,
      accountName: row.accountName || '—',
      operator,
      plan: row.planSlug || '—',
      tier,
      conv,
      nar: tier > 0 ? (conv / tier) * 100 : 0,
    });
  }

  accountsList.sort((a, b) => {
    const c = a.operator.localeCompare(b.operator, 'it');
    if (c !== 0) return c;
    return String(a.accountName).localeCompare(String(b.accountName), 'it');
  });

  const distribution = [...opStats.entries()]
    .map(([operator, s]) => ({
      operator,
      count: s.count,
      sumConv: s.sumConv,
      sumTier: s.sumTier,
      nar: s.sumTier > 0 ? (s.sumConv / s.sumTier) * 100 : 0,
    }))
    .sort((a, b) => b.nar - a.nar || a.operator.localeCompare(b.operator, 'it'));

  return {
    segmentName: BUCKETS[bucketKey].name,
    totalAccounts: accountsList.length,
    naCount: accountsList.filter(a => a.operator === 'NA operatore').length,
    distribution,
    accountsList,
  };
}
