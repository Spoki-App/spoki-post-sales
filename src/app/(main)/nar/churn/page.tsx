'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useNarComputed } from '@/lib/store/nar-selectors';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

const SEGMENT_LABELS: Record<string, string> = {
  all: 'Totale',
  directAll: 'Diretti tutti',
  directNoEs: 'Diretti no ES',
  directEs: 'Diretti ES',
  partner: 'Partner',
};

export default function NarChurnPage() {
  const { churnAnalysis } = useNarComputed();
  const { churnBySegment, breakpointSummary, decayRates, atRisk, monthlyChurnPieData, breakpointByPlan } = churnAnalysis;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {(['all', 'directAll', 'directNoEs', 'directEs', 'partner'] as const).map(key => {
          const seg = churnBySegment[key];
          return (
            <Card key={key} padding="md">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{SEGMENT_LABELS[key]}</div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{seg.total.toLocaleString('it-IT')}</div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-emerald-700">Attivi {seg.activePercent.toFixed(0)}%</span>
                <span className="text-red-700">Churn {seg.churnPercent.toFixed(0)}%</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card padding="md">
        <CardHeader><CardTitle>Breakpoint analysis</CardTitle></CardHeader>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <BreakpointTile label="Mai usato" count={breakpointSummary.neverUsed} pct={breakpointSummary.neverUsedPercent} accent="text-slate-700" />
          <BreakpointTile label="Stop M1" count={breakpointSummary.stoppedMonth1} pct={breakpointSummary.stoppedMonth1Percent} accent="text-red-700" />
          <BreakpointTile label="Stop M2" count={breakpointSummary.stoppedMonth2} pct={breakpointSummary.stoppedMonth2Percent} accent="text-amber-700" />
          <BreakpointTile label="Stop M3" count={breakpointSummary.stoppedMonth3} pct={breakpointSummary.stoppedMonth3Percent} accent="text-amber-600" />
          <BreakpointTile label="Stop M4+" count={breakpointSummary.stoppedMonth4Plus} pct={breakpointSummary.stoppedMonth4PlusPercent} accent="text-slate-600" />
          <BreakpointTile label="Ancora attivi" count={breakpointSummary.stillActive} pct={breakpointSummary.stillActivePercent} accent="text-emerald-700" />
        </div>
      </Card>

      <Card padding="md">
        <CardHeader><CardTitle>Account a rischio (ultimo mese)</CardTitle></CardHeader>
        <p className="mb-3 text-xs text-slate-500">{atRisk.length.toLocaleString('it-IT')} account con NAR &lt; 10% nell&apos;ultimo mese.</p>
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
              {atRisk.slice(0, 100).map(a => (
                <tr key={a.accountId} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{a.accountName}</div>
                    <div className="text-xs text-slate-500">ID {a.accountId}</div>
                  </td>
                  <td className="px-4 py-2"><Badge variant="outline">{a.plan}</Badge></td>
                  <td className="px-4 py-2 text-slate-700">{a.operator}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.tier.toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Math.round(a.sumConv).toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-700 tabular-nums">{a.nar.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <CardHeader><CardTitle>Decay velocity per plan</CardTitle></CardHeader>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={decayRates.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="plan" tick={{ fontSize: 11 }} width={80} />
              <Tooltip />
              <Bar dataKey="decaySpeed" fill="#ef4444" radius={[0, 6, 6, 0]} name="Decay %" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card padding="md">
          <CardHeader><CardTitle>Monthly churn (mese 1-4)</CardTitle></CardHeader>
          <div className="grid grid-cols-2 gap-3">
            {monthlyChurnPieData.map(m => (
              <div key={m.month} className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-medium text-slate-500">{m.monthLabel}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{m.usingPercent.toFixed(0)}% attivi</div>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={m.data} dataKey="value" innerRadius={28} outerRadius={48}>
                      {m.data.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card padding="md">
        <CardHeader><CardTitle>Early churn per plan</CardTitle></CardHeader>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-right">Account</th>
                <th className="px-4 py-2 text-right">Mai usato</th>
                <th className="px-4 py-2 text-right">Stop M1</th>
                <th className="px-4 py-2 text-right">Stop M2</th>
                <th className="px-4 py-2 text-right">Stop M3</th>
                <th className="px-4 py-2 text-right">Early churn</th>
              </tr>
            </thead>
            <tbody>
              {breakpointByPlan.map(p => (
                <tr key={p.plan} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{p.plan}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.total}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.neverUsedPercent.toFixed(0)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.stoppedM1Percent.toFixed(0)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.stoppedM2Percent.toFixed(0)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.stoppedM3Percent.toFixed(0)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-700">{p.earlyChurnPercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BreakpointTile({ label, count, pct, accent }: { label: string; count: number; pct: number; accent: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accent}`}>{count.toLocaleString('it-IT')}</div>
      <div className="text-xs text-slate-500">{pct.toFixed(1)}%</div>
    </div>
  );
}
