import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('integrations:whatsapp-campaigns');

export interface WhatsappCampaignRow {
  name: string;
  sentAt?: string;
  status?: string;
}

function resolveUrl(hubspotCompanyId: string): string | null {
  const { whatsappCampaignsApiUrl, whatsappCampaignsUrlTemplate } = config.accountBrief;
  if (whatsappCampaignsUrlTemplate) {
    return whatsappCampaignsUrlTemplate.replace(/\{hubspotId\}/g, encodeURIComponent(hubspotCompanyId));
  }
  if (!whatsappCampaignsApiUrl) return null;
  return `${whatsappCampaignsApiUrl.replace(/\/$/, '')}/companies/${encodeURIComponent(hubspotCompanyId)}/whatsapp-campaigns?limit=5`;
}

function normalize(raw: unknown): WhatsappCampaignRow[] {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const list = (Array.isArray(o.campaigns) ? o.campaigns : Array.isArray(o.data) ? o.data : o.items) as unknown[] | undefined;
  if (!Array.isArray(list)) return [];
  return list
    .map((item): WhatsappCampaignRow | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const name = String(r.name ?? r.title ?? r.campaignName ?? '').trim();
      if (!name) return null;
      return {
        name,
        sentAt: r.sentAt != null ? String(r.sentAt) : r.createdAt != null ? String(r.createdAt) : undefined,
        status: r.status != null ? String(r.status) : undefined,
      };
    })
    .filter((x): x is WhatsappCampaignRow => x !== null);
}

export async function fetchWhatsappCampaigns(hubspotCompanyId: string): Promise<WhatsappCampaignRow[]> {
  const url = resolveUrl(hubspotCompanyId);
  if (!url) return [];

  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = config.accountBrief.whatsappCampaignsApiKey;
  if (key) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) {
      logger.warn(`WhatsApp campaigns HTTP ${res.status}`, { url });
      return [];
    }
    const json: unknown = await res.json();
    return normalize(json);
  } catch (e) {
    logger.warn('WhatsApp campaigns fetch failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}
