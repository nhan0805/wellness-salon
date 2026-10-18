import { describe, expect, it } from 'vitest';
import {
  ApiResponseError,
  getApiErrorMessage,
  parseApiResponse,
} from '@/src/client/api-response';

describe('API response parsing', () => {
  it('turns a Cloudflare 1102 response into a retryable CPU error', async () => {
    const response = new Response('<html><title>1102 Worker exceeded resource limits</title></html>', {
      status: 500,
      headers: { 'cf-ray': 'test-ray-123' },
    });

    await expect(parseApiResponse(response, 'Action failed')).rejects.toMatchObject({
      name: 'ApiResponseError',
      retryable: true,
      requestId: 'test-ray-123',
      message: 'Cloudflare Worker reached its CPU limit. Please retry shortly. Reference: test-ray-123.',
    });
  });

  it('preserves structured API errors without parsing the body twice', async () => {
    const response = new Response(JSON.stringify({ error: 'Appointment is not ready' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });

    await expect(parseApiResponse(response, 'Action failed')).rejects.toMatchObject({
      name: 'ApiResponseError',
      status: 409,
      message: 'Appointment is not ready',
    });
  });

  it('keeps incorrect PIN messages clear without exposing request references', async () => {
    const response = new Response(JSON.stringify({ error: 'Incorrect PIN. Please try again.' }), {
      status: 409,
      headers: { 'content-type': 'application/json', 'x-request-id': 'pin-request-123' },
    });

    await expect(parseApiResponse(response, 'Action failed')).rejects.toMatchObject({
      requestId: 'pin-request-123',
      message: 'Incorrect PIN. Please try again.',
    });
  });

  it('does not leak browser-specific parsing errors to users', () => {
    expect(getApiErrorMessage(new Error('The string did not match the expected pattern'), 'Failed')).toBe(
      'The request could not be completed. Check the connection and try again.',
    );
    expect(new ApiResponseError('server error', { status: 500 }).retryable).toBe(false);
  });
});
