import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:metabase');

const TIMEOUT_MS = 30_000;

export async function runNativeQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const { url, apiKey, databaseId } = config.metabase;
  if (!apiKey) throw new Error('METABASE_API_KEY not configured');

  const queryPayload = JSON.stringify({
    database: databaseId,
    type: 'native',
    native: { query: sql },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/api/dataset/json`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `query=${encodeURIComponent(queryPayload)}`,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error('Metabase HTTP error', { status: response.status, detail: detail.slice(0, 300) });
      throw new Error(`Metabase returned ${response.status}`);
    }

    const data = await response.json();

    if (data && !Array.isArray(data) && (data as Record<string, unknown>).status === 'failed') {
      logger.error('Metabase query failed', { error: (data as Record<string, string>).error });
      throw new Error('Metabase query failed');
    }

    return data as T[];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a full Metabase table by MBQL source-table id.
 */
export async function fetchTable<T = Record<string, unknown>>(tableId: number): Promise<T[]> {
  const { url, apiKey, databaseId } = config.metabase;
  if (!apiKey) throw new Error('METABASE_API_KEY not configured');

  const queryPayload = JSON.stringify({
    database: databaseId,
    type: 'query',
    query: { 'source-table': tableId },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/api/dataset/json`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `query=${encodeURIComponent(queryPayload)}`,
    });

    if (!response.ok) {
      throw new Error(`Metabase returned ${response.status}`);
    }

    const data = await response.json();

    if (data && !Array.isArray(data) && (data as Record<string, unknown>).status === 'failed') {
      throw new Error('Metabase query failed');
    }

    return data as T[];
  } finally {
    clearTimeout(timer);
  }
}
