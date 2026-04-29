'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { useNarComputed } from '@/lib/store/nar-selectors';
import { useNarStore } from '@/lib/store/nar';
import { COLORS } from '@/lib/services/nar-buckets';
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card padding="md">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accent ?? 'text-slate-900'}`}>{value}</div>
    </Card>
  );
}

export default function NarOverviewPage() {
  const { stats, bucketAnalysis, filteredRows } = useNarComputed();
  const rows = useNarStore(s => s.rows);

  const directNoEs = bucketAnalysis.find(b => b.key === 'direct_no_es');
  const directAll = bucketAnalysis.find(b => b.key === 'direct_all');
  const partnerAll = bucketAnalysis.find(b => b.key === 'partner_all');
  const directEs = bucketAnalysis.find(b => b.key === 'direct_es_only');

  const countryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      const k = r.countryCode || 'N/A';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredRows]);

  const planData = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of filteredRows) {
      if (!seen.has(r.accountId)) seen.set(r.accountId, r.planSlug || 'N/A');
    }
    const map = new Map<string, number>();
    for (const plan of seen.values()) {
      map.set(plan, (map.get(plan) || 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredRows]);

  const tierData = useMemo(() => {
    const seen = new Map<number, number>();
    for (const r of filteredRows) {
      if (!seen.has(r.accountId)) seen.set(r.accountId, Number(r.conversationTier) || 0);
    }
    const map = new Map<string, number>();
    for (const tier of seen.values()) {
      const k = tier.toLocaleString('it-IT');
      map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => Number(b.name.replace(/\D/g, '')) - Number(a.name.replace(/\D/g, '')));
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Account totali" value={stats.totalAccounts.toLocaleString('it-IT')} />
        <KpiTile label="Righe periodo" value={stats.totalRows.toLocaleString('it-IT')} />
        <KpiTile label="Diretti (no ES)" value={stats.noEsAccounts.toLocaleString('it-IT')} />
        <KpiTile label="Partner Child" value={stats.partnerAccounts.toLocaleString('it-IT')} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="NAR Diretti tutti" value={`${directAll?.pivot.ratio ?? '0'}%`} accent="text-emerald-700" />
        <KpiTile label="NAR Diretti no ES" value={`${directNoEs?.pivot.ratio ?? '0'}%`} accent="text-emerald-700" />
        <KpiTile label="NAR Diretti ES" value={`${directEs?.pivot.ratio ?? '0'}%`} accent="text-emerald-700" />
        <KpiTile label="NAR Partner" value={`${partnerAll?.pivot.ratio ?? '0'}%`} accent="text-emerald-700" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card padding="md">
          <CardHeader><CardTitle>Distribuzione Country (righe)</CardTitle></CardHeader>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={countryData} dataKey="value" nameKey="name" outerRadius={90} label>
                {countryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card padding="md">
          <CardHeader><CardTitle>Account per Plan</CardTitle></CardHeader>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={planData} dataKey="value" nameKey="name" outerRadius={90} label>
                {planData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card padding="md">
          <CardHeader><CardTitle>Account per Tier</CardTitle></CardHeader>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tierData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card padding="md">
        <CardHeader><CardTitle>Dataset corrente</CardTitle></CardHeader>
        <p className="text-sm text-slate-600">
          {rows.length.toLocaleString('it-IT')} righe totali nel dataset.{' '}
          {filteredRows.length !== rows.length && (
            <>Filtrate al periodo selezionato: {filteredRows.length.toLocaleString('it-IT')}.</>
          )}
        </p>
      </Card>
    </div>
  );
}
