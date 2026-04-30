import Parser from 'rss-parser';

export type MarketFeedTier = 'critical' | 'relevant' | 'general';

/** Provenienza aggregata (utile per badge e priorità percepita). */
export type MarketFeedOrigin =
  | 'meta_newsroom'
  | 'meta_engineering'
  | 'meta_business'
  | 'meta_developers'
  | 'meta_corporate'
  | 'web_news'
  | 'web_press';

export type MarketFeedItem = {
  id: string;
  title: string;
  link: string;
  publishedAt: string | null;
  summary: string;
  sourceId: string;
  sourceLabel: string;
  origin: MarketFeedOrigin;
  tier: MarketFeedTier;
};

export type MarketFeedResult = {
  items: MarketFeedItem[];
  fetchedAt: string;
  sourceErrors: Array<{ sourceId: string; label: string; message: string }>;
};

export type MarketPortal = {
  id: string;
  section: 'whatsapp' | 'meta_dev' | 'policy' | 'news_product';
  title: string;
  description: string;
  url: string;
};

/** Link diretti a hub ufficiali (nessun RSS): sempre raggiungibili dalla pagina. */
export const MARKET_PORTAL_LINKS: MarketPortal[] = [
  {
    id: 'wa-platform',
    section: 'whatsapp',
    title: 'WhatsApp Business Platform',
    description: 'Panoramica Cloud API, Business Management e ciclo di vita dei numeri.',
    url: 'https://developers.facebook.com/docs/whatsapp/overview',
  },
  {
    id: 'wa-changelog',
    section: 'whatsapp',
    title: 'Changelog ufficiale piattaforma',
    description: 'Modifiche prodotto, API e comportamenti WhatsApp Business.',
    url: 'https://developers.facebook.com/docs/whatsapp/business-platform/changelog',
  },
  {
    id: 'wa-pricing',
    section: 'whatsapp',
    title: 'Pricing conversazioni',
    description: 'Modello di costo per conversazioni e categorie messaggi.',
    url: 'https://developers.facebook.com/docs/whatsapp/pricing',
  },
  {
    id: 'wa-templates',
    section: 'whatsapp',
    title: 'Linee guida template messaggi',
    description: 'Requisiti per l’approvazione template Meta.',
    url: 'https://developers.facebook.com/docs/whatsapp/message-templates/guidelines',
  },
  {
    id: 'wa-cloud-api',
    section: 'whatsapp',
    title: 'Cloud API (overview)',
    description: 'Documentazione tecnica endpoint e flussi Cloud API.',
    url: 'https://developers.facebook.com/docs/whatsapp/cloud-api/overview',
  },
  {
    id: 'wa-policy-enforcement',
    section: 'whatsapp',
    title: 'Policy enforcement (dev)',
    description: 'Come Meta applica le policy sulla piattaforma business.',
    url: 'https://developers.facebook.com/docs/whatsapp/overview/policy-enforcement',
  },
  {
    id: 'wa-business-terms',
    section: 'policy',
    title: 'Termini commerciali WhatsApp Business',
    url: 'https://www.whatsapp.com/legal/business-terms/',
    description: 'Termini ufficiali per l’uso di WhatsApp Business.',
  },
  {
    id: 'wa-business-policy',
    section: 'policy',
    title: 'Business Policy (product)',
    url: 'https://www.whatsapp.com/legal/business-policy/',
    description: 'Regole su prodotti, messaggi e pratiche consentite.',
  },
  {
    id: 'wa-faq',
    section: 'whatsapp',
    title: 'Centro assistenza WhatsApp',
    url: 'https://faq.whatsapp.com/',
    description: 'FAQ per utenti e riferimenti aggiornati dal prodotto.',
  },
  {
    id: 'business-whatsapp-site',
    section: 'news_product',
    title: 'WhatsApp Business (sito prodotto)',
    url: 'https://business.whatsapp.com/',
    description: 'Presentazione prodotto e punti d’ingresso per le aziende.',
  },
  {
    id: 'meta-newsroom-web',
    section: 'news_product',
    title: 'Meta Newsroom',
    url: 'https://about.fb.com/news/',
    description: 'Comunicati stampa e annunci ufficiali Meta.',
  },
  {
    id: 'meta-developers-home',
    section: 'meta_dev',
    title: 'Meta for Developers',
    url: 'https://developers.facebook.com/',
    description: 'Home documentazione, app e prodotti Meta.',
  },
  {
    id: 'graph-changelog',
    section: 'meta_dev',
    title: 'Graph API — Changelog',
    url: 'https://developers.facebook.com/docs/graph-api/changelog',
    description: 'Versioni Graph API e breaking changes.',
  },
  {
    id: 'marketing-api',
    section: 'meta_dev',
    title: 'Marketing API',
    url: 'https://developers.facebook.com/docs/marketing-api/overview',
    description: 'Ads, campagne e integrazioni marketing.',
  },
  {
    id: 'dev-policies',
    section: 'policy',
    title: 'Developer Policies',
    url: 'https://developers.facebook.com/policy/',
    description: 'Regole per app e integrazioni su piattaforma Meta.',
  },
  {
    id: 'meta-privacy',
    section: 'policy',
    title: 'Informativa privacy Meta',
    url: 'https://www.facebook.com/privacy/policy/',
    description: 'Testo privacy policy Meta (account e servizi).',
  },
  {
    id: 'transparency-meta',
    section: 'policy',
    title: 'Transparency Meta',
    url: 'https://transparency.meta.com/',
    description: 'Report trasparenza, policy e governance.',
  },
];

export type MarketRssSource = {
  id: string;
  label: string;
  description: string;
  feedUrl: string;
  siteUrl: string;
  origin: MarketFeedOrigin;
};

/** Feed RSS/Atom effettivamente letti dal server. */
export const MARKET_RSS_SOURCES: MarketRssSource[] = [
  {
    id: 'meta-newsroom',
    label: 'Meta Newsroom',
    description: 'Comunicati e news ufficiali Meta.',
    feedUrl: 'https://about.fb.com/news/feed/',
    siteUrl: 'https://about.fb.com/news/',
    origin: 'meta_newsroom',
  },
  {
    id: 'meta-engineering',
    label: 'Engineering @ Meta',
    description: 'Post tecnici e infrastruttura Meta.',
    feedUrl: 'https://engineering.fb.com/feed/',
    siteUrl: 'https://engineering.fb.com/',
    origin: 'meta_engineering',
  },
  {
    id: 'meta-business',
    label: 'Meta for Business — News',
    description: 'Aggiornamenti marketing e strumenti per le aziende.',
    feedUrl: 'https://www.facebook.com/business/news/rss',
    siteUrl: 'https://www.facebook.com/business/news',
    origin: 'meta_business',
  },
  {
    id: 'meta-developers-blog',
    label: 'Meta for Developers — Blog',
    description: 'Annunci su Graph API, Marketing API, Threads, policy sviluppatori.',
    feedUrl: 'https://developers.facebook.com/blog/feed/',
    siteUrl: 'https://developers.facebook.com/blog/',
    origin: 'meta_developers',
  },
  {
    id: 'meta-com-blog',
    label: 'Blog Meta.com',
    description: 'Notizie corporate e consumer (anche VR, Ray-Ban Meta, Quest).',
    feedUrl: 'https://www.meta.com/blog/rss/',
    siteUrl: 'https://www.meta.com/blog/',
    origin: 'meta_corporate',
  },
  {
    id: 'google-news-wa-meta',
    label: 'Google News — WhatsApp & Meta (IT)',
    description: 'Rassegna automatica su keyword Cloud API / WhatsApp Business (Italia).',
    feedUrl:
      'https://news.google.com/rss/search?q=WhatsApp+Business+OR+WhatsApp+Meta+OR+%22Cloud+API%22+Meta&hl=it&gl=IT&ceid=IT%3Ait',
    siteUrl: 'https://news.google.com/',
    origin: 'web_news',
  },
  {
    id: 'google-news-meta-policy',
    label: 'Google News — Policy Meta / EU (IT)',
    description: 'Articoli su policy, GDPR, DMA e WhatsApp nei media.',
    feedUrl:
      'https://news.google.com/rss/search?q=Meta+policy+OR+Meta+GDPR+OR+Meta+DMA+OR+WhatsApp+regolatore&hl=it&gl=IT&ceid=IT%3Ait',
    siteUrl: 'https://news.google.com/',
    origin: 'web_news',
  },
  {
    id: 'techcrunch-whatsapp',
    label: 'TechCrunch — WhatsApp',
    description: 'Copertura tech internazionale sul tema WhatsApp.',
    feedUrl: 'https://techcrunch.com/tag/whatsapp/feed/',
    siteUrl: 'https://techcrunch.com/tag/whatsapp/',
    origin: 'web_press',
  },
  {
    id: 'theverge-meta',
    label: 'The Verge — Meta',
    description: 'Rassegna redazionale su Meta e prodotti collegati.',
    feedUrl: 'https://www.theverge.com/rss/meta/index.xml',
    siteUrl: 'https://www.theverge.com/meta/',
    origin: 'web_press',
  },
];

function classifyTier(title: string, content: string): MarketFeedTier {
  const t = `${title}\n${content}`.toLowerCase();
  if (
    /\b(policy|policies|enforcement|violation|gdpr|regulator|regulation|legal |lawsuit| fine |suspend|ban)\b/.test(
      t
    ) ||
    /\b(dma|digital markets|privacy update|terms of service|cookie|transparency)\b/.test(t)
  ) {
    return 'critical';
  }
  if (
    /\bwhatsapp\b|\bwaba\b|business messaging|cloud api|template message|whatsapp business|graph api|marketing api|messenger platform|instagram api|threads api|conversions api|business platform|ray-ban meta|quest meta\b/.test(
      t
    )
  ) {
    return 'relevant';
  }
  return 'general';
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function itemGuid(feedId: string, it: { link?: string; guid?: unknown; title?: string }): string {
  const rawGuid = it.guid;
  const g =
    typeof rawGuid === 'string'
      ? rawGuid.trim()
      : rawGuid && typeof rawGuid === 'object' && '_' in rawGuid
        ? String((rawGuid as { _: string })._).trim()
        : undefined;
  const l = it.link?.trim();
  const base = g || l || it.title?.slice(0, 120) || 'item';
  return `${feedId}:${base}`;
}

export async function fetchMarketMetaFeeds(): Promise<MarketFeedResult> {
  const parser = new Parser({
    timeout: 28_000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; SpokiMarketIntel/1.1; feed reader) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
    },
  });

  const sourceErrors: MarketFeedResult['sourceErrors'] = [];
  const rawItems: MarketFeedItem[] = [];

  await Promise.all(
    MARKET_RSS_SOURCES.map(async src => {
      try {
        const doc = await parser.parseURL(src.feedUrl);
        for (const it of doc.items ?? []) {
          const title = (it.title ?? 'Senza titolo').trim();
          const link = it.link?.trim() || '#';
          const content = stripHtml(
            (it.contentSnippet ?? it.content ?? it.summary ?? '').slice(0, 2000)
          );
          const pub = it.pubDate ?? it.isoDate ?? null;
          const tier = classifyTier(title, content);
          rawItems.push({
            id: itemGuid(src.id, it),
            title,
            link,
            publishedAt: pub,
            summary: content.length > 400 ? `${content.slice(0, 400)}…` : content,
            sourceId: src.id,
            sourceLabel: src.label,
            origin: src.origin,
            tier,
          });
        }
      } catch (e) {
        sourceErrors.push({
          sourceId: src.id,
          label: src.label,
          message: e instanceof Error ? e.message : 'Errore lettura feed',
        });
      }
    })
  );

  rawItems.sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return db - da;
  });

  const seenLinks = new Set<string>();
  const deduped: MarketFeedItem[] = [];
  for (const it of rawItems) {
    const key = it.link.replace(/\?[^#]*$/, '').split('#')[0] ?? it.link;
    if (key === '#' || seenLinks.has(key)) continue;
    seenLinks.add(key);
    deduped.push(it);
  }

  return {
    items: deduped.slice(0, 130),
    fetchedAt: new Date().toISOString(),
    sourceErrors,
  };
}
