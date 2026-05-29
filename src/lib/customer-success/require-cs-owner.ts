import { ApiError } from '@/lib/api/middleware';
import type { AuthenticatedRequest } from '@/lib/api/middleware';
import { getOwnerByEmail, isCustomerSuccessTeamMember, type HubSpotOwner } from '@/lib/config/owners';

export function requireCsOwner(auth: AuthenticatedRequest): HubSpotOwner {
  const owner = getOwnerByEmail(auth.email);
  if (!owner || !isCustomerSuccessTeamMember(owner)) {
    throw new ApiError(403, 'Accesso riservato al team Customer Success');
  }
  return owner;
}
