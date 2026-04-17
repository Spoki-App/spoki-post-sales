'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useAuthStore } from '@/lib/store/auth';
import { meApi, type MySentEmailRow } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

const HUBSPOT_PORTAL = '47964451';

function hubspotEmailUrl(row: MySentEmailRow): string | null {
  if (!row.clientHubspotId) return null;
  return `https://app-eu1.hubspot.com/contacts/${HUBSPOT_PORTAL}/record/0-2/${row.clientHubspotId}/view/1?engagement=${row.hubspotId}`;
}

export function MySentEmailsSummary() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [ownerMapped, setOwnerMapped] = useState(false);
  const [ownerName, setOwnerName] = useState<string | undefined>();
  const [emails, setEmails] = useState<MySentEmailRow[]>([]);
  const [stats, setStats] = useState<{ total: number; last30Days: number; windowDays: number } | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError(false);
      try {
        const res = await meApi.sentEmails(token);
        const d = res.data;
        if (cancelled || !d) return;
        setOwnerMapped(d.ownerMapped);
        setOwnerName(d.ownerName);
        setEmails(d.emails ?? []);
        setStats(d.stats ?? null);
      } catch {
        if (!cancelled) {
          setEmails([]);
          setStats(null);
          setOwnerMapped(false);
          setFetchError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) return null;

  return (
    <Card className="mb-6 border border-slate-200 shadow-sm">
      <CardHeader className="pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-sky-50 text-sky-700">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Le tue email da HubSpot</CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Email di tipo invio loggate su HubSpot, sincronizzate in app (owner o mittente = te).
            </p>
          </div>
        </div>
      </CardHeader>

      <div className="px-5 py-4">
        {loading && (
          <div className="h-16 flex items-center justify-center text-sm text-slate-400">Caricamento…</div>
        )}

        {!loading && fetchError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            Non è stato possibile caricare le email. Controlla la connessione e riprova più tardi.
          </p>
        )}

        {!loading && !fetchError && !ownerMapped && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            L&apos;email con cui hai effettuato l&apos;accesso non è mappata a un owner HubSpot in questa app. Chiedi al team di
            aggiungerla in <code className="text-xs bg-amber-100 px-1 rounded">owners.ts</code> per vedere le tue email.
          </p>
        )}

        {!loading && !fetchError && ownerMapped && stats && (
          <>
            <p className="text-sm text-slate-700 mb-3">
              Ciao{ownerName ? `, ${ownerName.split(' ')[0]}` : ''}: negli ultimi 30 giorni risultano{' '}
              <span className="font-semibold text-slate-900">{stats.last30Days}</span> email associate a te in HubSpot (dati sincronizzati).
              {stats.total > 0 ? (
                <>
                  {' '}
                  Sotto trovi le <span className="font-semibold text-slate-900">{stats.total}</span> più recenti degli ultimi{' '}
                  {stats.windowDays} giorni.
                </>
              ) : (
                <> Negli ultimi {stats.windowDays} giorni non risultano email sincronizzate con te come owner o mittente.</>
              )}
            </p>

            {emails.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nessuna email trovata. Esegui la sincronizzazione HubSpot dall&apos;app e verifica che le email abbiano te come owner o come
                mittente (<code className="text-xs">hs_email_from</code>) in HubSpot.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
                {emails.map(e => {
                  const hsUrl = hubspotEmailUrl(e);
                  return (
                    <li key={`${e.hubspotId}-${e.occurredAt}`} className="py-2.5 first:pt-0 flex gap-3 text-sm">
                      <div className="w-24 shrink-0 text-xs text-slate-400 tabular-nums">
                        {format(new Date(e.occurredAt), 'd MMM yyyy', { locale: it })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 line-clamp-2">{e.subject}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <Link href={`/clients/${e.clientId}`} className="text-emerald-700 hover:underline">
                            {e.clientName}
                          </Link>
                          {e.toEmail ? (
                            <>
                              {' '}
                              → <span className="truncate">{e.toEmail}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      {hsUrl && (
                        <a
                          href={hsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-slate-400 hover:text-sky-600 p-1"
                          title="Apri in HubSpot"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
