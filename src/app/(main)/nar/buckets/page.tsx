'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useNarStore } from '@/lib/store/nar';
import { useAuthStore } from '@/lib/store/auth';
import { useNarComputed } from '@/lib/store/nar-selectors';
import { computeBucketSegmentBreakdown } from '@/lib/services/nar-operators';
import { NarBucketTable } from '@/components/nar/NarBucketTable';
import { narApi } from '@/lib/api/client';
import type { NarBucketKey } from '@/types/nar';

const WEBHOOK_KEY = 'nar_webhook_url';

export default function NarBucketsPage() {
  const { bucketAnalysis, filteredRows, exclusionSets } = useNarComputed();
  const operators = useNarStore(s => s.operators);
  const filters = useNarStore(s => s.filters);
  const selectedBucket = useNarStore(s => s.selectedBucket);
  const setSelectedBucket = useNarStore(s => s.setSelectedBucket);
  const token = useAuthStore(s => s.token);

  const [webhookUrl, setWebhookUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(WEBHOOK_KEY) ?? '';
  });
  const [sendStatus, setSendStatus] = useState<{ ok?: boolean; message?: string }>({});

  const breakdown = useMemo(
    () => computeBucketSegmentBreakdown(filteredRows, selectedBucket, operators, filters, exclusionSets),
    [filteredRows, selectedBucket, operators, filters, exclusionSets]
  );

  const persistWebhook = (url: string) => {
    setWebhookUrl(url);
    if (typeof window !== 'undefined') window.localStorage.setItem(WEBHOOK_KEY, url);
  };

  const sendToN8n = async () => {
    if (!token) return;
    if (!webhookUrl.trim()) {
      setSendStatus({ ok: false, message: 'Configura prima il webhook URL.' });
      return;
    }
    setSendStatus({ message: 'Invio in corso…' });
    try {
      const res = await narApi.n8nForward(token, {
        webhookUrl,
        payload: {
          bucket: selectedBucket,
          accounts: breakdown.accountsList,
          distribution: breakdown.distribution,
          generatedAt: new Date().toISOString(),
        },
      });
      if (res.success) setSendStatus({ ok: true, message: `Inviati ${breakdown.accountsList.length} account a n8n.` });
      else setSendStatus({ ok: false, message: res.error || 'Errore invio.' });
    } catch (err) {
      setSendStatus({ ok: false, message: err instanceof Error ? err.message : 'Errore invio.' });
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="md">
        <CardHeader>
          <CardTitle>Bucket NAR (clicca una riga per esplorare)</CardTitle>
        </CardHeader>
        <NarBucketTable buckets={bucketAnalysis} selected={selectedBucket} onSelect={(k: NarBucketKey) => setSelectedBucket(k)} />
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>Distribuzione operatori — {breakdown.segmentName}</CardTitle>
          <span className="text-xs text-slate-500">
            {breakdown.totalAccounts.toLocaleString('it-IT')} account · {breakdown.naCount} senza operatore
          </span>
        </CardHeader>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Operatore</th>
                <th className="px-4 py-2 text-right">Account</th>
                <th className="px-4 py-2 text-right">Σ Conv</th>
                <th className="px-4 py-2 text-right">Σ Tier</th>
                <th className="px-4 py-2 text-right">NAR</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.distribution.map(d => (
                <tr key={d.operator} className="border-t border-slate-100">
                  <td className="px-4 py-2">{d.operator}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{d.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Math.round(d.sumConv).toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Math.round(d.sumTier).toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700">{d.nar.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>Account in bucket — {breakdown.segmentName}</CardTitle>
          <span className="text-xs text-slate-500">{breakdown.accountsList.length.toLocaleString('it-IT')} account</span>
        </CardHeader>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-left">Operatore</th>
                <th className="px-4 py-2 text-right">Tier</th>
                <th className="px-4 py-2 text-right">Conv</th>
                <th className="px-4 py-2 text-right">NAR</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.accountsList.slice(0, 200).map(a => (
                <tr key={a.accountId} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{a.accountName}</div>
                    <div className="text-xs text-slate-500">ID {a.accountId}</div>
                  </td>
                  <td className="px-4 py-2"><Badge variant="outline">{a.plan}</Badge></td>
                  <td className="px-4 py-2 text-slate-700">{a.operator}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.tier.toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Math.round(a.conv).toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{a.nar.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {breakdown.accountsList.length > 200 && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
              Mostrati i primi 200 di {breakdown.accountsList.length.toLocaleString('it-IT')}.
            </div>
          )}
        </div>
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>Invia bucket a n8n</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <input
            type="url"
            value={webhookUrl}
            onChange={e => persistWebhook(e.target.value)}
            placeholder="https://n8n.spoki.com/webhook/..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={sendToN8n}
              disabled={!token}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Invia {breakdown.accountsList.length} account
            </button>
            {sendStatus.message && (
              <span className={sendStatus.ok ? 'text-sm text-emerald-700' : 'text-sm text-amber-700'}>
                {sendStatus.message}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            L&apos;host del webhook deve essere in <code>NAR_N8N_WEBHOOK_ALLOWLIST</code>.
          </p>
        </div>
      </Card>
    </div>
  );
}
