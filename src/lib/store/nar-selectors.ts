'use client';

import { useMemo } from 'react';
import { useNarStore } from './nar';
import {
  applyFilters,
  buildExclusionSets,
  computeBucketAnalysis,
  computeWeeklyTrend,
  computeStats,
} from '@/lib/services/nar-buckets';
import { computeOperatorsAnalysis } from '@/lib/services/nar-operators';
import { computeChurnAnalysis } from '@/lib/services/nar-churn';

/**
 * Hook che applica i filtri correnti al dataset e ricomputa bucket / operatori / churn / trend
 * usando i servizi puri lato client. Esegue tutto in `useMemo` ancorato alle reference dei dati.
 */
export function useNarComputed(bucketKeyOverride?: string) {
  const rows = useNarStore(s => s.rows);
  const operators = useNarStore(s => s.operators);
  const exclusions = useNarStore(s => s.exclusions);
  const filters = useNarStore(s => s.filters);
  const selectedBucket = useNarStore(s => s.selectedBucket);

  return useMemo(() => {
    const exclusionSets = buildExclusionSets(exclusions);
    const filteredRows = applyFilters(rows, filters, exclusionSets);
    const stats = computeStats(filteredRows, exclusionSets);
    const bucketAnalysis = computeBucketAnalysis(filteredRows, filters, exclusionSets);
    const churnAnalysis = computeChurnAnalysis(filteredRows, operators, exclusionSets);
    const operatorsAnalysis = computeOperatorsAnalysis(filteredRows, operators, filters, exclusionSets);
    const bucketKey = (bucketKeyOverride ?? selectedBucket) as 'direct_all' | 'direct_no_es' | 'direct_es_only' | 'partner_all';
    const weeklyTrend = computeWeeklyTrend(filteredRows, bucketKey, exclusionSets);
    return { exclusionSets, filteredRows, stats, bucketAnalysis, churnAnalysis, operatorsAnalysis, weeklyTrend };
  }, [rows, operators, exclusions, filters, selectedBucket, bucketKeyOverride]);
}
