import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('integrations:marketing-mind');

export interface MarketingMindFeatures {
  active: string[];
  inactive: string[];
}

function resolveUrl(hubspotCompanyId: string): string | null {
  const { marketingMindApiUrl, marketingMindFeaturesUrlTemplate } = config.accountBrief;
  if (marketingMindFeaturesUrlTemplate) {
    return marketingMindFeaturesUrlTemplate.replace(/\{hubspotId\}/g, encodeURIComponent(hubspotCompanyId));
  }
  if (!marketingMindApiUrl) return null;
  return `${marketingMindApiUrl.replace(/\/$/, '')}/companies/${encodeURIComponent(hubspotCompanyId)}/features`;
}

function normalize(raw: unknown): MarketingMindFeatures | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const active =
    (Array.isArray(o.active) ? o.active : Array.isArray(o.activeFeatures) ? o.activeFeatures : []) as unknown[];
  const inactive =
    (Array.isArray(o.inactive) ? o.inactive : Array.isArray(o.inactiveFeatures) ? o.inactiveFeatures : []) as unknown[];
  return {
    active: active.map(String).filter(Boolean),
    inactive: inactive.map(String).filter(Boolean),
  };
}

export async function fetchMarketingMindFeatures(hubspotCompanyId: string): Promise<MarketingMindFeatures | null> {
  const url = resolveUrl(hubspotCompanyId);
  if (!url) return null;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = config.accountBrief.marketingMindApiKey;
  if (key) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) {
      logger.warn(`Marketing Mind HTTP ${res.status}`, { url });
      return null;
    }
    const json: unknown = await res.json();
    return normalize(json);
  } catch (e) {
    logger.warn('Marketing Mind fetch failed', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
