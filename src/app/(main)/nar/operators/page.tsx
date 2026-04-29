'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useNarStore } from '@/lib/store/nar';
import { useNarComputed } from '@/lib/store/nar-selectors';
import { computeOperatorAccountsList } from '@/lib/services/nar-operators';
import { NarOperatorTable } from '@/components/nar/NarOperatorTable';

export default function NarOperatorsPage() {
  const { operatorsAnalysis, filteredRows } = useNarComputed();
  const operators = useNarStore(s => s.operators);
  const filters = useNarStore(s => s.filters);
  const [selected, setSelected] = useState<string>('all');

  const accountsList = useMemo(
    () => computeOperatorAccountsList(filteredRows, operators, selected, filters),
    [filteredRows, operators, selected, filters]
  );

  const operatorOptions = useMemo(
    () => ['all', ...operatorsAnalysis.byOperator.map(o => o.operator)],
    [operatorsAnalysis.byOperator]
  );

  return (
    <div className="space-y-6">
      <Card padding="md">
        <CardHeader>
          <CardTitle>NAR per operatore</CardTitle>
        </CardHeader>
        <NarOperatorTable rows={operatorsAnalysis.byOperator} />
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>Drilldown account per operatore</CardTitle>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          >
            {operatorOptions.map(op => (
              <option key={op} value={op}>{op === 'all' ? 'Tutti gli operatori' : op}</option>
            ))}
          </select>
        </CardHeader>
        {selected === 'all' ? (
          <p className="text-sm text-slate-500">Seleziona un operatore per vedere gli account con NAR ordinati.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Account</th>
                  <th className="px-4 py-2 text-left">Plan</th>
                  <th className="px-4 py-2 text-left">Country</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-right">Tier</th>
                  <th className="px-4 py-2 text-right">Conv</th>
                  <th className="px-4 py-2 text-right">NAR</th>
                </tr>
              </thead>
              <tbody>
                {accountsList.slice(0, 200).map(a => (
                  <tr key={a.accountId} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{a.accountName}</div>
                      <div className="text-xs text-slate-500">ID {a.accountId}</div>
                    </td>
                    <td className="px-4 py-2"><Badge variant="outline">{a.plan}</Badge></td>
                    <td className="px-4 py-2 text-slate-700">{a.countryCode || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {a.isDirect ? 'Diretto' : a.isPartner ? 'Partner' : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.tier.toLocaleString('it-IT')}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Math.round(a.sumConv).toLocaleString('it-IT')}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{a.nar.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {accountsList.length > 200 && (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                Mostrati i primi 200 di {accountsList.length.toLocaleString('it-IT')}.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
