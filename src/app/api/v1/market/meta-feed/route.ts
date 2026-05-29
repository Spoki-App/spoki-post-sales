import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { fetchMarketMetaFeeds } from '@/lib/market/meta-feed';

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  void request;
  void auth.userId;
  try {
    const data = await fetchMarketMetaFeeds();
    return createSuccessResponse({ data });
  } catch (error) {
    return createErrorResponse(error, 'Impossibile caricare i feed Meta / WhatsApp');
  }
});
