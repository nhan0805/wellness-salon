import { handleAuthRequest } from '@/src/server/auth';

export async function GET(request: Request) {
  return handleAuthRequest(request);
}

export async function POST(request: Request) {
  return handleAuthRequest(request);
}
