import { HUBSPOT_COMPANY_PROPS } from '@/lib/config/hubspot-props';
import { pgQuery } from '@/lib/db/postgres';
import { fetchMarketingMindFeatures } from '@/lib/integrations/marketing-mind';
import { fetchWhatsappCampaigns } from '@/lib/integrations/whatsapp-campaigns';
import { computeUsageBasedNps } from '@/lib/account-brief/usage-nps';

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function readRawProp(raw: Record<string, unknown>, key: string): string | null {
  return str(raw[key]);
}

export interface AccountBriefTicketRow {
  subject: string | null;
  status: string | null;
  priority: string | null;
  openedAt: string | null;
}

export interface AccountBriefContext {
  clientName: string;
  hubspotId: string;
  /** NPS stimato da utilizzo piattaforma (−100…+100), non da survey */
  usageBasedNps: { value: number; summary: string };
  /** Data proprietà HubSpot "Activation call" (sync in raw_properties) */
  activationCallDate: string | null;
  plan: string | null;
  mrr: number | null;
  churnRiskHubspot: string | null;
  healthScore: {
    score: number;
    status: string;
    onboardingPct: number;
    daysSinceLastContact: number | null;
    openTicketsCount: number;
    openHighTicketsCount: number;
    daysToRenewal: number | null;
  } | null;
  openTickets: AccountBriefTicketRow[];
  marketingMind: { active: string[]; inactive: string[] } | null;
  whatsappCampaigns: Array<{ name: string; sentAt?: string; status?: string }>;
}

export async function buildAccountBriefContext(clientId: string): Promise<AccountBriefContext> {
  const clientRes = await pgQuery<{
    name: string;
    hubspot_id: string;
    plan: string | null;
    mrr: string | null;
    churn_risk: string | null;
    raw_properties: Record<string, unknown> | null;
  }>(
    `SELECT name, hubspot_id, plan, mrr, churn_risk, raw_properties
     FROM clients WHERE id = $1`,
    [clientId]
  );

  const row = clientRes.rows[0];
  if (!row) throw new Error('Client not found');

  const raw = row.raw_properties ?? {};
  const activationCallDate = readRawProp(raw, HUBSPOT_COMPANY_PROPS.activationCall);

  const healthRes = await pgQuery<{
    score: number;
    status: string;
    onboarding_pct: number;
    days_since_last_contact: number | null;
    open_tickets_count: number;
    open_high_tickets_count: number;
    days_to_renewal: number | null;
  }>(
    `SELECT score, status, onboarding_pct, days_since_last_contact,
            open_tickets_count, open_high_tickets_count, days_to_renewal
     FROM health_scores WHERE client_id = $1 ORDER BY calculated_at DESC LIMIT 1`,
    [clientId]
  );

  const hs = healthRes.rows[0];

  const engRes = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM engagements
     WHERE client_id = $1 AND occurred_at >= NOW() - INTERVAL '30 days'`,
    [clientId]
  );
  const engagementsLast30Days = parseInt(engRes.rows[0]?.n ?? '0', 10) || 0;

  const ticketsRes = await pgQuery<{
    subject: string | null;
    status: string | null;
    priority: string | null;
    opened_at: string | null;
  }>(
    `SELECT subject, status, priority, opened_at
     FROM tickets
     WHERE client_id = $1
       AND closed_at IS NULL
       AND (status IS NULL OR status NOT IN ('closed', '4'))
     ORDER BY opened_at DESC NULLS LAST
     LIMIT 15`,
    [clientId]
  );

  const [mm, wa] = await Promise.all([
    fetchMarketingMindFeatures(row.hubspot_id),
    fetchWhatsappCampaigns(row.hubspot_id),
  ]);

  const usageBasedNps = computeUsageBasedNps({
    healthScore0to100: hs?.score ?? null,
    onboardingPct0to100: hs ? Number(hs.onboarding_pct) || 0 : null,
    daysSinceLastContact: hs?.days_since_last_contact ?? null,
    openTicketsCount: hs?.open_tickets_count ?? 0,
    openHighTicketsCount: hs?.open_high_tickets_count ?? 0,
    engagementsLast30Days,
  });

  return {
    clientName: row.name,
    hubspotId: row.hubspot_id,
    usageBasedNps,
    activationCallDate,
    plan: row.plan,
    mrr: row.mrr ? parseFloat(row.mrr) : null,
    churnRiskHubspot: row.churn_risk,
    healthScore: hs
      ? {
          score: hs.score,
          status: hs.status,
          onboardingPct: Number(hs.onboarding_pct) || 0,
          daysSinceLastContact: hs.days_since_last_contact,
          openTicketsCount: hs.open_tickets_count,
          openHighTicketsCount: hs.open_high_tickets_count,
          daysToRenewal: hs.days_to_renewal,
        }
      : null,
    openTickets: ticketsRes.rows.map(t => ({
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      openedAt: t.opened_at,
    })),
    marketingMind: mm,
    whatsappCampaigns: wa,
  };
}
