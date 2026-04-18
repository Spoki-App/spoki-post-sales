import { NextRequest } from 'next/server';
import { handleListRequest } from '@/lib/services/call-reports';
import { isCallType } from '@/lib/services/meeting-analysis';

// Legacy endpoint kept for backward compatibility. The canonical route is
// /api/v1/call-reports/[type]/calls. This shim reads the legacy `type` query
// parameter (defaulting to 'activation') and delegates to the shared handler.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? 'activation';
  if (!isCallType(type)) {
    return new Response(
      JSON.stringify({ success: false, error: "type must be 'activation' or 'training'" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return handleListRequest(type, request);
}
