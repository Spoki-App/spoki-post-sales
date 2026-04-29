'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageCircleQuestion,
  Plus,
  Save,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';
import { isAdminEmail, isTouchpointTemplateEditor } from '@/lib/config/owners';
import {
  touchpointTemplatesApi,
  type TouchpointTemplateRow,
  type TouchpointTypeSummary,
} from '@/lib/api/client';

interface FormState {
  systemPrompt: string;
  label: string;
  description: string;
  notes: string;
}

const PLACEHOLDERS = [
  { token: '{{client_context_json}}', desc: 'JSON con i dati reali del cliente (health, ticket, MRR, NPS, stage, goal, engagement, deal)' },
  { token: '{{additional_context}}', desc: 'Testo libero scritto dal CSM nel modale (opzionale)' },
];

export default function AdminTouchpointTemplatesPage() {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const isAdmin = isAdminEmail(user?.email);
  const canEdit = isTouchpointTemplateEditor(user?.email);

  useEffect(() => {
    if (user && !canEdit) router.replace('/dashboard');
  }, [user, canEdit, router]);

  const [types, setTypes] = useState<TouchpointTypeSummary[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [active, setActive] = useState<TouchpointTemplateRow | null>(null);
  const [history, setHistory] = useState<TouchpointTemplateRow[]>([]);
  const [form, setForm] = useState<FormState>({ systemPrompt: '', label: '', description: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [showCreateType, setShowCreateType] = useState(false);

  const loadTypes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await touchpointTemplatesApi.list(token);
      const data = (res as unknown as { data: { types: TouchpointTypeSummary[] } }).data;
      setTypes(data.types);
      if (data.types.length > 0 && !selectedType) {
        setSelectedType(data.types[0].type);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento dei tipi');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadEditor = useCallback(async () => {
    if (!token || !selectedType) return;
    setEditorLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await touchpointTemplatesApi.get(token, selectedType);
      const data = (res as unknown as { data: { active: TouchpointTemplateRow; history: TouchpointTemplateRow[] } }).data;
      setActive(data.active);
      setHistory(data.history);
      setForm({
        systemPrompt: data.active.systemPrompt,
        label: data.active.label,
        description: data.active.description ?? '',
        notes: data.active.notes ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento del template');
    } finally {
      setEditorLoading(false);
    }
  }, [token, selectedType]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    loadEditor();
  }, [loadEditor]);

  const isDirty = useMemo(() => {
    if (!active) return false;
    if (form.systemPrompt !== active.systemPrompt) return true;
    if (form.label !== active.label) return true;
    if ((form.description ?? '') !== (active.description ?? '')) return true;
    if ((form.notes ?? '') !== (active.notes ?? '')) return true;
    return false;
  }, [form, active]);

  async function saveDraft(): Promise<TouchpointTemplateRow | null> {
    if (!token || !selectedType) return null;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await touchpointTemplatesApi.createDraft(token, selectedType, {
        systemPrompt: form.systemPrompt,
        label: form.label || undefined,
        description: form.description ? form.description : null,
        notes: form.notes || null,
      });
      const tpl = (res as unknown as { data: TouchpointTemplateRow }).data;
      setInfo(`Bozza salvata come ${tpl.version}`);
      await loadEditor();
      return tpl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndActivate() {
    const ok = window.confirm(
      `Vuoi attivare una nuova versione del template "${selectedType}"?\n\nLa versione attuale (${active?.version ?? '-'}) verra' archiviata nello storico e questa diventera' la nuova attiva.`,
    );
    if (!ok) return;
    const tpl = await saveDraft();
    if (!tpl) return;
    await activateTemplate(tpl.id);
  }

  async function activateTemplate(id: string) {
    if (!token || !selectedType) return;
    setActivating(id);
    setError(null);
    try {
      await touchpointTemplatesApi.activate(token, selectedType, id);
      setInfo('Versione attivata.');
      await loadEditor();
      await loadTypes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nell'attivazione");
    } finally {
      setActivating(null);
    }
  }

  function loadFromVersion(tpl: TouchpointTemplateRow) {
    setForm({
      systemPrompt: tpl.systemPrompt,
      label: tpl.label,
      description: tpl.description ?? '',
      notes: tpl.notes ?? '',
    });
    setInfo(`Caricata versione ${tpl.version} nell'editor (non ancora salvata)`);
  }

  if (!user || !canEdit) return null;

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-semibold text-slate-900">Template domande call</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Modifica il prompt usato per generare le domande pre-call dal modale &quot;Domande call&quot; sul cliente.
            Ogni modifica salvata crea una nuova versione: la storia precedente resta consultabile e
            puoi tornare a una versione vecchia in qualsiasi momento.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateType(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nuovo tipo
          </button>
        )}
      </header>

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
          <aside className="lg:col-span-1 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Tipi di touchpoint
            </p>
            {types.map(t => {
              const isSelected = t.type === selectedType;
              return (
                <button
                  key={t.type}
                  onClick={() => setSelectedType(t.type)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    isSelected ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageCircleQuestion className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className={`text-sm font-medium ${isSelected ? 'text-emerald-800' : 'text-slate-700'}`}>
                      {t.label}
                    </span>
                    {!t.isSeed && (
                      <span className="ml-auto text-[10px] uppercase tracking-wide px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                        custom
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className={`mt-0.5 text-[11px] line-clamp-2 ${isSelected ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {t.description}
                    </p>
                  )}
                  {!t.hasActiveTemplate && (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                      Default in-code
                    </p>
                  )}
                </button>
              );
            })}
          </aside>

          <section className="lg:col-span-3 space-y-5">
            {editorLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Editor</h2>
                  {active && (
                    <span className="text-xs text-slate-500">
                      Versione attiva: <code className="font-mono text-slate-700">{active.version}</code>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Label (visibile nel modale)</label>
                    <input
                      value={form.label}
                      onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                      className="w-full text-sm rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Descrizione (mostrata nel modale)</label>
                    <input
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full text-sm rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">System prompt</label>
                  <textarea
                    value={form.systemPrompt}
                    onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                    rows={26}
                    className="w-full font-mono text-xs rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="Testo del system prompt. Usa i placeholder elencati sotto."
                  />
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold text-slate-600 mb-1">Placeholder disponibili:</p>
                    <ul className="space-y-0.5">
                      {PLACEHOLDERS.map(p => (
                        <li key={p.token} className="text-[11px] text-slate-600">
                          <code className="font-mono text-slate-800">{p.token}</code> — {p.desc}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Note (opzionale)</label>
                  <input
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Es. Aggiunto focus su rinnovo"
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
                  {isAdmin && (
                    <button
                      onClick={saveAndActivate}
                      disabled={saving || !isDirty}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Salva e attiva
                    </button>
                  )}
                  <span className="text-xs text-slate-500 ml-auto">
                    {!isAdmin && 'Solo gli admin possono attivare nuove versioni. '}
                    {isDirty ? 'Modifiche non salvate' : 'Nessuna modifica'}
                  </span>
                </div>
              </>
            )}
          </section>

          <aside className="lg:col-span-1">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Storico versioni</h3>
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {history.length === 0 && (
                  <p className="text-xs text-slate-500 italic">Nessuna versione salvata in DB.</p>
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
                      {new Date(h.createdAt).toLocaleString()}
                      {h.createdBy && ` - ${h.createdBy}`}
                    </div>
                    {h.notes && <div className="text-[10px] text-slate-600 italic mt-0.5">{h.notes}</div>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button
                        onClick={() => loadFromVersion(h)}
                        className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Carica nell&apos;editor
                      </button>
                      {!h.isActive && isAdmin && (
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

      {showCreateType && (
        <CreateTypeModal
          onClose={() => setShowCreateType(false)}
          onCreated={async (newType: string) => {
            setShowCreateType(false);
            setSelectedType(newType);
            await loadTypes();
            setInfo(`Tipo "${newType}" creato`);
          }}
        />
      )}
    </div>
  );
}

interface CreateTypeModalProps {
  onClose: () => void;
  onCreated: (newType: string) => void;
}

function CreateTypeModal({ onClose, onCreated }: CreateTypeModalProps) {
  const { token } = useAuthStore();
  const [type, setType] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    `Sei un Customer Success Manager senior di Spoki. Devi preparare il CSM a una call con un cliente generando domande mirate e talking point.

FOCUS DELLA CALL:
[Descrivi qui il focus del touchpoint]

CONTESTO DEL CLIENTE (JSON con dati reali):
{{client_context_json}}

CONTESTO AGGIUNTIVO FORNITO DAL CSM:
{{additional_context}}

ISTRUZIONI:
- Personalizza ogni domanda sul contesto reale del cliente.
- Domande aperte, non si/no.
- Italiano, tono professionale.

Rispondi SOLO con un JSON valido (no markdown):
{
  "objective": "...",
  "talkingPoints": ["..."],
  "openingQuestions": ["..."],
  "discoveryQuestions": ["..."],
  "challengeQuestions": ["..."],
  "closingQuestions": ["..."],
  "redFlags": ["..."]
}`,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!token) return;
    const cleanType = type.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(cleanType)) {
      setError('Codice tipo non valido: lowercase, lettere/numeri/underscore (max 64 char)');
      return;
    }
    if (!label.trim()) return setError('Label richiesto');
    if (!systemPrompt.trim()) return setError('System prompt richiesto');

    setSaving(true);
    setError(null);
    try {
      await touchpointTemplatesApi.createType(token, {
        type: cleanType,
        label: label.trim(),
        description: description.trim() || null,
        systemPrompt,
      });
      onCreated(cleanType);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nella creazione');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Nuovo tipo di touchpoint</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Codice tipo</label>
              <input
                value={type}
                onChange={e => setType(e.target.value)}
                placeholder="es. expansion_call"
                className="w-full font-mono text-sm rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <p className="mt-1 text-[10px] text-slate-500">lowercase, lettere/numeri/underscore</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Label</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="es. Call espansione enterprise"
                className="w-full text-sm rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descrizione (opzionale)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Breve descrizione mostrata nel modale"
              className="w-full text-sm rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">System prompt</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={16}
              className="w-full font-mono text-xs rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Usa <code className="font-mono">{'{{client_context_json}}'}</code> e <code className="font-mono">{'{{additional_context}}'}</code> come placeholder.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Crea e attiva
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
