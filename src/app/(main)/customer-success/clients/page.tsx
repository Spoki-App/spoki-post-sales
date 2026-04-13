'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { customerSuccessApi } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { Search, ChevronRight } from 'lucide-react';
import { formatMrrDisplay } from '@/lib/format/mrr';

export default function CsClientsPage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Array<{
    id: string;
    hubspotId: string;
    name: string;
    domain: string | null;
    plan: string | null;
    mrr: number | null;
    renewalDate: string | null;
  }>>([]);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await customerSuccessApi.clients(token, { q, page: 1 });
      setClients(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Aziende con <span className="font-medium">company owner</span> HubSpot uguale al tuo utente (stesso mapping degli altri moduli).
      </p>

      <form
        onSubmit={e => {
          e.preventDefault();
          setQ(searchInput);
        }}
        className="flex gap-2 max-w-md"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Cerca nome o dominio..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button type="submit" className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700">
          Cerca
        </button>
      </form>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Azienda</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">MRR</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Piano</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">HubSpot</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400">Caricamento…</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400">Nessun cliente in portfolio.</td></tr>
              ) : (
                clients.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.name}</p>
                      {c.domain && <p className="text-xs text-slate-400">{c.domain}</p>}
                    </td>
                    <td className="px-4 py-3">{formatMrrDisplay(c.mrr)}</td>
                    <td className="px-4 py-3 text-slate-700">{c.plan ?? '—'}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://app-eu1.hubspot.com/contacts/47964451/record/0-2/${c.hubspotId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-600 text-xs hover:underline"
                      >
                        Apri company
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="text-slate-400 hover:text-violet-600">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">{total} clienti</p>}
      </Card>
    </div>
  );
}
