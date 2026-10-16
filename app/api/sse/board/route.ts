import { auth } from '@/src/server/auth';
import { getDbBoardState } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';
import { makeAccountViewer } from '@/src/domain/viewer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/sse/board', async () => {
    const session = await auth();
    const role = session?.user?.role;
    const isStaffViewer = ['STATION', 'ADMIN'].includes(role ?? '');
    const board = await getDbBoardState({ publicView: !isStaffViewer });
    const initialBoard = {
      ...board,
      viewerRole: isStaffViewer ? role : null,
      viewer: makeAccountViewer({
        email: session?.user?.email,
        displayName: (session?.user as { name?: string | null } | undefined)?.name,
        role: isStaffViewer ? role : null,
      }),
    };
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
