import { NextResponse } from 'next/server';
import { pgQuery } from '@/lib/db/postgres';

const NEON_FREE_LIMIT_BYTES = 512 * 1024 * 1024;

export async function GET() {
  try {
    const res = await pgQuery<{ bytes: string }>(
      `SELECT pg_database_size(current_database()) AS bytes`
    );
    const bytes = parseInt(res.rows[0].bytes);
    const pct = Math.round((bytes / NEON_FREE_LIMIT_BYTES) * 100);
    return NextResponse.json({
      bytes,
      limitBytes: NEON_FREE_LIMIT_BYTES,
      pct: Math.min(pct, 100),
      pretty: `${(bytes / (1024 * 1024)).toFixed(0)} MB / ${NEON_FREE_LIMIT_BYTES / (1024 * 1024)} MB`,
    });
  } catch {
    return NextResponse.json({ bytes: 0, limitBytes: NEON_FREE_LIMIT_BYTES, pct: 0, pretty: 'N/D' });
  }
}
