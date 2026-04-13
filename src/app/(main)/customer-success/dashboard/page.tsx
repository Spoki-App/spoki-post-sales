'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { customerSuccessApi } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { ExternalLink, BarChart3 } from 'lucide-react';

export default function CsDashboardPage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [dashboards, setDashboards] = useState<Array<{ title: string; embedUrl: string; openUrl?: string }>>([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await customerSuccessApi.dashboards(token);
        if (res.data) {
          setOwnerName(res.data.owner.name);
          setDashboards(res.data.dashboards);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore caricamento');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-600 text-sm">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Dashboard HubSpot personalizzate per <span className="font-medium text-slate-900">{ownerName}</span>.
        Gli embed vanno configurati in <code className="text-xs bg-slate-100 px-1 rounded">src/lib/config/cs-hubspot-dashboards.ts</code> (URL “Incorpora” da HubSpot Reporting).
      </p>

      {dashboards.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          <BarChart3 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p>Nessuna dashboard configurata per il tuo utente.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {dashboards.map((d, i) => (
            <Card key={i} className="overflow-hidden p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <span className="font-medium text-slate-900">{d.title}</span>
                {d.openUrl && (
                  <a
                    href={d.openUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-800"
                  >
                    Apri in HubSpot <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              {d.embedUrl ? (
                <div className="aspect-[16/10] w-full min-h-[420px] bg-slate-100">
                  <iframe
                    title={d.title}
                    src={d.embedUrl}
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  />
                </div>
              ) : (
                <div className="p-6 text-sm text-slate-500">
                  Nessun URL embed impostato. Usa il link “Apri in HubSpot” oppure incolla l’URL di incorporamento nel config.
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
