'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { History } from 'lucide-react';
import type { SubscriptionHistoryEntry } from '@/types/dashboard';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface Props {
  accountId: string;
}

export function SubscriptionTimeline({ accountId }: Props) {
  const { token } = useAuthStore();
  const [entries, setEntries] = useState<SubscriptionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !accountId) return;
    setLoading(true);
    dashboardDataApi.subscriptionHistory(token, accountId)
      .then(res => setEntries(res.data?.subscriptions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, accountId]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Storico abbonamenti</CardTitle></CardHeader>
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (entries.length === 0) return null;

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(new Date(d), 'd MMM yyyy', { locale: it }); }
    catch { return d; }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <CardTitle>Storico abbonamenti</CardTitle>
        </div>
      </CardHeader>
      <div className="space-y-0">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
            <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">{entry.planSlug}</p>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>{fmtDate(entry.periodStart)} - {fmtDate(entry.periodEnd)}</span>
                {entry.billing && <span className="text-slate-400">({entry.billing})</span>}
                {entry.conversations > 0 && (
                  <span className="text-slate-400">{entry.conversations.toLocaleString()} conv.</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
