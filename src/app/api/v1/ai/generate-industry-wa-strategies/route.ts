import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
} from '@/lib/api/middleware';
import { generateIndustryWhatsAppStrategies } from '@/lib/services/gemini';

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = (await request.json()) as {
      industryLabel?: string;
      clientCount?: number | null;
      industryHubspotKey?: string | null;
    };

    const industryLabel = (body.industryLabel ?? '').trim();
    if (!industryLabel) throw new ApiError(400, 'Parametro industryLabel obbligatorio');

    const clientCount =
      body.clientCount === null || body.clientCount === undefined
        ? null
        : Number(body.clientCount);

    const industryHubspotKey =
      body.industryHubspotKey === undefined ? null : body.industryHubspotKey;

    const data = await generateIndustryWhatsAppStrategies({
      industryLabel,
      clientCount: Number.isFinite(clientCount) ? (clientCount as number) : null,
      industryHubspotKey,
    });

    return createSuccessResponse({ data });
  } catch (error) {
    return createErrorResponse(error, 'Generazione strategie WhatsApp non riuscita');
  }
});
