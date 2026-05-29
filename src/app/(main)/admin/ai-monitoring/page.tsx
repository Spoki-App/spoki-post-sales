'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Loader2,
  Search,
  XCircle,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';
import { isAdminEmail } from '@/lib/config/owners';
import {
  aiMonitoringApi,
  type LangfuseIdType,
  type LangfuseLookupResponse,
  type LangfuseObservation,
  type LangfuseTrace,
  type LangfuseTraceDetail,
} from '@/lib/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';

const ID_TYPES: { id: LangfuseIdType; label: string; hint: string }[] = [
  { id: 'session', label: 'Session ID', hint: 'Una conversazione/processo dell\'agente (raggruppa piu\' trace)' },
  { id: 'user', label: 'User ID', hint: 'L\'identificativo dell\'agente o dell\'utente finale' },
  { id: 'trace', label: 'Trace ID', hint: 'Una singola esecuzione (intervallo orario ignorato)' },
];

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { from: toLocalInput(past), to: toLocalInput(now) };
}

function toLocalInput(d: Date): string {
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return undefined;
  return new Date(ts).toISOString();
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatCost(cost: number | null): string {
  if (cost == null) return '—';
  if (cost === 0) return '0';
  return `$${cost.toFixed(cost < 0.01 ? 6 : 4)}`;
}

function jsonPreview(value: unknown, max = 240): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.length > max ? value.slice(0, max) + '…' : value;
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return String(value);
  }
}

function jsonPretty(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AiMonitoringPage() {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  const initialRange = useMemo(defaultRange, []);

  const [idType, setIdType] = useState<LangfuseIdType>('session');
  const [id, setId] = useState('');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LangfuseLookupResponse | null>(null);

  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [traceDetail, setTraceDetail] = useState<LangfuseTraceDetail | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!token) return;
    setError(null);
    setResult(null);
    setSelectedTraceId(null);
    setTraceDetail(null);

    const trimmed = id.trim();
    if (!trimmed) {
      setError('Inserisci un ID.');
      return;
    }

    setLoading(true);
    try {
      const params: Parameters<typeof aiMonitoringApi.lookup>[1] = {
        idType,
        id: trimmed,
      };
      if (idType !== 'trace') {
        const fromIso = localInputToIso(from);
        const toIso = localInputToIso(to);
        if (!fromIso || !toIso) {
          setError("Inserisci un intervallo 'da' e 'a' valido.");
          setLoading(false);
          return;
        }
        if (Date.parse(fromIso) > Date.parse(toIso)) {
          setError("L'orario 'da' deve essere precedente a 'a'.");
          setLoading(false);
          return;
        }
        params.from = fromIso;
        params.to = toIso;
      }

      const res = await aiMonitoringApi.lookup(token, params);
      const data = res.data;
      if (!data) {
        setError('Risposta vuota dal server.');
        return;
      }
      setResult(data);

      if (data.kind === 'trace') {
        setSelectedTraceId(data.item.id);
        setTraceDetail(data.item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante la ricerca');
    } finally {
      setLoading(false);
    }
  }, [token, idType, id, from, to]);

  const handleSelectTrace = useCallback(async (traceId: string) => {
    if (!token) return;
    setSelectedTraceId(traceId);
    setTraceDetail(null);
    setTraceError(null);
    setTraceLoading(true);
    try {
      const res = await aiMonitoringApi.getTrace(token, traceId);
      if (!res.data) {
        setTraceError('Risposta vuota dal server.');
        return;
      }
      setTraceDetail(res.data);
    } catch (e) {
      setTraceError(e instanceof Error ? e.message : 'Errore caricamento dettaglio');
    } finally {
      setTraceLoading(false);
    }
  }, [token]);

  if (!user) return null;
  if (!isAdmin) return null;

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-600" />
          <h1 className="text-2xl font-semibold text-slate-900">Monitoraggio AI</h1>
        </div>
        <p className="text-sm text-slate-500">
          Inserisci un ID e un intervallo orario: Langfuse mostrera&apos; cosa ha fatto l&apos;agente esterno in quel periodo.
        </p>
      </header>

      <Card padding="md">
        <CardHeader>
          <CardTitle>Ricerca</CardTitle>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo ID</label>
            <select
              value={idType}
              onChange={e => setIdType(e.target.value as LangfuseIdType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {ID_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {ID_TYPES.find(t => t.id === idType)?.hint}
            </p>
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-600 mb-1">ID</label>
            <input
              value={id}
              onChange={e => setId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="es. agent-pippo-123"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Da</label>
            <input
              type="datetime-local"
              value={from}
              disabled={idType === 'trace'}
              onChange={e => setFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">A</label>
            <input
              type="datetime-local"
              value={to}
              disabled={idType === 'trace'}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !id.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Cerca
          </button>
          {error && (
            <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
              <XCircle className="w-4 h-4" /> {error}
            </span>
          )}
        </div>
      </Card>

      {result?.kind === 'list' && (
        <Card padding="md">
          <CardHeader>
            <CardTitle>
              Trace trovate ({result.total})
            </CardTitle>
            <span className="text-xs text-slate-500">pagina {result.page}, max {result.limit}</span>
          </CardHeader>

          {result.items.length === 0 ? (
            <p className="text-sm text-slate-500">Nessuna trace trovata per i criteri indicati.</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="px-5 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Trace ID</th>
                    <th className="px-3 py-2 font-medium">Latenza</th>
                    <th className="px-3 py-2 font-medium">Costo</th>
                    <th className="px-3 py-2 font-medium">Stato</th>
                    <th className="px-3 py-2 font-medium">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map(trace => (
                    <TraceRow
                      key={trace.id}
                      trace={trace}
                      selected={trace.id === selectedTraceId}
                      onSelect={() => handleSelectTrace(trace.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {selectedTraceId && (
        <Card padding="md">
          <CardHeader>
            <CardTitle>
              Dettaglio trace
            </CardTitle>
            <code className="text-xs text-slate-500 break-all">{selectedTraceId}</code>
          </CardHeader>

          {traceLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Caricamento dettaglio…
            </div>
          )}
          {traceError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4" /> {traceError}
            </div>
          )}
          {traceDetail && !traceLoading && (
            <TraceDetailView detail={traceDetail} />
          )}
        </Card>
      )}
    </div>
  );
}

function TraceRow({
  trace,
  selected,
  onSelect,
}: {
  trace: LangfuseTrace;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={cn(
        'cursor-pointer border-b border-slate-100 hover:bg-slate-50',
        selected && 'bg-emerald-50/60 hover:bg-emerald-50',
      )}
    >
      <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">{formatDateTime(trace.timestamp)}</td>
      <td className="px-3 py-2.5 text-slate-900">{trace.name ?? <span className="text-slate-400">senza nome</span>}</td>
      <td className="px-3 py-2.5">
        <code className="text-xs text-slate-500">{trace.id.length > 12 ? trace.id.slice(0, 8) + '…' + trace.id.slice(-4) : trace.id}</code>
      </td>
      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{formatLatency(trace.latencyMs)}</td>
      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{formatCost(trace.totalCost)}</td>
      <td className="px-3 py-2.5">
        {trace.hasError ? (
          <Badge variant="danger" size="sm">errore</Badge>
        ) : (
          <Badge variant="success" size="sm">ok</Badge>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {trace.tags.slice(0, 3).map(t => (
            <Badge key={t} variant="outline" size="sm">{t}</Badge>
          ))}
          {trace.tags.length > 3 && <span className="text-xs text-slate-400">+{trace.tags.length - 3}</span>}
        </div>
      </td>
    </tr>
  );
}

function TraceDetailView({ detail }: { detail: LangfuseTraceDetail }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Metric label="Quando" value={formatDateTime(detail.timestamp)} icon={<Clock className="w-3.5 h-3.5" />} />
        <Metric label="Nome" value={detail.name ?? '—'} />
        <Metric label="Latenza" value={formatLatency(detail.latencyMs)} />
        <Metric label="Costo totale" value={formatCost(detail.totalCost)} />
        <Metric label="Session ID" value={detail.sessionId ?? '—'} mono />
        <Metric label="User ID" value={detail.userId ?? '—'} mono />
        <Metric label="Observations" value={String(detail.observationCount ?? detail.observations.length)} />
        <Metric
          label="Errori"
          value={detail.hasError ? 'Si' : 'No'}
          tone={detail.hasError ? 'danger' : 'success'}
        />
      </div>

      {detail.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {detail.tags.map(t => <Badge key={t} variant="outline" size="sm">{t}</Badge>)}
        </div>
      )}

      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Input / Output trace
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-200">
          <JsonBlock title="Input" value={detail.input} />
          <JsonBlock title="Output" value={detail.output} />
        </div>
      </details>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cosa ha fatto l&apos;agente ({detail.observations.length})</h4>
        {detail.observations.length === 0 ? (
          <p className="text-sm text-slate-500">Nessuna observation registrata su questa trace.</p>
        ) : (
          <ol className="space-y-2">
            {detail.observations.map((obs, idx) => (
              <ObservationItem key={obs.id} obs={obs} index={idx + 1} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  mono,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'mt-0.5 text-sm font-medium break-all',
          mono ? 'font-mono text-xs' : '',
          tone === 'success' ? 'text-emerald-700' : tone === 'danger' ? 'text-red-700' : 'text-slate-900',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ObservationItem({ obs, index }: { obs: LangfuseObservation; index: number }) {
  const [open, setOpen] = useState(false);

  const variant = obs.level === 'ERROR'
    ? 'danger'
    : obs.level === 'WARNING'
      ? 'warning'
      : obs.type === 'GENERATION'
        ? 'info'
        : 'default';

  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
        <span className="text-xs text-slate-400 w-6 shrink-0">#{index}</span>
        <Badge variant={variant} size="sm">{obs.type.toLowerCase()}</Badge>
        <span className="text-sm font-medium text-slate-900 truncate">
          {obs.name ?? <span className="text-slate-400">(senza nome)</span>}
        </span>
        {obs.model && (
          <span className="hidden md:inline-flex items-center gap-1 text-xs text-slate-500 ml-2">
            <Cpu className="w-3 h-3" /> {obs.model}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-500 shrink-0">
          {obs.usage?.total != null && <span>{obs.usage.total} tok</span>}
          {obs.cost != null && <span>{formatCost(obs.cost)}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatLatency(obs.latencyMs)}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-3 space-y-3 bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <KV label="Inizio" value={formatDateTime(obs.startTime)} />
            <KV label="Fine" value={formatDateTime(obs.endTime)} />
            <KV label="Livello" value={obs.level} />
            <KV label="Token in" value={obs.usage?.input != null ? String(obs.usage.input) : '—'} />
            <KV label="Token out" value={obs.usage?.output != null ? String(obs.usage.output) : '—'} />
            <KV label="Token totali" value={obs.usage?.total != null ? String(obs.usage.total) : '—'} />
            <KV label="Costo" value={formatCost(obs.cost)} />
            <KV label="ID" value={obs.id} mono />
          </div>

          {obs.statusMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <strong>Errore:</strong> {obs.statusMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <JsonBlock title="Input" value={obs.input} />
            <JsonBlock title="Output" value={obs.output} />
          </div>

          {obs.metadata && Object.keys(obs.metadata).length > 0 && (
            <JsonBlock title="Metadata" value={obs.metadata} />
          )}
        </div>
      )}
    </li>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('text-slate-800 break-all', mono ? 'font-mono text-[11px]' : '')}>{value}</div>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value == null || (typeof value === 'object' && Object.keys(value as object).length === 0)) {
    return (
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</div>
        <div className="text-xs text-slate-400">vuoto</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      <pre className="bg-slate-900 text-slate-100 text-[11px] rounded-md p-2 overflow-auto max-h-72 whitespace-pre-wrap break-words">
        {jsonPretty(value)}
      </pre>
      <div className="mt-1 text-[10px] text-slate-400 truncate">{jsonPreview(value, 300)}</div>
    </div>
  );
}
