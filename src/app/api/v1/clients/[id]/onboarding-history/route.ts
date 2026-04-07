import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { getHubSpotClient } from '@/lib/hubspot/client';

const HAPPY_PATH: { id: string; label: string }[] = [
  { id: '1', label: 'Deal Won' },
  { id: '1011192836', label: 'Activation Call Booked' },
  { id: '2', label: 'Activated' },
  { id: '2071331018', label: 'Training Booked' },
  { id: '3071245506', label: 'Training Done' },
  { id: '1709021391', label: 'Follow up Call' },
  { id: '2724350144', label: 'Follow up Call 2' },
  { id: '2724350145', label: 'Follow up Call 3' },
  { id: '1005076483', label: 'Post Onboarding' },
];

const ALL_STAGES: Record<string, string> = {
  '1': 'Deal Won', '1011192836': 'Activation Call Booked', '2702656701': 'Activation problems',
  '2712273122': 'Activation Failed', '2': 'Activated', '2071331018': 'Training Booked',
  '3071245506': 'Training Done', '4013788352': '10% Usage', '1709021391': 'Follow up Call',
  '2724350144': 'Follow up Call 2', '2724350145': 'Follow up Call 3', '1004962561': 'Utilizzo 60%',
  '1004887980': 'Never Activated', '1005076483': 'Post Onboarding', '4524518615': 'Free',
  '4524518616': 'Withdrawal',
};

const HAPPY_PATH_IDS = new Set(HAPPY_PATH.map(s => s.id));

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const clientRes = await pgQuery<{ hubspot_id: string }>(
      'SELECT hubspot_id FROM clients WHERE id = $1', [id]
    );
    if (clientRes.rows.length === 0) throw new ApiError(404, 'Client not found');

    const ticketRes = await pgQuery<{ hubspot_id: string; status: string }>(
      `SELECT hubspot_id, status FROM tickets WHERE client_id = $1 AND pipeline = '0' ORDER BY opened_at DESC LIMIT 1`, [id]
    );

    if (ticketRes.rows.length === 0) {
      return createSuccessResponse({ data: { steps: [], currentStage: null, issues: [] } });
    }

    const ticket = ticketRes.rows[0];

    const hs = getHubSpotClient();
    const response = await (hs as unknown as { http: { get: (url: string, opts: unknown) => Promise<{ data: unknown }> } }).http.get(
      `/crm/v3/objects/tickets/${ticket.hubspot_id}`,
      { params: { propertiesWithHistory: 'hs_pipeline_stage' } }
    );

    const data = response.data as {
      propertiesWithHistory?: {
        hs_pipeline_stage?: Array<{ value: string; timestamp: string }>;
      };
    };

    const history = data.propertiesWithHistory?.hs_pipeline_stage ?? [];
    const reachedStages = new Map<string, string>();
    for (const h of history) {
      if (!reachedStages.has(h.value)) {
        reachedStages.set(h.value, h.timestamp);
      }
    }

    const steps = HAPPY_PATH.map(step => ({
      id: step.id,
      label: step.label,
      completedAt: reachedStages.get(step.id) ?? null,
    }));

    const issues = [...reachedStages.entries()]
      .filter(([stageId]) => !HAPPY_PATH_IDS.has(stageId))
      .map(([stageId, timestamp]) => ({
        label: ALL_STAGES[stageId] ?? stageId,
        occurredAt: timestamp,
      }));

    return createSuccessResponse({
      data: {
        steps,
        currentStage: ALL_STAGES[ticket.status] ?? ticket.status,
        currentStageId: ticket.status,
        ticketHubspotId: ticket.hubspot_id,
        issues,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
