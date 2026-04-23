import { getOwnerByEmail } from '@/lib/config/owners';

/**
 * SQL fragments for the same “portfolio” visibility rules as /api/v1/clients.
 * Mutates `conditions` and `params`; `idx` is the next PostgreSQL parameter index (1-based).
 */
export function applyPortfolioClientFilter(
  tableAlias: string,
  userEmail: string,
  viewAll: boolean,
  section: 'all' | 'onboarding' | 'company',
  conditions: string[],
  params: unknown[],
  startIdx: number
): number {
  let idx = startIdx;
  const owner = getOwnerByEmail(userEmail);
  const ownerFilter = viewAll ? null : (owner?.id ?? null);
  if (!ownerFilter) return idx;

  const c = tableAlias;
  if (section === 'onboarding') {
    conditions.push(`${c}.onboarding_owner_id = $${idx++}`);
    params.push(ownerFilter);
  } else if (section === 'company') {
    conditions.push(`${c}.cs_owner_id = $${idx++}`);
    params.push(ownerFilter);
  } else {
    conditions.push(
      `(${c}.cs_owner_id = $${idx} OR ${c}.onboarding_owner_id = $${idx} OR ${c}.success_owner_id = $${idx})`
    );
    params.push(ownerFilter);
    idx++;
  }
  return idx;
}
