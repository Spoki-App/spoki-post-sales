'use client';

import { create } from 'zustand';
import type {
  NarRow,
  NarUpload,
  NarFilters,
  NarFilterType,
  NarBucketKey,
  NarOperatorEntry,
  NarExcludedAccount,
} from '@/types/nar';

interface NarState {
  // dataset
  upload: NarUpload | null;
  rows: NarRow[];
  // sorgenti laterali
  operators: NarOperatorEntry[];
  exclusions: NarExcludedAccount[];
  // filtri condivisi
  filters: NarFilters;
  selectedBucket: NarBucketKey;
  // status
  loading: boolean;
  error: string | null;
  // azioni
  setDataset: (upload: NarUpload | null, rows: NarRow[]) => void;
  setOperators: (operators: NarOperatorEntry[]) => void;
  setExclusions: (exclusions: NarExcludedAccount[]) => void;
  setFilterType: (type: NarFilterType) => void;
  toggleMonth: (m: number) => void;
  toggleWeek: (w: number) => void;
  setExcludeWeekZero: (v: boolean) => void;
  setExcludeWithdrawn: (v: boolean) => void;
  setSelectedBucket: (key: NarBucketKey) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const DEFAULT_FILTERS: NarFilters = {
  type: 'none',
  months: [],
  weeks: [],
  excludeWeekZero: true,
  excludeWithdrawn: true,
};

export const useNarStore = create<NarState>((set) => ({
  upload: null,
  rows: [],
  operators: [],
  exclusions: [],
  filters: DEFAULT_FILTERS,
  selectedBucket: 'direct_no_es',
  loading: true,
  error: null,
  setDataset: (upload, rows) => set({ upload, rows }),
  setOperators: (operators) => set({ operators }),
  setExclusions: (exclusions) => set({ exclusions }),
  setFilterType: (type) => set(state => ({ filters: { ...state.filters, type } })),
  toggleMonth: (m) => set(state => {
    const exists = state.filters.months.includes(m);
    return {
      filters: {
        ...state.filters,
        months: exists ? state.filters.months.filter(x => x !== m) : [...state.filters.months, m].sort((a, b) => a - b),
      },
    };
  }),
  toggleWeek: (w) => set(state => {
    const exists = state.filters.weeks.includes(w);
    return {
      filters: {
        ...state.filters,
        weeks: exists ? state.filters.weeks.filter(x => x !== w) : [...state.filters.weeks, w].sort((a, b) => a - b),
      },
    };
  }),
  setExcludeWeekZero: (v) => set(state => ({ filters: { ...state.filters, excludeWeekZero: v } })),
  setExcludeWithdrawn: (v) => set(state => ({ filters: { ...state.filters, excludeWithdrawn: v } })),
  setSelectedBucket: (key) => set({ selectedBucket: key }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set({
    upload: null, rows: [], operators: [], exclusions: [],
    filters: DEFAULT_FILTERS, selectedBucket: 'direct_no_es',
    loading: false, error: null,
  }),
}));
