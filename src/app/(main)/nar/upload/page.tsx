'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/lib/store/auth';
import { useNarStore } from '@/lib/store/nar';
import { narApi } from '@/lib/api/client';
import { parseNarCsv, parseOperatorsCsv } from '@/lib/services/nar-csv';
import type { NarExcludedAccount, NarExclusionReason, NarUpload } from '@/types/nar';

interface RefreshSummary {
  uploadId: string | null;
  rowCount: number;
  accountCount: number;
  weeksCovered: number;
  windowDays: number;
  enrichedAccountCount: number;
  unmatchedAccountCount: number;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
}

function sourceLabel(upload: NarUpload | null): string {
  if (!upload) return 'nessuno';
  if (upload.source === 'metabase') return 'Metabase + HubSpot (auto)';
  if (upload.source === 'csv') return 'CSV manuale';
  return upload.source;
}

export default function NarUploadPage() {
  const token = useAuthStore(s => s.token);
  const router = useRouter();
  const { upload, rows, exclusions, setExclusions, setDataset } = useNarStore();

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string>('');
  const [refreshSummary, setRefreshSummary] = useState<RefreshSummary | null>(null);

  const [datasetStatus, setDatasetStatus] = useState<string>('');
  const [operatorsStatus, setOperatorsStatus] = useState<string>('');
  const [exclStatus, setExclStatus] = useState<string>('');
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [operatorsBusy, setOperatorsBusy] = useState(false);

  const [exclAccountId, setExclAccountId] = useState('');
  const [exclName, setExclName] = useState('');
  const [exclReason, setExclReason] = useState<NarExclusionReason>('withdrawn');

  const refreshExclusions = async () => {
    if (!token) return;
    const res = await narApi.listExclusions(token);
    setExclusions(res.data ?? []);
  };

  useEffect(() => { refreshExclusions(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const handleMetabaseRefresh = async () => {
    if (!token) return;
    setRefreshBusy(true);
    setRefreshStatus('Interrogazione Metabase in corso (puo\' richiedere fino a 60s)...');
    setRefreshSummary(null);
    try {
      const res = await narApi.refreshFromMetabase(token);
      if (!res.success) {
        setRefreshStatus(res.error || 'Errore refresh');
        return;
      }
      const data = res.data;
      if (data) {
        setRefreshSummary({
          uploadId: data.uploadId,
          rowCount: data.rowCount,
          accountCount: data.accountCount,
          weeksCovered: data.weeksCovered,
          windowDays: data.windowDays,
          enrichedAccountCount: data.enrichedAccountCount,
          unmatchedAccountCount: data.unmatchedAccountCount,
        });
      }
      if (res.warning) {
        setRefreshStatus(res.warning);
      } else {
        setRefreshStatus('Dataset NAR aggiornato. Ricarico le pagine...');
      }
      // Ricarico il dataset corrente cosi' il layout aggiorna upload+rows.
      const current = await narApi.getCurrentDataset(token);
      setDataset(current.data?.upload ?? null, current.data?.rows ?? []);
      if (data && data.rowCount > 0) {
        setTimeout(() => router.push('/nar/overview'), 800);
      }
    } catch (err) {
      setRefreshStatus(err instanceof Error ? err.message : 'Errore refresh');
    } finally {
      setRefreshBusy(false);
    }
  };

  const handleDataset = async (file: File) => {
    if (!token) return;
    setDatasetBusy(true);
    setDatasetStatus(`Lettura "${file.name}"...`);
    try {
      const text = await file.text();
      const parsed = parseNarCsv(text);
      if (parsed.length === 0) {
        setDatasetStatus('CSV vuoto o formato non riconosciuto.');
        setDatasetBusy(false);
        return;
      }
      setDatasetStatus(`Invio ${parsed.length.toLocaleString('it-IT')} righe...`);
      const res = await narApi.uploadDataset(token, { rows: parsed, fileName: file.name });
      if (res.success) {
        setDatasetStatus(`Caricato. Reindirizzamento...`);
        setTimeout(() => router.push('/nar/overview'), 600);
      } else {
        setDatasetStatus(res.error || 'Errore upload dataset');
      }
    } catch (err) {
      setDatasetStatus(err instanceof Error ? err.message : 'Errore upload dataset');
    } finally {
      setDatasetBusy(false);
    }
  };

  const handleOperators = async (file: File) => {
    if (!token) return;
    setOperatorsBusy(true);
    setOperatorsStatus(`Lettura "${file.name}"...`);
    try {
      const text = await file.text();
      const parsed = parseOperatorsCsv(text);
      if (parsed.length === 0) {
        setOperatorsStatus('CSV operatori vuoto o formato non riconosciuto.');
        setOperatorsBusy(false);
        return;
      }
      const opRows = parsed.map(r => ({
        accountId: r.accountId,
        operatorName: r.operator,
        accountName: r.accountName,
        partnerType: r.partnerType,
        plan: r.plan,
        status: r.status,
      }));
      const res = await narApi.uploadOperators(token, { rows: opRows });
      if (res.success) {
        setOperatorsStatus(`Caricati ${res.data?.written ?? opRows.length} operatori.`);
      } else {
        setOperatorsStatus(res.error || 'Errore upload operatori');
      }
    } catch (err) {
      setOperatorsStatus(err instanceof Error ? err.message : 'Errore upload operatori');
    } finally {
      setOperatorsBusy(false);
    }
  };

  const addExclusion = async () => {
    if (!token) return;
    const id = Number(exclAccountId);
    if (!id) {
      setExclStatus('Inserisci un account_id valido.');
      return;
    }
    try {
      await narApi.addExclusion(token, { accountId: id, reason: exclReason, accountName: exclName || null });
      setExclAccountId('');
      setExclName('');
      setExclStatus('Esclusione aggiunta.');
      await refreshExclusions();
    } catch (err) {
      setExclStatus(err instanceof Error ? err.message : 'Errore aggiunta esclusione');
    }
  };

  const removeExclusion = async (e: NarExcludedAccount) => {
    if (!token) return;
    await narApi.removeExclusion(token, e.accountId, e.reason);
    await refreshExclusions();
  };

  const lastSourceVariant: 'success' | 'outline' | 'default' =
    upload?.source === 'metabase' ? 'success' : upload?.source === 'csv' ? 'outline' : 'default';

  return (
    <div className="space-y-6">
      <Card padding="md">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>1. Aggiornamento automatico (Metabase + HubSpot)</CardTitle>
            <Badge variant={lastSourceVariant} size="sm">Fonte ultimo dataset: {sourceLabel(upload)}</Badge>
          </div>
        </CardHeader>
        <p className="mb-3 text-sm text-slate-600">
          Genera il dataset NAR direttamente dai dati Spoki (consumo + tier) ed enriched con
          HubSpot (partner, country, owner). Sostituisce il dataset corrente con lo snapshot
          piu&apos; recente. Eseguito anche automaticamente ogni lunedi alle 06:00 UTC.
        </p>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ultimo dataset</div>
            <div className="mt-1 text-slate-800">{formatDateTime(upload?.uploadedAt)}</div>
            <div className="text-xs text-slate-500">
              {upload ? `${rows.length.toLocaleString('it-IT')} righe` : 'Nessuno'}
              {upload?.uploadedByEmail && ` · da ${upload.uploadedByEmail}`}
            </div>
          </div>
          <div className="flex items-start justify-end">
            <button
              type="button"
              onClick={handleMetabaseRefresh}
              disabled={refreshBusy}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshBusy ? 'Aggiornamento in corso...' : 'Aggiorna ora da Metabase'}
            </button>
          </div>
        </div>
        {refreshStatus && <p className="mt-3 text-sm text-slate-700">{refreshStatus}</p>}
        {refreshSummary && (
          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
            <div><span className="font-semibold text-slate-800">{refreshSummary.rowCount.toLocaleString('it-IT')}</span> righe</div>
            <div><span className="font-semibold text-slate-800">{refreshSummary.accountCount.toLocaleString('it-IT')}</span> account</div>
            <div><span className="font-semibold text-slate-800">{refreshSummary.weeksCovered}</span> settimane (window {refreshSummary.windowDays}gg)</div>
            <div><span className="font-semibold text-slate-800">{refreshSummary.enrichedAccountCount}</span> account con match HubSpot</div>
            <div><span className="font-semibold text-slate-800">{refreshSummary.unmatchedAccountCount}</span> account senza match</div>
          </div>
        )}
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>2. Carica CSV NAR (fallback)</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-slate-600">
          Usa questa opzione solo se Metabase non e&apos; disponibile o serve importare uno snapshot
          storico. Header attesi: account_id, account_name, plan_slug, partner_id, partner_type,
          country_code, week_count, month_count, conversation_tier, week_conversation_count,
          month_conversation_count. Il caricamento sostituisce il dataset corrente.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={datasetBusy}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleDataset(f); }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
        />
        {datasetStatus && <p className="mt-2 text-sm text-slate-600">{datasetStatus}</p>}
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>3. Carica CSV operatori (opzionale)</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-slate-600">
          Override del mapping account → operatore quando HubSpot non ha la proprieta&apos; <code>spoki_company_id_unique</code>
          o serve forzare un assegnamento. Header attesi: <code>Spoki Company ID Unique</code>, <code>Company name</code>,
          <code>Company owner</code>, <code>Partner type</code>, <code>Plan activated</code>, <code>Contract Status</code>.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={operatorsBusy}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleOperators(f); }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
        />
        {operatorsStatus && <p className="mt-2 text-sm text-slate-600">{operatorsStatus}</p>}
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>4. Esclusioni</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[1fr,2fr,1fr,auto]">
            <input
              type="text"
              value={exclAccountId}
              onChange={e => setExclAccountId(e.target.value.replace(/\D/g, ''))}
              placeholder="account_id"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
            <input
              type="text"
              value={exclName}
              onChange={e => setExclName(e.target.value)}
              placeholder="nome account (opzionale)"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
            <select
              value={exclReason}
              onChange={e => setExclReason(e.target.value as NarExclusionReason)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="withdrawn">Withdrawn</option>
              <option value="direct_exclusion">Esclusione bucket diretti</option>
            </select>
            <button
              type="button"
              onClick={addExclusion}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Aggiungi
            </button>
          </div>
          {exclStatus && <p className="text-xs text-slate-600">{exclStatus}</p>}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                  <th className="px-3 py-2 text-left">Da</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {exclusions.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-3 text-center text-xs text-slate-500">Nessuna esclusione.</td></tr>
                ) : exclusions.map(e => (
                  <tr key={`${e.accountId}-${e.reason}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{e.accountName || `Account ${e.accountId}`}</div>
                      <div className="text-xs text-slate-500">ID {e.accountId}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={e.reason === 'withdrawn' ? 'warning' : 'outline'} size="sm">{e.reason}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{e.excludedByEmail || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeExclusion(e)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
