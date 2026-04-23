import { NextRequest } from 'next/server';
import { type RouteHandlerContext } from '@/lib/api/middleware';
import { isCallType } from '@/lib/services/meeting-analysis';
import { handleBatchRequest } from '@/lib/services/call-reports';

export async function POST(request: NextRequest, context: RouteHandlerContext) {
  const params = await context.params;
  const type = params.type as string | undefined;
  if (!isCallType(type)) {
    return new Response(
      JSON.stringify({ success: false, error: "type must be 'activation' or 'training'" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return handleBatchRequest(type, request);
}
