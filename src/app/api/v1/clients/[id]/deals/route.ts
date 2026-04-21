import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { SALES_PIPELINE, UPSELLING_PIPELINE, getStageLabel, getStageConfig, getPipelineLabel, getTotalStages } from '@/lib/config/deal-pipelines';
import { getOwnerName } from '@/lib/config/owners';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.id as string;
    if (!clientId) throw new ApiError(400, 'Missing client id');

    const res = await pgQuery<{
      id: string; hubspot_id: string; client_id: string; pipeline_id: string;
      stage_id: string; deal_name: string | null; amount: string | null;
      close_date: string | null; owner_id: string | null;
      stage_entered_at: string | null; created_at: string; updated_at: string;
    }>(
      `SELECT id, hubspot_id, client_id, pipeline_id, stage_id, deal_name,
              amount, close_date, owner_id, stage_entered_at, created_at, updated_at
       FROM deals
       WHERE client_id = $1 AND pipeline_id IN ($2, $3)
       ORDER BY updated_at DESC`,
      [clientId, SALES_PIPELINE.id, UPSELLING_PIPELINE.id]
    );

    function mapDeal(r: (typeof res.rows)[number]) {
      const cfg = getStageConfig(r.pipeline_id, r.stage_id);
      const daysInStage = r.stage_entered_at
        ? Math.floor((Date.now() - new Date(r.stage_entered_at).getTime()) / 86_400_000)
        : null;

      return {
        id: r.id,
        hubspotId: r.hubspot_id,
        clientId: r.client_id,
        pipelineId: r.pipeline_id,
        pipelineLabel: getPipelineLabel(r.pipeline_id),
        stageId: r.stage_id,
        stageLabel: getStageLabel(r.pipeline_id, r.stage_id),
        stageOrder: cfg?.displayOrder ?? 0,
        totalStages: getTotalStages(r.pipeline_id),
        isClosed: cfg?.isClosed ?? false,
        isWon: cfg?.isWon ?? false,
        dealName: r.deal_name,
        amount: r.amount ? parseFloat(r.amount) : null,
        closeDate: r.close_date,
        ownerId: r.owner_id,
        ownerName: r.owner_id ? getOwnerName(r.owner_id) : null,
        daysInStage,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }

    const sales = res.rows.filter(r => r.pipeline_id === SALES_PIPELINE.id).map(mapDeal);
    const upselling = res.rows.filter(r => r.pipeline_id === UPSELLING_PIPELINE.id).map(mapDeal);

    return createSuccessResponse({ data: { sales, upselling } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
