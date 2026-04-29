import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:nar:n8n');

interface PostBody {
  webhookUrl?: string;
  payload?: Record<string, unknown>;
}

function isAllowedHost(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const allow = config.nar.n8nWebhookAllowlist;
  if (allow.length === 0) {
    // Open in dev so the team può testare con webhook ngrok/locali. In prod richiediamo lo allowlist.
    return !config.app.isProduction;
  }
  const host = url.hostname.toLowerCase();
  return allow.includes(host);
}

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as PostBody;
    if (!body.webhookUrl || typeof body.webhookUrl !== 'string') {
      throw new ApiError(400, 'webhookUrl is required');
    }
    if (!body.payload || typeof body.payload !== 'object') {
      throw new ApiError(400, 'payload is required');
    }
    if (!isAllowedHost(body.webhookUrl)) {
      throw new ApiError(403, 'Webhook host not in NAR_N8N_WEBHOOK_ALLOWLIST');
    }

    const upstream = await fetch(body.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body.payload),
    });
    const text = await upstream.text();
    logger.info('Forwarded payload to n8n', { host: new URL(body.webhookUrl).hostname, status: upstream.status });
    return createSuccessResponse({ data: { status: upstream.status, body: text } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
