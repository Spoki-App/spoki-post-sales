'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import type { ParetoTopAccount } from '@/types/dashboard';

let paretoCache: Map<string, ParetoTopAccount> | null = null;
let paretoCacheToken: string | null = null;

export function ParetoTag({ accountId }: { accountId: string }) {
  const { token } = useAuthStore();
  const [account, setAccount] = useState<ParetoTopAccount | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;

    if (paretoCache && paretoCacheToken === token) {
      setAccount(paretoCache.get(accountId) ?? null);
      setLoaded(true);
      return;
    }

    dashboardDataApi.pareto(token)
      .then(res => {
        const top = res.data?.topAccounts ?? [];
        paretoCache = new Map(top.map(a => [String(a.accountId), a]));
        paretoCacheToken = token;
        setAccount(paretoCache.get(accountId) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token, accountId]);

  if (!loaded || !account) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      Top {account.pctOfTotal.toFixed(1)}% revenue
    </span>
  );
}
