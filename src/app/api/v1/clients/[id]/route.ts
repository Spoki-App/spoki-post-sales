import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const res = await pgQuery<{
      id: string; hubspot_id: string; name: string; domain: string | null;
      industry: string | null; city: string | null; country: string | null;
      phone: string | null;       lifecycle_stage: string | null; plan: string | null;
      mrr: string | null; contract_value: string | null; contract_start_date: string | null;
      renewal_date: string | null; onboarding_status: string | null;
      onboarding_stage: string | null; onboarding_stage_type: string | null;
      cs_owner_id: string | null; churn_risk: string | null;
      last_synced_at: string; created_at: string; updated_at: string;
    }>(
      `SELECT id, hubspot_id, name, domain, industry, city, country, phone,
              lifecycle_stage, plan, mrr, contract_value, contract_start_date,
              renewal_date, onboarding_status, onboarding_stage, onboarding_stage_type,
              cs_owner_id, churn_risk, last_synced_at, created_at, updated_at
       FROM clients WHERE id = $1`,
      [id]
    );

    const client = res.rows[0];
    if (!client) throw new ApiError(404, 'Client not found');

    // Latest health score
    const healthRes = await pgQuery<{
      score: number; status: string;
      score_last_contact: number; score_tickets: number;
      score_onboarding: number; score_renewal: number;
      days_since_last_contact: number | null; open_tickets_count: number;
      open_high_tickets_count: number; onboarding_pct: number;
      days_to_renewal: number | null; calculated_at: string;
    }>(
      `SELECT * FROM health_scores WHERE client_id = $1 ORDER BY calculated_at DESC LIMIT 1`,
      [id]
    );

    return createSuccessResponse({
      data: {
        id: client.id,
        hubspotId: client.hubspot_id,
        name: client.name,
        domain: client.domain,
        industry: client.industry,
        city: client.city,
        country: client.country,
        phone: client.phone,
        lifecycleStage: client.lifecycle_stage,
        plan: client.plan,
        mrr: client.mrr ? parseFloat(client.mrr) : null,
        contractValue: client.contract_value ? parseFloat(client.contract_value) : null,
        contractStartDate: client.contract_start_date,
        renewalDate: client.renewal_date,
        onboardingStatus: client.onboarding_status,
        csOwnerId: client.cs_owner_id,
        onboardingStage: client.onboarding_stage,
        onboardingStageType: client.onboarding_stage_type,
        churnRisk: client.churn_risk,
        lastSyncedAt: client.last_synced_at,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
        healthScore: healthRes.rows[0] ?? null,
      }
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
