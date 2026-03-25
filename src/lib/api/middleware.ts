import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase/admin';
import { getLogger } from '@/lib/logger';
import { config } from '@/lib/config';
import { isEmailDomainAllowed } from '@/lib/utils/domain-validation';

const logger = getLogger('api:middleware');

export interface AuthenticatedRequest {
  userId: string;
  email?: string;
  name?: string;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createErrorResponse(error: unknown, defaultMessage = 'Internal server error'): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
  }
  logger.error('Unhandled error', error);
  const message = config.app.isDevelopment && error instanceof Error ? error.message : defaultMessage;
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export function createSuccessResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}

export async function authenticateRequest(request: NextRequest): Promise<AuthenticatedRequest> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Missing or invalid authorization header');
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) throw new ApiError(401, 'Missing token');

  if (token.startsWith('dev-user-')) {
    if (!config.devLogin.enabled) {
      throw new ApiError(401, 'Dev login is disabled');
    }
    const userId = token.replace('dev-user-', '');
    const email = `${userId}@dev.local`;
    return { userId, email, name: userId };
  }

  try {
    const decoded = await verifyIdToken(token);
    if (decoded.email && !isEmailDomainAllowed(decoded.email)) {
      throw new ApiError(403, 'Access restricted to authorized email domains');
    }
    return { userId: decoded.uid, email: decoded.email, name: decoded.name };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, 'Invalid or expired token');
  }
}

export type RouteHandlerContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export function withAuth(
  handler: (request: NextRequest, auth: AuthenticatedRequest, context?: RouteHandlerContext) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: RouteHandlerContext): Promise<NextResponse> => {
    try {
      const auth = await authenticateRequest(request);
      return await handler(request, auth, context);
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}

export function verifyCronRequest(request: NextRequest): boolean {
  const secret = config.cron.secret;
  if (!secret) return true; // open in dev if not set
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}
