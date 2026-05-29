'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  Play,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Sparkles,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';
import { isAdminEmail } from '@/lib/config/owners';
import {
  promptTemplatesApi,
  type CallReportType,
  type PromptCheckpoint,
  type PromptTemplateRow,
  type DryRunResult,
} from '@/lib/api/client';

const CALL_TYPES: { id: CallReportType; label: string }[] = [
  { id: 'activation', label: 'Activation' },
  { id: 'training', label: 'Training' },
];

interface FormState {
  systemPrompt: string;
  checkpoints: PromptCheckpoint[];
  notes: string;
}

const EMPTY_CHECKPOINT: PromptCheckpoint = { key: '', label: '', description: '' };

export default function AdminPromptsPage() {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  const [callType, setCallType] = useState<CallReportType>('activation');
  const [active, setActive] = useState<PromptTemplateRow | null>(null);
  const [history, setHistory] = useState<PromptTemplateRow[]>([]);
  const [form, setForm] = useState<FormState>({ systemPrompt: '', checkpoints: [], notes: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [dryRunHubspotId, setDryRunHubspotId] = useState('');
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    if (!active) return false;
    if (form.systemPrompt !== active.systemPrompt) return true;
    if ((form.notes ?? '') !== (active.notes ?? '')) return true;
    if (form.checkpoints.length !== active.checkpoints.length) return true;
    return form.checkpoints.some((c, i) => {
      const a = active.checkpoints[i];
      return !a || a.key !== c.key || a.label !== c.label || a.description !== c.description;
    });
  }, [form, active]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await promptTemplatesApi.get(token, callType);
      const data = (res as unknown as { data: { active: PromptTemplateRow; history: PromptTemplateRow[] } }).data;
      setActive(data.active);
      setHistory(data.history);
      setForm({
        systemPrompt: data.active.systemPrompt,
        checkpoints: data.active.checkpoints.map(c => ({ ...c })),
        notes: data.active.notes ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  }, [token, callType]);

  useEffect(() => {
    load();
  }, [load]);

  function updateCheckpoint(idx: number, patch: Partial<PromptCheckpoint>) {
    setForm(f => ({
      ...f,
      checkpoints: f.checkpoints.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  function addCheckpoint() {
    setForm(f => ({ ...f, checkpoints: [...f.checkpoints, { ...EMPTY_CHECKPOINT }] }));
  }

  function removeCheckpoint(idx: number) {
    setForm(f => ({ ...f, checkpoints: f.checkpoints.filter((_, i) => i !== idx) }));
  }

  function moveCheckpoint(idx: number, dir: -1 | 1) {
    setForm(f => {
      const next = [...f.checkpoints];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return f;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...f, checkpoints: next };
    });
  }

  function loadFromTemplate(tpl: PromptTemplateRow) {
    setForm({
      systemPrompt: tpl.systemPrompt,
      checkpoints: tpl.checkpoints.map(c => ({ ...c })),
      notes: tpl.notes ?? '',
    });
    setInfo(`Caricata versione ${tpl.version} nell'editor (non ancora salvata)`);
  }

  async function saveDraft(): Promise<PromptTemplateRow | null> {
    if (!token) return null;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await promptTemplatesApi.createDraft(token, callType, {
        systemPrompt: form.systemPrompt,
        checkpoints: form.checkpoints,
        notes: form.notes || null,
      });
      const tpl = (res as unknown as { data: PromptTemplateRow }).data;
      setInfo(`Bozza salvata come ${tpl.version}`);
      await load();
      return tpl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndActivate() {
    const stale = active ? history.filter(h => h.version === active.version).length : 0;
    const ok = window.confirm(
      `Vuoi attivare una nuova versione?\n\nLe analisi gia salvate con la versione corrente (${active?.version ?? '-'}) verranno marcate come obsolete e ri-analizzate automaticamente la prossima volta.\n\n(${stale} chiamate impattate stimate.)`,
    );
    if (!ok) return;
    const tpl = await saveDraft();
    if (!tpl) return;
    await activateTemplate(tpl.id);
  }

  async function activateTemplate(id: string) {
    if (!token) return;
    setActivating(id);
    setError(null);
    try {
      await promptTemplatesApi.activate(token, callType, id);
      setInfo('Versione attivata. Le analisi obsolete verranno ri-analizzate automaticamente.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nell'attivazione");
    } finally {
      setActivating(null);
    }
  }

  async function runDryRun() {
    if (!token) return;
    if (!dryRunHubspotId.trim()) {
      setDryRunError('Inserisci un engagement hubspot id');
      return;
    }
    setDryRunBusy(true);
    setDryRunError(null);
    setDryRunResult(null);
    try {
      const res = await promptTemplatesApi.dryRun(token, callType, {
        engagementHubspotId: dryRunHubspotId.trim(),
        template: { systemPrompt: form.systemPrompt, checkpoints: form.checkpoints },
      });
      const data = (res as unknown as { data: DryRunResult }).data;
      setDryRunResult(data);
    } catch (e) {
      setDryRunError(e instanceof Error ? e.message : 'Errore nel dry-run');
    } finally {
      setDryRunBusy(false);
    }
  }

  if (!user || !isAdmin) return null;

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <h1 className="text-2xl font-semibold text-slate-900">Prompt e criteri di valutazione</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Modifica il system prompt e la lista dei checkpoint usati per analizzare le call.
          Le bozze non impattano nulla finche non vengono attivate. L&apos;attivazione invalida
          le analisi precedenti che verranno rifatte automaticamente.
        </p>
      </header>

      <div className="mb-4 inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
        {CALL_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setCallType(t.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              callType === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{info}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <section className="lg:col-span-3 space-y-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Editor</h2>
              {active && (
                <span className="text-xs text-slate-500">
                  Versione attiva: <code className="font-mono text-slate-700">{active.version}</code>
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">System prompt</label>
              <textarea
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                rows={20}
                className="w-full font-mono text-xs rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="Testo del system prompt. Puoi usare i placeholder {{checkpoints_json_skeleton}} e {{checkpoints_list}} per generare automaticamente le sezioni dai checkpoint sotto."
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Placeholder disponibili:{' '}
                <code className="font-mono">{'{{checkpoints_json_skeleton}}'}</code>,{' '}
                <code className="font-mono">{'{{checkpoints_list}}'}</code>
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-700">Checkpoint ({form.checkpoints.length})</label>
                <button
                  onClick={addCheckpoint}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3 h-3" />
                  Aggiungi
                </button>
              </div>
              <div className="space-y-2">
                {form.checkpoints.map((c, idx) => (
                  <div key={idx} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-0.5 mt-1">
                        <button
                          onClick={() => moveCheckpoint(idx, -1)}
                          disabled={idx === 0}
                          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          title="Sposta su"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => moveCheckpoint(idx, 1)}
                          disabled={idx === form.checkpoints.length - 1}
                          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          title="Sposta giu"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex-1 grid grid-cols-12 gap-2">
                        <input
                          value={c.key}
                          onChange={e => updateCheckpoint(idx, { key: e.target.value })}
                          placeholder="key"
                          className="col-span-3 font-mono text-xs rounded border border-slate-300 px-2 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                        <input
                          value={c.label}
                          onChange={e => updateCheckpoint(idx, { label: e.target.value })}
                          placeholder="label (mostrata nella UI)"
                          className="col-span-9 text-xs rounded border border-slate-300 px-2 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                        <textarea
                          value={c.description}
                          onChange={e => updateCheckpoint(idx, { description: e.target.value })}
                          rows={2}
                          placeholder="descrizione passata al modello (cosa cercare nel transcript)"
                          className="col-span-12 text-xs rounded border border-slate-300 px-2 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <button
                        onClick={() => removeCheckpoint(idx)}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Rimuovi"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {form.checkpoints.length === 0 && (
                  <p className="text-xs text-slate-500 italic">Nessun checkpoint. Aggiungine almeno uno.</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Note (opzionale)</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Es. Aggiunto checkpoint follow-up email"
                className="w-full text-xs rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={saveDraft}
                disabled={saving || !isDirty}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salva bozza
              </button>
              <button
                onClick={saveAndActivate}
                disabled={saving || !isDirty}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Salva e attiva
              </button>
              <span className="text-xs text-slate-500 ml-auto">
                {isDirty ? 'Modifiche non salvate' : 'Nessuna modifica'}
              </span>
            </div>
          </section>

          <aside className="lg:col-span-2 space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                <Play className="w-4 h-4 text-emerald-600" />
                Test live (dry-run)
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Esegue l&apos;analisi con i contenuti attuali dell&apos;editor su una call gia archiviata,
                senza salvare nulla.
              </p>
              <input
                value={dryRunHubspotId}
                onChange={e => setDryRunHubspotId(e.target.value)}
                placeholder="Engagement HubSpot ID"
                className="w-full text-xs rounded-md border border-slate-300 px-3 py-1.5 mb-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <button
                onClick={runDryRun}
                disabled={dryRunBusy || !dryRunHubspotId.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {dryRunBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Esegui dry-run
              </button>
              {dryRunError && (
                <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                  {dryRunError}
                </div>
              )}
              {dryRunResult && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] text-slate-500">
                    {dryRunResult.transcriptLines} righe di transcript analizzate in {dryRunResult.elapsedMs}ms
                  </div>
                  <div className="space-y-1">
                    {Object.entries(dryRunResult.analysis).map(([key, r]) => (
                      <div key={key} className="rounded border border-slate-200 px-2 py-1.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          {r.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          )}
                          <span className="font-mono text-[11px] text-slate-700">{key}</span>
                          <span
                            className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                              r.confidence === 'high'
                                ? 'bg-emerald-100 text-emerald-700'
                                : r.confidence === 'medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.confidence}
                          </span>
                        </div>
                        {r.evidence && (
                          <p className="mt-1 text-[11px] text-slate-600 italic">&ldquo;{r.evidence}&rdquo;</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Storico versioni</h3>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {history.length === 0 && (
                  <p className="text-xs text-slate-500 italic">Nessuna versione storica.</p>
                )}
                {history.map(h => (
                  <div
                    key={h.id}
                    className={`rounded border px-2 py-1.5 text-xs ${
                      h.isActive ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[11px] text-slate-700 truncate">{h.version}</code>
                      {h.isActive && (
                        <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                          Attiva
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(h.createdAt).toLocaleString()} - {h.checkpoints.length} checkpoint
                      {h.createdBy && ` - ${h.createdBy}`}
                    </div>
                    {h.notes && <div className="text-[10px] text-slate-600 italic mt-0.5">{h.notes}</div>}
                    <div className="mt-1 flex gap-1">
                      <button
                        onClick={() => loadFromTemplate(h)}
                        className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Carica nell&apos;editor
                      </button>
                      {!h.isActive && (
                        <button
                          onClick={() => activateTemplate(h.id)}
                          disabled={activating === h.id}
                          className="text-[10px] px-2 py-0.5 rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {activating === h.id ? 'Attivando...' : 'Attiva'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
