import { auth } from '@/src/server/auth';
import { getDbBoardState } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';
import { makeAccountViewer } from '@/src/domain/viewer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const MAX_STREAM_LIFETIME_MS = 10 * 60 * 1000;

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
    let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const stream = new ReadableStream({
      start(controller) {
        const cleanup = () => {
          if (keepAlive) clearInterval(keepAlive);
          if (lifetimeTimer) clearTimeout(lifetimeTimer);
        };
        const close = () => {
          if (closed) return;
          closed = true;
          cleanup();
          controller.close();
        };
        const send = (event: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            close();
          }
        };
        send({ type: 'board.snapshot', payload: initialBoard });
        keepAlive = setInterval(() => send({ type: 'keepalive', at: new Date().toISOString() }), 15_000);
        lifetimeTimer = setTimeout(close, MAX_STREAM_LIFETIME_MS);
        request.signal.addEventListener('abort', close, { once: true });
        if (request.signal.aborted) close();
      },
      cancel() {
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        if (lifetimeTimer) clearTimeout(lifetimeTimer);
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
  });
}
