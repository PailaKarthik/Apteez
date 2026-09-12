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
