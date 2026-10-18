export class ApiResponseError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly payload: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      requestId?: string | null;
      retryable?: boolean;
      payload?: unknown;
    },
  ) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = options.status;
    this.requestId = options.requestId ?? null;
    this.retryable = options.retryable ?? false;
    this.payload = options.payload ?? null;
  }
}

function getRequestReference(response: Response) {
  return response.headers.get('x-request-id') ?? response.headers.get('cf-ray');
}

function isWorkerCpuLimitResponse(status: number, body: string) {
  return (
    status === 1102 ||
    /\b1102\b|worker exceeded resource limits|exceeded cpu(?: time)? limit|exceeded cpu time/i.test(
      body,
    )
  );
}

function shouldHideRequestReference(message: string) {
  return /^incorrect PIN\b/i.test(message.trim());
}

function withRequestReference(message: string, requestId: string | null) {
  return requestId && !shouldHideRequestReference(message)
    ? `${message} Reference: ${requestId}.`
    : message;
}

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return '';
  const error = (payload as { error?: unknown }).error;
  return typeof error === 'string' ? error.trim() : '';
}

/**
 * Read an API response once and turn Cloudflare's HTML/empty 1102 response
 * into a useful application error instead of letting Response.json() throw a
 * browser-specific parsing message.
 */
export async function parseApiResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const body = await response.text();
  const requestId = getRequestReference(response);
  const workerCpuLimit = isWorkerCpuLimitResponse(response.status, body);

  if (workerCpuLimit) {
    throw new ApiResponseError(
      withRequestReference(
        'Cloudflare Worker reached its CPU limit. Please retry shortly.',
        requestId,
      ),
      { status: response.status, requestId, retryable: true },
    );
  }

  if (!body.trim()) {
    throw new ApiResponseError(
      withRequestReference(
        response.ok
          ? `${fallbackMessage}. The server returned an empty response.`
          : `${fallbackMessage} (HTTP ${response.status}). The server returned an empty response.`,
        requestId,
      ),
      { status: response.status, requestId, retryable: !response.ok },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new ApiResponseError(
      withRequestReference(
        `${fallbackMessage} (HTTP ${response.status}). The server returned an invalid response.`,
        requestId,
      ),
      { status: response.status, requestId, retryable: !response.ok },
    );
  }

  if (!response.ok) {
    throw new ApiResponseError(
      withRequestReference(
        getPayloadError(payload) || `${fallbackMessage} (HTTP ${response.status})`,
        requestId,
      ),
      { status: response.status, requestId, retryable: response.status >= 500, payload },
    );
  }

  return payload as T;
}

export function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiResponseError) return error.message;
  const message = error instanceof Error ? error.message.trim() : '';
  if (
    /the string did not match the expected pattern|failed to fetch|load failed|networkerror/i.test(
      message,
    )
  ) {
    return 'The request could not be completed. Check the connection and try again.';
  }
  if (/\b1102\b|worker exceeded resource limits|exceeded cpu(?: time)? limit/i.test(message)) {
    return 'Cloudflare Worker reached its CPU limit. Please retry shortly.';
  }
  return message || fallbackMessage;
}
