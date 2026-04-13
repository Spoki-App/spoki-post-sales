'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { dashboardDataApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { CreditCard, AlertTriangle } from 'lucide-react';
import type { AccountPayments } from '@/types/dashboard';

interface Props {
  accountId: string;
}

const formatEur = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v);

export function PaymentStatusCard({ accountId }: Props) {
  const { token } = useAuthStore();
  const [data, setData] = useState<AccountPayments | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !accountId) return;
    setLoading(true);
    dashboardDataApi.paymentStatus(token, accountId)
      .then(res => setData(res.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, accountId]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Pagamenti</CardTitle></CardHeader>
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const totalPayments = data.subscriptions.lines.length + data.recharges.lines.length;
  const totalAmount = data.subscriptions.total + data.recharges.total;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-slate-500" />
          <CardTitle>Pagamenti (ultimi 3 mesi)</CardTitle>
        </div>
      </CardHeader>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-xl font-bold text-slate-900">{formatEur(totalAmount)}</p>
          <p className="text-xs text-slate-500">Totale</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-blue-600">{formatEur(data.subscriptions.total)}</p>
          <p className="text-xs text-slate-500">Abbonamenti</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-amber-600">{formatEur(data.recharges.total)}</p>
          <p className="text-xs text-slate-500">Ricariche</p>
        </div>
      </div>
      {totalPayments > 0 && (
        <div className="max-h-40 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="pb-1.5 font-medium">Data</th>
                <th className="pb-1.5 font-medium">Piano</th>
                <th className="pb-1.5 font-medium text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {[...data.subscriptions.lines, ...data.recharges.lines]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 10)
                .map((line, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-1.5 text-slate-600">{line.date}</td>
                    <td className="py-1.5 text-slate-600 truncate max-w-[120px]">{line.plan || '—'}</td>
                    <td className="py-1.5 text-right font-medium text-slate-900">{formatEur(line.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPayments === 0 && (
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="w-4 h-4" />
          <p className="text-sm">Nessun pagamento recente trovato</p>
        </div>
      )}
    </Card>
  );
}
