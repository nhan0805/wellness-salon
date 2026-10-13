import { auth } from '@/src/server/auth';
import { getDbBoardState } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/sse/board', async () => {
    const role = (await auth())?.user?.role;
    const initialBoard = await getDbBoardState({ publicView: !['STATION', 'ADMIN'].includes(role ?? '') });
    const encoder = new TextEncoder();
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        send({ type: 'board.snapshot', payload: initialBoard });
        keepAlive = setInterval(() => send({ type: 'keepalive', at: new Date().toISOString() }), 15_000);
        request.signal.addEventListener('abort', () => { if (keepAlive) clearInterval(keepAlive); controller.close(); });
      },
      cancel() { if (keepAlive) clearInterval(keepAlive); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
  });
}
