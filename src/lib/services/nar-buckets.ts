/**
 * Bucket logic del modulo NAR — porting 1:1 da `nar-dashboard-share/src/App.jsx` (BUCKETS,
 * isDirectClient, isPartnerChild, calcPivot, calcDedup, bucketAnalysis).
 * Mantiene formula NAR e arrotondamenti del vecchio dashboard per non rompere lo storico.
 */

import type {
  NarRow,
  NarBucketKey,
  NarBucketStats,
  NarBucketResult,
  NarFilters,
  NarExcludedAccount,
} from '@/types/nar';

export const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export const MONTH_PILLS_BASE = [0, 1, 2, 3, 4];
export const WEEK_PILLS_BASE = Array.from({ length: 20 }, (_, i) => i + 1);

export const DIRECT_BUCKET_KEYS = new Set<NarBucketKey>(['direct_all', 'direct_no_es', 'direct_es_only']);

const normPartnerType = (r: NarRow) =>
  (r.partnerType || '').toLowerCase().trim().replace(/\s+/g, '');

export function isDirectClient(r: NarRow): boolean {
  const pt = normPartnerType(r);
  if (pt === 'hubpanel') return false;
  const noPartner = !r.partnerId || r.partnerId.trim() === '';
  const isReferral = pt === 'referral';
  return noPartner || isReferral;
}

export function isPartnerChild(r: NarRow): boolean {
  const hasPartner = Boolean(r.partnerId && r.partnerId.trim() !== '');
  const isReferral = normPartnerType(r) === 'referral';
  return hasPartner && !isReferral;
}

interface BucketDef {
  key: NarBucketKey;
  name: string;
  desc: string;
  filter: (r: NarRow) => boolean;
}

export const BUCKETS: Readonly<Record<NarBucketKey, BucketDef>> = {
  direct_all: {
    key: 'direct_all',
    name: 'Clienti Diretti (tutti)',
    desc: 'partner_id vuoto o referral (escluso hubpanel)',
    filter: (r) => isDirectClient(r),
  },
  direct_no_es: {
    key: 'direct_no_es',
    name: 'Clienti Diretti (no ES)',
    desc: 'come diretti tutti, country != ES',
    filter: (r) => isDirectClient(r) && r.countryCode !== 'ES',
  },
  direct_es_only: {
    key: 'direct_es_only',
    name: 'Clienti Diretti (solo ES)',
    desc: 'come diretti tutti, country = ES',
    filter: (r) => isDirectClient(r) && r.countryCode === 'ES',
  },
  partner_all: {
    key: 'partner_all',
    name: 'Partner Child (tutti)',
    desc: 'partner_id pieno e tipo ≠ referral (include hubpanel con partner)',
    filter: (r) => isPartnerChild(r),
  },
};

/** Aggregato esclusioni: separa withdrawn (validi per qualunque bucket) da direct (solo direct_*). */
export interface ExclusionSets {
  withdrawnIds: Set<string>;
  directExclusionIds: Set<string>;
}

export function buildExclusionSets(exclusions: NarExcludedAccount[]): ExclusionSets {
  const withdrawnIds = new Set<string>();
  const directExclusionIds = new Set<string>();
  for (const e of exclusions) {
    const id = String(e.accountId);
    if (e.reason === 'withdrawn') withdrawnIds.add(id);
    else if (e.reason === 'direct_exclusion') directExclusionIds.add(id);
  }
  return { withdrawnIds, directExclusionIds };
}

export function applyFilters(
  rows: NarRow[],
  filters: NarFilters,
  exclusionSets: ExclusionSets
): NarRow[] {
  let result = rows;
  if (filters.type === 'month' && filters.months.length > 0) {
    const set = new Set(filters.months);
    result = result.filter(r => set.has(r.monthCount));
  }
  if (filters.type === 'week' && filters.weeks.length > 0) {
    const set = new Set(filters.weeks);
    result = result.filter(r => set.has(r.weekCount));
  }
  if (filters.excludeWeekZero) {
    result = result.filter(r => r.weekCount !== 0);
  }
  if (filters.excludeWithdrawn && exclusionSets.withdrawnIds.size > 0) {
    result = result.filter(r => !exclusionSets.withdrawnIds.has(String(r.accountId)));
  }
  return result;
}

/** Rimuove gli account in `directExclusionIds` (applicato solo ai bucket direct_*). */
export function rowsWithoutDirectExclusions(rows: NarRow[], directIds: Set<string>): NarRow[] {
  if (directIds.size === 0) return rows;
  return rows.filter(r => !directIds.has(String(r.accountId)));
}

function ratioString(sumConv: number, sumTier: number): string {
  return sumTier > 0 ? ((sumConv / sumTier) * 100).toFixed(2) : '0.00';
}

/**
 * NAR pivot (somma di tutte le righe). Quando `useMonthConv=true`, dedup per (account, mese)
 * sui consumi mensili per evitare di sommare lo stesso mese più volte (una per settimana).
 */
export function calcPivot(rows: NarRow[], excludeWeekZero = true, useMonthConv = false): NarBucketStats {
  const filtered = excludeWeekZero ? rows.filter(r => r.weekCount !== 0) : rows;

  if (useMonthConv) {
    const accountMonthSeen = new Set<string>();
    let sumConv = 0;
    let sumTier = 0;
    const ids = new Set<number>();

    for (const r of filtered) {
      ids.add(r.accountId);
      const key = `${r.accountId}_${r.monthCount}`;
      if (!accountMonthSeen.has(key)) {
        accountMonthSeen.add(key);
        sumConv += Number(r.monthConversationCount || 0);
        sumTier += Number(r.conversationTier || 0);
      }
    }
    return { accounts: ids.size, rows: filtered.length, sumConv, sumTier, ratio: ratioString(sumConv, sumTier) };
  }

  let sumConv = 0;
  let sumTier = 0;
  const ids = new Set<number>();
  for (const r of filtered) {
    ids.add(r.accountId);
    sumConv += Number(r.weekConversationCount || 0);
    sumTier += Number(r.conversationTier || 0);
  }
  return { accounts: ids.size, rows: filtered.length, sumConv, sumTier, ratio: ratioString(sumConv, sumTier) };
}

/** Variante deduplicata per account (per il riquadro "Pivot vs Dedup" del vecchio dashboard). */
export function calcDedup(rows: NarRow[], excludeWeekZero = true, useMonthConv = false): NarBucketStats {
  const filtered = excludeWeekZero ? rows.filter(r => r.weekCount !== 0) : rows;
  const seen = new Set<number>();
  let sumTier = 0;
  let sumConv = 0;

  if (useMonthConv) {
    const accountMonthSeen = new Set<string>();
    for (const r of filtered) {
      if (!seen.has(r.accountId)) { seen.add(r.accountId); sumTier += Number(r.conversationTier || 0); }
      const key = `${r.accountId}_${r.monthCount}`;
      if (!accountMonthSeen.has(key)) {
        accountMonthSeen.add(key);
        sumConv += Number(r.monthConversationCount || 0);
      }
    }
  } else {
    for (const r of filtered) {
      sumConv += Number(r.weekConversationCount || 0);
      if (!seen.has(r.accountId)) { seen.add(r.accountId); sumTier += Number(r.conversationTier || 0); }
    }
  }
  return { accounts: seen.size, rows: filtered.length, sumConv, sumTier, ratio: ratioString(sumConv, sumTier) };
}

/** Analisi completa dei 4 bucket. `useMonthConv` deriva da `filters.type === 'month'`. */
export function computeBucketAnalysis(
  filteredRows: NarRow[],
  filters: NarFilters,
  exclusionSets: ExclusionSets
): NarBucketResult[] {
  const useMonthConv = filters.type === 'month';
  return Object.values(BUCKETS).map(({ key, name, desc, filter }) => {
    let rows = filteredRows.filter(filter);
    if (DIRECT_BUCKET_KEYS.has(key)) {
      rows = rowsWithoutDirectExclusions(rows, exclusionSets.directExclusionIds);
    }
    return {
      key,
      name,
      desc,
      pivot: calcPivot(rows, filters.excludeWeekZero, useMonthConv),
      dedup: calcDedup(rows, filters.excludeWeekZero, useMonthConv),
    };
  });
}

/** Trend NAR per settimana per il bucket selezionato. */
export interface NarWeeklyTrendPoint {
  week: number;
  accounts: number;
  rows: number;
  sumConv: number;
  sumTier: number;
  ratio: string;
}

export function computeWeeklyTrend(
  filteredRows: NarRow[],
  bucketKey: NarBucketKey,
  exclusionSets: ExclusionSets
): NarWeeklyTrendPoint[] {
  let rows = filteredRows.filter(BUCKETS[bucketKey].filter);
  if (DIRECT_BUCKET_KEYS.has(bucketKey)) {
    rows = rowsWithoutDirectExclusions(rows, exclusionSets.directExclusionIds);
  }
  const weeks = [...new Set(rows.map(r => r.weekCount))].filter(w => w >= 1).sort((a, b) => a - b);
  return weeks.map(week => {
    const weekRows = rows.filter(r => r.weekCount === week);
    const p = calcPivot(weekRows, false, false);
    return { week, ...p };
  });
}

export interface NarStats {
  totalRows: number;
  totalAccounts: number;
  directAccounts: number;
  directRows: number;
  partnerAccounts: number;
  partnerRows: number;
  esAccounts: number;
  esRows: number;
  noEsAccounts: number;
  noEsRows: number;
}

export function computeStats(filteredRows: NarRow[], exclusionSets: ExclusionSets): NarStats {
  const rwd = (rs: NarRow[]) => rowsWithoutDirectExclusions(rs, exclusionSets.directExclusionIds);
  const directRows = rwd(filteredRows.filter(r => isDirectClient(r)));
  const partnerRows = filteredRows.filter(r => isPartnerChild(r));
  const esRows = rwd(filteredRows.filter(r => isDirectClient(r) && r.countryCode === 'ES'));
  const noEsRows = rwd(filteredRows.filter(r => isDirectClient(r) && r.countryCode !== 'ES'));
  return {
    totalRows: filteredRows.length,
    totalAccounts: new Set(filteredRows.map(r => r.accountId)).size,
    directAccounts: new Set(directRows.map(r => r.accountId)).size,
    directRows: directRows.length,
    partnerAccounts: new Set(partnerRows.map(r => r.accountId)).size,
    partnerRows: partnerRows.length,
    esAccounts: new Set(esRows.map(r => r.accountId)).size,
    esRows: esRows.length,
    noEsAccounts: new Set(noEsRows.map(r => r.accountId)).size,
    noEsRows: noEsRows.length,
  };
}

export function availableMonths(rows: NarRow[]): number[] {
  const fromData = [...new Set(rows.map(r => r.monthCount))].filter(n => Number.isFinite(n));
  return [...new Set([...MONTH_PILLS_BASE, ...fromData])].sort((a, b) => a - b);
}

export function availableWeeks(rows: NarRow[]): number[] {
  const fromData = [...new Set(rows.map(r => r.weekCount))].filter(n => Number.isFinite(n));
  return [...new Set([...WEEK_PILLS_BASE, ...fromData])].filter(w => w > 0).sort((a, b) => a - b);
}
