import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { getDbShopConfig, type ShopOperationalConfig } from '@/src/server/services/prisma-operations';
import { updateDbShopConfig } from '@/src/server/services/admin-operations';
import { adminShopConfigSchema } from '@/src/server/validation';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/config', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    return NextResponse.json({ shop: await getDbShopConfig() });
  });
}

export async function PATCH(request: Request) {
  return observeApiRequest(request, 'PATCH /api/admin/config', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminShopConfigSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid salon settings', 422);
    try {
      const shop = await updateDbShopConfig({ ...(parsed.data as Omit<ShopOperationalConfig, 'stateVersion'>), stateVersion: 0, adminId: actor.id });
      return NextResponse.json({ shop });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update salon settings', 409);
    }
  });
}
