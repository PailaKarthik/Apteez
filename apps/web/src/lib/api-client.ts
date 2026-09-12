import type { ApiErrorKind, ApiFieldError } from '@apteez/types';

/**
 * Typed API error. `kind` lets UI code branch without string-matching HTTP
 * semantics: validation (inline field errors), unauthorized / forbidden
 * (auth flows), not_found / conflict / rate_limit (domain handling), server
 * (retryable) and network (offline/timeout) failures.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly details?: ApiFieldError[];
  readonly requestId?: string;

  constructor(args: {
    kind: ApiErrorKind;
    status: number;
    code: string;
    message: string;
    details?: ApiFieldError[];
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.kind = args.kind;
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

/** Map an HTTP status (+ optional machine code) to an error kind. */
export function getErrorKind(status: number, code?: string): ApiErrorKind {
  if (status === 0) {
    return 'network';
  }
  if (status === 400 || code === 'VALIDATION_ERROR') {
    return 'validation';
  }
  if (status === 401) {
    return 'unauthorized';
  }
  if (status === 403) {
    return 'forbidden';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 409) {
    return 'conflict';
  }
  if (status === 429) {
    return 'rate_limit';
  }
  if (status >= 500) {
    return 'server';
  }
  return 'unknown';
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    case 501:
      return 'NOT_IMPLEMENTED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR';
  }
}

function fallbackMessage(status: number): string {
  switch (status) {
    case 400:
      return 'The request was invalid. Check the highlighted fields.';
    case 401:
      return 'You need to sign in to continue.';
    case 403:
      return 'You do not have access to this resource.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with the current state.';
    case 429:
      return 'Too many requests. Slow down and try again.';
    case 503:
      return 'The service is temporarily unavailable. Try again shortly.';
    default:
      return 'Something went wrong on our side. Try again shortly.';
  }
}

function isEnvelope(
  payload: unknown,
): payload is { success: boolean; data?: unknown; error?: unknown } {
  return typeof payload === 'object' && payload !== null && 'success' in payload;
}

function toApiError(status: number, payload: unknown, requestId?: string): ApiError {
  const record = (payload ?? {}) as {
    error?: { code?: unknown; message?: unknown; details?: unknown; requestId?: unknown };
    requestId?: unknown;
  };
  const error = record.error ?? {};
  const code = typeof error.code === 'string' ? error.code : statusToCode(status);
  const message =
    typeof error.message === 'string' && error.message ? error.message : fallbackMessage(status);
  const details = Array.isArray(error.details) ? (error.details as ApiFieldError[]) : undefined;
  const bodyRequestId =
    typeof record.requestId === 'string'
      ? record.requestId
      : typeof error.requestId === 'string'
        ? error.requestId
        : undefined;
  return new ApiError({
    kind: getErrorKind(status, code),
    status,
    code,
    message,
    details,
    requestId: requestId ?? bodyRequestId,
  });
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

/** API origin for full-page navigations (OAuth starts leave the SPA). */
export function apiBrowserUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Centralized API client. Unwraps the `{ success, data }` envelope, throws
 * typed ApiError on any failure, and always sends the request-id header
 * contract (`x-request-id` echoed back by the API).
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    throw new ApiError({
      kind: 'network',
      status: 0,
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut
        ? 'The request timed out. Check your connection and try again.'
        : 'Unable to reach the ApteeZ API. Check your connection and try again.',
    });
  } finally {
    clearTimeout(timer);
  }

  const responseRequestId = response.headers.get('x-request-id') ?? undefined;
  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    throw toApiError(response.status, payload, responseRequestId);
  }
  if (isEnvelope(payload)) {
    if (!payload.success) {
      throw toApiError(response.status, payload, responseRequestId);
    }
    return payload.data as T;
  }
  return payload as T;
}
