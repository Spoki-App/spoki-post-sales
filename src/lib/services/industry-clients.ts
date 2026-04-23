import { HUBSPOT_OWNERS } from '@/lib/config/owners';

export function formatHubspotOwnerName(ownerId: string | null | undefined): string | null {
  if (!ownerId) return null;
  const o = HUBSPOT_OWNERS[ownerId];
  return o ? `${o.firstName} ${o.lastName}` : null;
}

/**
 * Primary CSM-facing owner: Customer Success owner, then company (account) owner.
 */
export function resolveCsmDisplay(
  successOwnerId: string | null,
  companyOwnerId: string | null
): { ownerId: string | null; label: string | null } {
  const id = successOwnerId ?? companyOwnerId ?? null;
  return { ownerId: id, label: formatHubspotOwnerName(id) };
}

export function industryGroupLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return 'Non classificato';
  return String(raw).trim();
}

export function industryGroupKey(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}
