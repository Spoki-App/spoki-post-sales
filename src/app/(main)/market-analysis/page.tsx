'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { marketApi } from '@/lib/api/client';
import type {
  MarketFeedItem,
  MarketFeedOrigin,
  MarketFeedResult,
  MarketFeedTier,
  MarketPortal,
} from '@/lib/market/meta-feed';
import { MARKET_PORTAL_LINKS, MARKET_RSS_SOURCES } from '@/lib/market/meta-feed';
import { cn } from '@/lib/utils/cn';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Bell,
  BellOff,
  BookOpen,
  Loader2,
  Radio,
  Rss,
  RefreshCw,
  ExternalLink,
  Landmark,
  Megaphone,
  MessageCircle,
  Wrench,
} from 'lucide-react';

const POLL_MS = 120_000;

const PORTAL_SECTIONS: Record<MarketPortal['section'], { title: string; Icon: typeof MessageCircle }> = {
  whatsapp: { title: 'WhatsApp & Business messaging', Icon: MessageCircle },
  meta_dev: { title: 'Meta for Developers', Icon: Wrench },
  policy: { title: 'Policy, legal & trasparenza', Icon: Landmark },
  news_product: { title: 'Newsroom & prodotto', Icon: Megaphone },
};

const PORTAL_ORDER: MarketPortal['section'][] = ['whatsapp', 'meta_dev', 'policy', 'news_product'];

function tierBadge(t: MarketFeedTier) {
  if (t === 'critical') return { text: 'Policy / regolamento', className: 'bg-rose-100 text-rose-800' };
  if (t === 'relevant') return { text: 'WhatsApp / API / prodotti', className: 'bg-violet-100 text-violet-800' };
  return { text: 'Contesto generale', className: 'bg-slate-100 text-slate-600' };
}

function originBadge(o: MarketFeedOrigin) {
  switch (o) {
    case 'meta_newsroom':
    case 'meta_engineering':
    case 'meta_business':
    case 'meta_developers':
    case 'meta_corporate':
      return { text: 'Fonte Meta (RSS)', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' };
    case 'web_news':
      return { text: 'Rassegna stampa (Google News)', className: 'border-sky-200 bg-sky-50 text-sky-900' };
    case 'web_press':
      return { text: 'Stampa tech internazionale', className: 'border-amber-200 bg-amber-50 text-amber-900' };
    default:
      return { text: 'Fonte', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

type StreamFilter = 'priority' | 'all' | 'official';

export default function MarketAnalysisPage() {
  const token = useAuthStore(s => s.token);
  const [items, setItems] = useState<MarketFeedItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<MarketFeedResult['sourceErrors']>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<StreamFilter>('priority');
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const firstFetchDoneRef = useRef(false);

  const load = useCallback(
    async (isManual: boolean) => {
      if (!token) return;
      if (isManual) setRefreshing(true);
      else if (!firstFetchDoneRef.current) setLoading(true);
      setError(null);
      try {
        const res = await marketApi.metaFeed(token);
        const data = res.data;
        if (!data) throw new Error('Risposta vuota');
        setItems(data.items);
        setFetchedAt(data.fetchedAt);
        setSourceErrors(data.sourceErrors);

        if (!firstFetchDoneRef.current) {
          for (const it of data.items) knownIdsRef.current.add(it.id);
          firstFetchDoneRef.current = true;
        } else if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          notifyEnabled
        ) {
          for (const it of data.items) {
            if (knownIdsRef.current.has(it.id)) continue;
            knownIdsRef.current.add(it.id);
            if (it.tier === 'general') continue;
            try {
              const tier = tierBadge(it.tier);
              new Notification(`${tier.text}: ${it.title}`, {
                body: it.summary.slice(0, 180) || undefined,
                tag: it.id,
                requireInteraction: it.tier === 'critical',
              });
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore di caricamento');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, notifyEnabled]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void load(false), POLL_MS);
    return () => clearInterval(id);
  }, [token, load]);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    setNotifyEnabled(Notification.permission === 'granted');
  }, []);

  async function requestNotify() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotifyEnabled(p === 'granted');
    if (p === 'granted') {
      for (const it of items) knownIdsRef.current.add(it.id);
    }
  }

  const notifyPermission =
    typeof Notification !== 'undefined' ? Notification.permission : 'denied';

  const visibleItems = useMemo(() => {
    let list = items;
    if (streamFilter === 'priority') {
      list = list.filter(i => i.tier === 'critical' || i.tier === 'relevant');
    } else if (streamFilter === 'official') {
      list = list.filter(i => i.origin !== 'web_news' && i.origin !== 'web_press');
    }
    return list;
  }, [items, streamFilter]);

  const portalsBySection = useMemo(() => {
    const m = new Map<MarketPortal['section'], MarketPortal[]>();
    for (const s of PORTAL_ORDER) m.set(s, []);
    for (const p of MARKET_PORTAL_LINKS) {
      m.get(p.section)!.push(p);
    }
    return m;
  }, []);

  if (!token) return null;

  return (
    <div className="min-h-full bg-[#f6f7f9]">
      <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-8 md:py-8">
        <header className="border-b border-slate-200/80 pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
                <Radio className="h-7 w-7 text-violet-600" />
                Analisi di mercato
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
                Punto unico per <strong>documentazione e policy WhatsApp</strong>,{' '}
                <strong>portali Meta</strong> e un flusso aggregato da RSS ufficiali (Newsroom, Developers,
                Business, blog Meta.com) più <strong>rassegna stampa</strong> selezionata (Google News IT,
                TechCrunch, The Verge). Ogni card ha link diretto alla fonte; qui sotto trovi anche gli URL dei
                feed grezzi per verificare o iscriverti dal tuo reader.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                Aggiorna ora
              </button>
              {typeof Notification !== 'undefined' && (
                <button
                  type="button"
                  disabled={notifyPermission === 'denied'}
                  onClick={() => {
                    if (notifyPermission === 'default') void requestNotify();
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm',
                    notifyEnabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : notifyPermission === 'denied'
                        ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {notifyPermission === 'denied' ? (
                    <>
                      <BellOff className="h-4 w-4" />
                      Notifiche bloccate
                    </>
                  ) : notifyEnabled ? (
                    <>
                      <Bell className="h-4 w-4" />
                      Notifiche attive
                    </>
                  ) : (
                    <>
                      <BellOff className="h-4 w-4" />
                      Attiva notifiche
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          {fetchedAt && (
            <p className="mt-3 text-xs text-slate-400">
              Ultimo aggiornamento stream:{' '}
              {formatDistanceToNow(new Date(fetchedAt), { addSuffix: true, locale: it })}
              <span className="mx-2">·</span>
              Polling ~{Math.round(POLL_MS / 60_000)} min (solo con pagina aperta)
            </p>
          )}
          {typeof Notification !== 'undefined' && notifyPermission === 'default' && (
            <p className="mt-2 text-xs text-amber-800">
              «Attiva notifiche» = avvisi desktop per nuovi articoli classificati{' '}
              <strong>policy</strong> o <strong>WhatsApp / API</strong> dopo il primo caricamento.
            </p>
          )}
          {typeof Notification !== 'undefined' && notifyPermission === 'denied' && (
            <p className="mt-2 text-xs text-slate-500">
              Notifiche browser disabilitate: abilitali per questo sito se vuoi gli avvisi in tempo reale.
            </p>
          )}
        </header>

        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <BookOpen className="h-4 w-4 text-violet-600" />
            Portali ufficiali (apri sul sito Meta / WhatsApp)
          </h2>
          <div className="mt-4 space-y-8">
            {PORTAL_ORDER.map(section => {
              const list = portalsBySection.get(section) ?? [];
              if (list.length === 0) return null;
              const { title, Icon } = PORTAL_SECTIONS[section];
              return (
                <div key={section}>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Icon className="h-4 w-4 text-violet-600" />
                    {title}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {list.map(p => (
                      <a
                        key={p.id}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-all hover:border-violet-200 hover:shadow-md"
                      >
                        <span className="font-medium text-slate-900 group-hover:text-violet-700">{p.title}</span>
                        <span className="mt-1 text-xs leading-snug text-slate-500">{p.description}</span>
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600">
                          Apri su meta.com / whatsapp.com
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <button
            type="button"
            onClick={() => setSourcesOpen(o => !o)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-slate-50/80"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Rss className="h-4 w-4 text-violet-600" />
              Fonti RSS / Atom monitorate ({MARKET_RSS_SOURCES.length}) — sito e feed
            </h2>
            <span className="text-xs font-medium text-violet-600">{sourcesOpen ? 'Nascondi' : 'Mostra'}</span>
          </button>
          {sourcesOpen && (
            <ul className="mt-3 space-y-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
              {MARKET_RSS_SOURCES.map(s => (
                <li
                  key={s.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 text-sm sm:px-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{s.label}</span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        originBadge(s.origin).className
                      )}
                    >
                      {originBadge(s.origin).text}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{s.description}</p>
                  <div className="mt-2 flex flex-col gap-1.5 text-xs sm:flex-row sm:flex-wrap sm:gap-x-4">
                    <a
                      href={s.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
                    >
                      Sito / hub
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={s.feedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-violet-700 hover:underline"
                    >
                      URL feed (RSS/Atom)
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Stream notizie</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            Le rassegna web sono automatismi Google o redazioni terze: usa sempre il link all’articolo per il
            contesto completo. Le fonti Meta sono feed ufficiali.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { id: 'priority' as const, label: 'In evidenza' },
              { id: 'official' as const, label: 'Solo RSS Meta ufficiali' },
              { id: 'all' as const, label: 'Tutto lo stream' },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStreamFilter(t.id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  streamFilter === t.id ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        )}

        {sourceErrors.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Alcune fonti non sono state lette (timeout o blocco remoto):</p>
            <ul className="mt-2 list-inside list-disc text-xs">
              {sourceErrors.map(e => (
                <li key={e.sourceId}>
                  {e.label}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          </div>
        ) : visibleItems.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            Nessun articolo in questa vista. Cambia filtro o attendi il prossimo aggiornamento.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {visibleItems.map(item => {
              const tb = tierBadge(item.tier);
              const ob = originBadge(item.origin);
              const src = MARKET_RSS_SOURCES.find(s => s.id === item.sourceId);
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', tb.className)}>
                      {tb.text}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        ob.className
                      )}
                    >
                      {ob.text}
                    </span>
                    <span className="text-xs text-slate-500">{item.sourceLabel}</span>
                    {item.publishedAt && (
                      <span className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: it })}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-slate-900 md:text-lg">{item.title}</h2>
                  {item.summary ? (
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.summary}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:underline"
                    >
                      Apri articolo
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {src && (
                      <a
                        href={src.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-600 hover:underline"
                      >
                        Pagina fonte
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
