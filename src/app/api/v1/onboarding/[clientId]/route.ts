import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import type { OnboardingStep } from '@/types';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.clientId as string;
    if (!clientId) throw new ApiError(400, 'Missing clientId');

    const res = await pgQuery(
      `SELECT op.*, ot.name AS template_name, ot.description AS template_description
       FROM onboarding_progress op
       LEFT JOIN onboarding_templates ot ON ot.id = op.template_id
       WHERE op.client_id = $1`,
      [clientId]
    );

    return createSuccessResponse({ data: res.rows[0] ?? null });
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const POST = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.clientId as string;
    if (!clientId) throw new ApiError(400, 'Missing clientId');

    const body = await request.json() as { templateId: string };
    const tmplRes = await pgQuery('SELECT * FROM onboarding_templates WHERE id = $1', [body.templateId]);
    if (tmplRes.rows.length === 0) throw new ApiError(404, 'Template not found');

    const template = tmplRes.rows[0] as { id: string; steps: OnboardingStep[] };
    const steps = (template.steps as Omit<OnboardingStep, 'completedAt'>[]).map(s => ({ ...s, completedAt: null }));

    const res = await pgQuery(
      `INSERT INTO onboarding_progress (client_id, template_id, steps, pct_complete)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (client_id) DO UPDATE SET
         template_id = EXCLUDED.template_id,
         steps = EXCLUDED.steps,
         pct_complete = 0,
         started_at = NOW(),
         completed_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [clientId, body.templateId, JSON.stringify(steps)]
    );

    return createSuccessResponse({ data: res.rows[0] }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const PATCH = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.clientId as string;
    if (!clientId) throw new ApiError(400, 'Missing clientId');

    const body = await request.json() as { steps: OnboardingStep[] };
    const steps = body.steps;

    const totalSteps = steps.length;
    const completedSteps = steps.filter(s => s.completedAt).length;
    const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const completedAt = pct === 100 ? new Date() : null;

    const res = await pgQuery(
      `UPDATE onboarding_progress
       SET steps = $1, pct_complete = $2, completed_at = $3, updated_at = NOW()
       WHERE client_id = $4 RETURNING *`,
      [JSON.stringify(steps), pct, completedAt, clientId]
    );

    if (res.rows.length === 0) throw new ApiError(404, 'Onboarding progress not found for this client');
    return createSuccessResponse({ data: res.rows[0] });
  } catch (error) {
    return createErrorResponse(error);
  }
});
