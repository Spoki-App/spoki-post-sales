import { ApiError } from '@/lib/api/middleware';
import type { AuthenticatedRequest } from '@/lib/api/middleware';
import { getOwnerByEmail, isAdminEmail, type HubSpotOwner } from '@/lib/config/owners';

export function requireOnboardingOwner(auth: AuthenticatedRequest): HubSpotOwner {
  const owner = getOwnerByEmail(auth.email);
  if (!owner) {
    throw new ApiError(403, 'Accesso riservato al team Onboarding');
  }
  if (isAdminEmail(auth.email)) return owner;
  return owner;
}
