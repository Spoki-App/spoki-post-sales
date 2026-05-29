import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:hubspot:properties:discover');

interface DiscoveredProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName: string | null;
  description: string | null;
  optionsCount: number;
  sampleOptions: Array<{ label: string; value: string }>;
}

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    if (!isAdminEmail(auth.email)) {
      throw new ApiError(403, 'Accesso riservato agli admin');
    }

    const url = new URL(request.url);
    const filterRaw = (url.searchParams.get('filter') ?? 'partner').trim().toLowerCase();
    if (!filterRaw) {
      throw new ApiError(400, 'Parametro filter mancante');
    }

    const props = await getHubSpotClient().getCompanyProperties();

    // Match contro name, label, description e singole option labels per intercettare
    // anche property dove il nome interno e' opaco (es. "spoki_xyz123") ma la label e' chiara.
    const matches: DiscoveredProperty[] = props
      .filter(p => {
        const haystack = [
          p.name,
          p.label,
          p.description ?? '',
          ...p.options.map(o => `${o.label} ${o.value}`),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(filterRaw);
      })
      .map(p => ({
        name: p.name,
        label: p.label,
        type: p.type,
        fieldType: p.fieldType,
        groupName: p.groupName,
        description: p.description,
        optionsCount: p.options.length,
        sampleOptions: p.options.slice(0, 10),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    logger.info(`Discovered ${matches.length} company properties for filter "${filterRaw}"`, {
      requestedBy: auth.email,
    });

    return createSuccessResponse({
      data: { filter: filterRaw, totalProperties: props.length, matches },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
