'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { churnTrackerApi } from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  AlertTriangle, RefreshCw, DollarSign, CheckCircle, XCircle,
  TrendingDown, ChevronDown, ChevronUp, Send, MessageSquare,
  Search, Download, Users,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import type { ChurnTrackerRecord, ChurnNote, ChurnSummary, ChurnStatus } from '@/types/churn';
import {
  CHURN_STATUS_LABELS, CHURN_STATUS_COLORS, CHURN_REASONS,
  CONTACT_OUTCOMES, ACTIVE_STATUSES, CHURN_STATUSES,
} from '@/types/churn';

const formatEur = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

const fmtDate = (d: string | null) => {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const FILTER_OPTIONS = [
  { value: 'active', label: 'Attivi (da gestire)' },
  { value: 'active_and_lost', label: 'Da gestire + Persi' },
  { value: 'all', label: 'Tutti' },
  ...CHURN_STATUSES.map(s => ({ value: s, label: CHURN_STATUS_LABELS[s] })),
];

const REASON_OPTIONS = [
  { value: 'all', label: 'Tutti i motivi' },
  { value: 'none', label: 'Senza motivo' },
  ...Object.entries(CHURN_REASONS).map(([value, label]) => ({ value, label })),
];

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

function NotePanel({ recordId, token }: { recordId: string; token: string }) {
  const [notes, setNotes] = useState<ChurnNote[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    churnTrackerApi.getNotes(token, recordId)
      .then(res => setNotes(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, recordId]);

  const handleAdd = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await churnTrackerApi.addNote(token, recordId, text.trim());
      if (res.data) setNotes(prev => [res.data!, ...prev]);
      setText('');
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="px-5 py-4 bg-slate-50 border-t border-slate-100">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Note ({notes.length})</span>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400 py-2">Caricamento...</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">Nessuna nota. Aggiungi la prima.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-2 mb-3">
            {notes.map(n => (
              <div key={n.id} className="px-3 py-2.5 bg-slate-50 rounded-lg border-l-3 border-emerald-400">
                <p className="text-sm text-slate-700">{n.text}</p>
                <div className="flex gap-3 mt-1 text-xs text-slate-400">
                  <span>{n.author}</span>
                  <span>{n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: it }) : ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Scrivi una nota..."
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !text.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {saving ? '...' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChurnRow({
  record, token, isSelected, onToggleSelect, onUpdate,
}: {
  record: ChurnTrackerRecord;
  token: string;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (id: string, body: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusCls = CHURN_STATUS_COLORS[record.status] || '';

  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(record.id)}
            className="w-4 h-4 accent-emerald-600 cursor-pointer"
          />
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{record.accountId}</td>
        <td className="px-4 py-3 text-sm font-medium text-slate-800">{record.accountName || '-'}</td>
        <td className="px-4 py-3 text-xs text-slate-600">{record.planSlug || '-'}</td>
        <td className="px-4 py-3 text-sm font-semibold text-red-600 text-right">{formatEur(record.mrrLost)}</td>
        <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(record.subscriptionEndDate)}</td>
        <td className="px-4 py-3 text-xs text-center text-slate-600">{record.daysSinceExpiry}g</td>
        <td className="px-4 py-3 text-xs">
          {record.assignedTo ? (
            <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200">
              {record.assignedTo.name}
            </span>
          ) : <span className="text-slate-300">-</span>}
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <select
            value={record.status}
            onChange={e => onUpdate(record.id, { status: e.target.value })}
            className={`px-2 py-1 rounded-md border text-xs font-medium cursor-pointer ${statusCls}`}
          >
            {CHURN_STATUSES.map(s => (
              <option key={s} value={s}>{CHURN_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <select
            value={record.contactOutcome || ''}
            onChange={e => onUpdate(record.id, { contactOutcome: e.target.value || null })}
            className="px-2 py-1 rounded-md border border-slate-200 text-xs cursor-pointer bg-white"
          >
            <option value="">-- Esito --</option>
            {Object.entries(CONTACT_OUTCOMES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <select
            value={record.churnReason || ''}
            onChange={e => onUpdate(record.id, { churnReason: e.target.value || null })}
            className="px-2 py-1 rounded-md border border-slate-200 text-xs cursor-pointer bg-white"
          >
            <option value="">-- Motivo --</option>
            {Object.entries(CHURN_REASONS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{record.primaryContact?.split(' - ')[0] || '-'}</td>
        <td className="px-4 py-3 text-center">
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={13} className="p-0">
            <NotePanel recordId={record.id} token={token} />
          </td>
        </tr>
      )}
    </>
  );
}

function BulkActionBar({
  count, mrrSelected, onBatchStatus, onClear,
}: {
  count: number; mrrSelected: number;
  onBatchStatus: (status: string) => void; onClear: () => void;
}) {
  const [batchStatus, setBatchStatus] = useState('');

  return (
    <div className="sticky top-0 z-10 bg-emerald-600 text-white px-5 py-3 rounded-xl mb-4 flex items-center gap-4 flex-wrap shadow-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">{count} selezionati</span>
        <span className="text-xs opacity-80">({formatEur(mrrSelected)} MRR)</span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={batchStatus}
          onChange={e => setBatchStatus(e.target.value)}
          className="px-2.5 py-1.5 rounded-md border border-white/30 text-xs bg-white/15 text-white cursor-pointer"
        >
          <option value="" className="text-slate-700">Cambia status...</option>
          {CHURN_STATUSES.map(s => (
            <option key={s} value={s} className="text-slate-700">{CHURN_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button
          onClick={() => { if (batchStatus) { onBatchStatus(batchStatus); setBatchStatus(''); } }}
          disabled={!batchStatus}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Applica
        </button>
      </div>

      <button
        onClick={onClear}
        className="ml-auto px-3 py-1.5 rounded-md border border-white/30 text-xs hover:bg-white/10"
      >
        Deseleziona
      </button>
    </div>
  );
}

export default function ChurnTrackerPage() {
  const { token } = useAuthStore();
  const [records, setRecords] = useState<ChurnTrackerRecord[]>([]);
  const [summary, setSummary] = useState<ChurnSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; updated: number; renewed: number } | null>(null);
  const [filter, setFilter] = useState('active');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [recRes, sumRes] = await Promise.all([
        churnTrackerApi.listRecords(token, { filter }),
        churnTrackerApi.summary(token),
      ]);
      setRecords(recRes.data ?? []);
      setSummary(sumRes.data ?? null);
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    if (!token || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await churnTrackerApi.sync(token);
      if (res.data) setSyncResult(res.data);
      await load();
    } catch { /* ignore */ }
    finally { setSyncing(false); }
  };

  const handleUpdate = useCallback(async (id: string, body: Record<string, unknown>) => {
    if (!token) return;
    await churnTrackerApi.updateRecord(token, id, body);
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...body } as ChurnTrackerRecord : r));
  }, [token]);

  const handleBatchStatus = useCallback(async (status: string) => {
    if (!token || selectedIds.size === 0) return;
    await churnTrackerApi.batchAction(token, { ids: Array.from(selectedIds), action: 'status', status });
    setSelectedIds(new Set());
    await load();
  }, [token, selectedIds, load]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const filteredRecords = useMemo(() => {
    let result = records;
    if (reasonFilter === 'none') result = result.filter(r => !r.churnReason);
    else if (reasonFilter !== 'all') result = result.filter(r => r.churnReason === reasonFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(r =>
        (r.accountName || '').toLowerCase().includes(q) ||
        String(r.accountId).includes(q) ||
        (r.planSlug || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [records, reasonFilter, searchTerm]);

  const sortedRecords = useMemo(() => {
    if (!sortKey) return filteredRecords;
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filteredRecords].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey];
      const vb = (b as unknown as Record<string, unknown>)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
      return String(va).localeCompare(String(vb), 'it') * mult;
    });
  }, [filteredRecords, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const selectedMrr = useMemo(
    () => records.filter(r => selectedIds.has(r.id)).reduce((s, r) => s + r.mrrLost, 0),
    [records, selectedIds]
  );

  const allSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedIds.has(r.id));

  const handleExport = () => {
    const rows = sortedRecords.map(r => ({
      ID: r.accountId,
      Account: r.accountName || '',
      Piano: r.planSlug || '',
      'MRR Perso': r.mrrLost,
      Scadenza: r.subscriptionEndDate || '',
      Giorni: r.daysSinceExpiry,
      Status: CHURN_STATUS_LABELS[r.status] || r.status,
      Esito: r.contactOutcome ? CONTACT_OUTCOMES[r.contactOutcome as keyof typeof CONTACT_OUTCOMES] || r.contactOutcome : '',
      Motivo: r.churnReason ? CHURN_REASONS[r.churnReason as keyof typeof CHURN_REASONS] || r.churnReason : '',
      Referente: r.primaryContact || '',
    }));

    const header = Object.keys(rows[0] || {}).join('\t');
    const body = rows.map(r => Object.values(r).join('\t')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `churn-tracker-${new Date().toISOString().split('T')[0]}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Churn Tracker</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Account con subscription scaduta senza rinnovo
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={sortedRecords.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Esporta
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync...' : 'Sincronizza da Metabase'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 mb-4">
          Sync completato: {syncResult.added} nuovi, {syncResult.updated} aggiornati, {syncResult.renewed} rinnovati
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard
          title="Churn attivi"
          value={summary?.active ?? 0}
          sub={`su ${summary?.total ?? 0} totali`}
          icon={AlertTriangle}
          color="bg-red-500"
        />
        <KpiCard
          title="MRR a rischio"
          value={formatEur(summary?.mrrAtRisk ?? 0)}
          icon={DollarSign}
          color="bg-amber-500"
        />
        <KpiCard
          title="Recuperati"
          value={summary?.recovered ?? 0}
          sub={`${formatEur(summary?.mrrRecovered ?? 0)} MRR`}
          icon={CheckCircle}
          color="bg-emerald-600"
        />
        <KpiCard
          title="Persi"
          value={summary?.lost ?? 0}
          sub={`${formatEur(summary?.mrrLost ?? 0)} MRR`}
          icon={XCircle}
          color="bg-slate-500"
        />
        <KpiCard
          title="Recovery rate"
          value={`${summary?.recoveryRate ?? 0}%`}
          icon={TrendingDown}
          color="bg-emerald-600"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap mb-4">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
        >
          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={reasonFilter}
          onChange={e => setReasonFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
        >
          {REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cerca per nome, ID o piano..."
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm w-60"
          />
        </div>
        <span className="text-xs text-slate-500">{filteredRecords.length} risultati</span>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          mrrSelected={selectedMrr}
          onBatchStatus={handleBatchStatus}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Table */}
      <Card padding="none">
        {sortedRecords.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">
              {records.length === 0 ? 'Nessun dato. Clicca "Sincronizza da Metabase" per caricare.' : 'Nessun risultato con i filtri attuali.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(filteredRecords.map(r => r.id)))}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </th>
                  <SortHeader label="ID" field="accountId" />
                  <SortHeader label="Account" field="accountName" />
                  <SortHeader label="Piano" field="planSlug" />
                  <SortHeader label="MRR Perso" field="mrrLost" />
                  <SortHeader label="Scadenza" field="subscriptionEndDate" />
                  <SortHeader label="Giorni" field="daysSinceExpiry" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Assegnato</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Esito</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Motivo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Referente</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map(r => (
                  <ChurnRow
                    key={r.id}
                    record={r}
                    token={token!}
                    isSelected={selectedIds.has(r.id)}
                    onToggleSelect={toggleSelect}
                    onUpdate={handleUpdate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {sortedRecords.length > 0 && (
        <div className="mt-3 px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between text-sm text-slate-500">
          <span>Totale MRR filtrato: <strong className="text-red-600">{formatEur(sortedRecords.reduce((s, r) => s + r.mrrLost, 0))}</strong></span>
          <span>{sortedRecords.length} account</span>
        </div>
      )}
    </div>
  );
}
