'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

export default function ReportsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">Analisi e export del portfolio (in arrivo)</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nessun report configurato</CardTitle>
        </CardHeader>
        <p className="px-6 pb-6 text-sm text-slate-500">
          Usa la dashboard per panoramica su clienti, alert e rinnovi.
        </p>
      </Card>
    </div>
  );
}
