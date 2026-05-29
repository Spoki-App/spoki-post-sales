import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { requireOnboardingOwner } from '@/lib/onboarding/require-onboarding-owner';
import { ONBOARDING_HAPPY_PATH, ONBOARDING_PROBLEM_IDS, ONBOARDING_PIPELINE_ID, getOnboardingStageLabel } from '@/lib/config/onboarding-pipeline';
import { isAdminEmail } from '@/lib/config/owners';

export const GET = withAuth(async (_request: NextRequest, auth) => {
  try {
    const owner = requireOnboardingOwner(auth);
    const isAdmin = isAdminEmail(auth.email);
    const ownerCondition = isAdmin ? '' : 'AND c.onboarding_owner_id = $1';
    const ownerParams = isAdmin ? [] : [owner.id];

    const stageRows = await pgQuery<{ stage: string; cnt: string }>(
      `SELECT t.status AS stage, COUNT(DISTINCT c.id)::text AS cnt
       FROM clients c
       JOIN LATERAL (
         SELECT status FROM tickets
         WHERE client_id = c.id AND pipeline = '${ONBOARDING_PIPELINE_ID}'
         ORDER BY opened_at DESC LIMIT 1
       ) t ON true
       WHERE TRUE ${ownerCondition}
       GROUP BY t.status`,
      ownerParams
    );

    const byStage: Record<string, { label: string; count: number; type: 'happy' | 'problem' }> = {};
    let totalInOnboarding = 0;
    let problemCount = 0;
    let completedCount = 0;

    for (const row of stageRows.rows) {
      const count = parseInt(row.cnt);
      const label = getOnboardingStageLabel(row.stage) ?? row.stage;
      const isProblem = ONBOARDING_PROBLEM_IDS.has(row.stage);
      const isCompleted = row.stage === '1005076483';

      byStage[row.stage] = { label, count, type: isProblem ? 'problem' : 'happy' };
      totalInOnboarding += count;
      if (isProblem) problemCount += count;
      if (isCompleted) completedCount += count;
    }

    const happyPathStages = ONBOARDING_HAPPY_PATH.map(s => ({
      id: s.id,
      label: s.label,
      count: byStage[s.id]?.count ?? 0,
    }));

    const problemStages = Object.entries(byStage)
      .filter(([, v]) => v.type === 'problem')
      .map(([id, v]) => ({ id, label: v.label, count: v.count }));

    const renewalRows = await pgQuery<{ bucket: string; cnt: string; total_mrr: string }>(
      `SELECT
        CASE
          WHEN c.renewal_date <= CURRENT_DATE + INTERVAL '14 days' THEN '14d'
          WHEN c.renewal_date <= CURRENT_DATE + INTERVAL '30 days' THEN '30d'
          WHEN c.renewal_date <= CURRENT_DATE + INTERVAL '90 days' THEN '90d'
        END AS bucket,
        COUNT(*)::text AS cnt,
        COALESCE(SUM(c.mrr), 0)::text AS total_mrr
       FROM clients c
       WHERE c.renewal_date IS NOT NULL
         AND c.renewal_date <= CURRENT_DATE + INTERVAL '90 days'
         AND c.renewal_date >= CURRENT_DATE
         ${ownerCondition.replace('$1', isAdmin ? '$1' : `$${ownerParams.length + 1}`)}
       GROUP BY 1`,
      ownerParams
    );

    const renewals: Record<string, { count: number; totalMrr: number }> = {};
    for (const r of renewalRows.rows) {
      if (r.bucket) {
        renewals[r.bucket] = { count: parseInt(r.cnt), totalMrr: parseFloat(r.total_mrr) };
      }
    }

    return createSuccessResponse({
      data: {
        owner: `${owner.firstName} ${owner.lastName}`,
        totalInOnboarding,
        completedCount,
        problemCount,
        activeCount: totalInOnboarding - completedCount,
        happyPathStages,
        problemStages,
        renewals,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
