import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** Run `fn` with the given request id available to logs and error payloads. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** Request id of the in-flight HTTP request, if any. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Run `fn` under a job's originating request id when the payload carries a
 * valid one. Workers use this so one request traces across API → queue →
 * worker → provider in logs, Sentry and usage rows.
 */
export function runWithJobRequestId<T>(data: { requestId?: unknown }, fn: () => T): T {
  const requestId = data.requestId;
  if (typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 128) {
    return storage.run({ requestId }, fn);
  }
  return fn();
}
