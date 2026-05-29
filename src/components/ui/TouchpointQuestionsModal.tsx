'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import {
  aiApi,
  type TouchpointQuestionsGeneration,
  type TouchpointTypeSummary,
} from '@/lib/api/client';
import {
  X,
  Loader2,
  MessageCircleQuestion,
  Copy,
  Check,
  RefreshCcw,
  ChevronLeft,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

interface Section {
  key: keyof TouchpointQuestionsGeneration['questions'];
  title: string;
  description: string;
  variant: 'list' | 'single';
}

const SECTIONS: Section[] = [
  { key: 'objective', title: 'Obiettivo della call', description: 'Cosa vogliamo ottenere alla fine di questa conversazione', variant: 'single' },
  { key: 'talkingPoints', title: 'Talking points', description: 'Punti chiave da toccare, ancorati al contesto del cliente', variant: 'list' },
  { key: 'openingQuestions', title: 'Domande di apertura', description: 'Aprire la conversazione e capire come sta il cliente', variant: 'list' },
  { key: 'discoveryQuestions', title: 'Domande discovery', description: 'Capire aspettative, bisogni e priorita\'', variant: 'list' },
  { key: 'challengeQuestions', title: 'Domande di challenge', description: 'Far emergere preoccupazioni, scogli e blocchi', variant: 'list' },
  { key: 'closingQuestions', title: 'Domande di chiusura', description: 'Consolidare next step e ottenere commitment', variant: 'list' },
  { key: 'redFlags', title: 'Red flag da monitorare', description: 'Segnali a cui prestare attenzione durante la call', variant: 'list' },
];

export function TouchpointQuestionsModal({ open, onClose, clientId, clientName }: Props) {
  const { token } = useAuthStore();

  const [types, setTypes] = useState<TouchpointTypeSummary[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [typesError, setTypesError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<string>('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TouchpointQuestionsGeneration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setTypesLoading(true);
    setTypesError(null);
    aiApi
      .listTouchpointTypes(token)
      .then(res => {
        if (cancelled) return;
        const list = (res as unknown as { data: { types: TouchpointTypeSummary[] } }).data?.types ?? [];
        setTypes(list);
        if (list.length > 0 && !selectedType) setSelectedType(list[0].type);
      })
      .catch(e => {
        if (cancelled) return;
        setTypesError(e instanceof Error ? e.message : 'Errore nel caricamento tipi');
      })
      .finally(() => {
        if (!cancelled) setTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  if (!open) return null;

  const handleGenerate = async () => {
    if (!token || !selectedType) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await aiApi.generateTouchpointQuestions(
        token,
        clientId,
        selectedType,
        additionalContext.trim() || undefined,
      );
      const data = (res as unknown as { data: TouchpointQuestionsGeneration }).data;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nella generazione');
    } finally {
      setGenerating(false);
    }
  };

  const copy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const copyAllMarkdown = () => {
    if (!result) return;
    const q = result.questions;
    const lines: string[] = [];
    lines.push(`# Preparazione call — ${result.template.label}`);
    lines.push(`Cliente: ${clientName}`);
    lines.push(`Generata il: ${new Date(result.generatedAt).toLocaleString()}`);
    lines.push('');
    if (q.objective) {
      lines.push('## Obiettivo');
      lines.push(q.objective);
      lines.push('');
    }
    const blocks: Array<[string, string[]]> = [
      ['Talking points', q.talkingPoints],
      ['Domande di apertura', q.openingQuestions],
      ['Domande discovery', q.discoveryQuestions],
      ['Domande di challenge', q.challengeQuestions],
      ['Domande di chiusura', q.closingQuestions],
      ['Red flag da monitorare', q.redFlags],
    ];
    for (const [title, items] of blocks) {
      if (items.length === 0) continue;
      lines.push(`## ${title}`);
      for (const it of items) lines.push(`- ${it}`);
      lines.push('');
    }
    copy(lines.join('\n'), 'all');
  };

  const selectedTypeMeta = types.find(t => t.type === selectedType) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <MessageCircleQuestion className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Domande per la call</h2>
              <p className="text-sm text-slate-500 mt-0.5">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!result ? (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Tipo di touchpoint
                </p>
                {typesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Caricamento tipi...
                  </div>
                ) : typesError ? (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{typesError}</span>
                  </div>
                ) : types.length === 0 ? (
                  <div className="text-sm text-slate-500 italic py-2">Nessun tipo disponibile.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {types.map(t => {
                      const active = t.type === selectedType;
                      return (
                        <button
                          key={t.type}
                          onClick={() => setSelectedType(t.type)}
                          className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                            active
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{t.label}</p>
                            {!t.isSeed && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                custom
                              </span>
                            )}
                          </div>
                          {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Contesto aggiuntivo <span className="text-slate-400 normal-case">(opzionale)</span>
                </p>
                <textarea
                  value={additionalContext}
                  onChange={e => setAdditionalContext(e.target.value)}
                  placeholder="Cosa vuoi approfondire? Es: il cliente ci ha scritto preoccupato per il prezzo, o vogliamo proporre il piano Pro..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || !selectedType}
                className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Generazione in corso...' : 'Genera domande'}
              </button>

              {selectedTypeMeta && !selectedTypeMeta.hasActiveTemplate && selectedTypeMeta.isSeed && (
                <p className="text-[11px] text-slate-500 italic">
                  Nessun template salvato per questo tipo: verrà usato il prompt di default integrato.
                </p>
              )}
            </>
          ) : (
            <ResultView
              result={result}
              clientName={clientName}
              copiedKey={copiedKey}
              copy={copy}
              copyAllMarkdown={copyAllMarkdown}
              onBack={() => setResult(null)}
              onRegenerate={() => {
                setResult(null);
                handleGenerate();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface ResultViewProps {
  result: TouchpointQuestionsGeneration;
  clientName: string;
  copiedKey: string | null;
  copy: (text: string, key: string) => void;
  copyAllMarkdown: () => void;
  onBack: () => void;
  onRegenerate: () => void;
}

function ResultView({ result, clientName, copiedKey, copy, copyAllMarkdown, onBack, onRegenerate }: ResultViewProps) {
  const q = result.questions;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 -mt-1 mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
          <MessageCircleQuestion className="w-3 h-3" />
          {result.template.label}
        </span>
        <span className="text-[11px] text-slate-500 font-mono">{result.template.version}</span>
        <span className="text-[11px] text-slate-500 ml-auto">
          {clientName} - {new Date(result.generatedAt).toLocaleString()}
        </span>
      </div>

      {SECTIONS.map(section => {
        const value = q[section.key];
        if (section.variant === 'single') {
          const text = typeof value === 'string' ? value : '';
          if (!text) return null;
          return (
            <SectionCard
              key={section.key}
              title={section.title}
              description={section.description}
              actionLabel={copiedKey === section.key ? 'Copiato' : 'Copia'}
              actionIcon={copiedKey === section.key ? 'check' : 'copy'}
              onAction={() => copy(text, section.key)}
            >
              <p className="text-sm text-slate-800 leading-relaxed">{text}</p>
            </SectionCard>
          );
        }
        const items = Array.isArray(value) ? (value as string[]) : [];
        if (items.length === 0) return null;
        return (
          <SectionCard
            key={section.key}
            title={section.title}
            description={section.description}
            actionLabel={copiedKey === section.key ? 'Copiato' : 'Copia tutto'}
            actionIcon={copiedKey === section.key ? 'check' : 'copy'}
            onAction={() => copy(items.map(i => `- ${i}`).join('\n'), section.key)}
          >
            <ul className="space-y-1.5">
              {items.map((item, idx) => {
                const itemKey = `${section.key}-${idx}`;
                const isCopied = copiedKey === itemKey;
                return (
                  <li key={itemKey} className="group flex items-start gap-2">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-300 shrink-0" aria-hidden />
                    <p className="flex-1 text-sm text-slate-800 leading-relaxed">{item}</p>
                    <button
                      onClick={() => copy(item, itemKey)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-emerald-600"
                      title="Copia questa domanda"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" />
          Cambia tipo
        </button>
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw className="w-4 h-4" />
          Rigenera
        </button>
        <button
          onClick={copyAllMarkdown}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          {copiedKey === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copiedKey === 'all' ? 'Copiato' : 'Copia tutto (markdown)'}
        </button>
      </div>
    </>
  );
}

function SectionCard({
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: 'copy' | 'check';
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 px-3.5 py-2.5 border-b border-slate-100">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
        <button
          onClick={onAction}
          className="text-xs text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 shrink-0"
        >
          {actionIcon === 'check' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {actionLabel}
        </button>
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}
