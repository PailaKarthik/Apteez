import { Injectable, type NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@apteez/types';
import { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithRequestId } from '../context/request-context';

/**
 * Assigns (or propagates) a request id, echoes it back on every response
 * via `x-request-id`, and makes it available to the logger and error
 * payloads through AsyncLocalStorage.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    (req as Request & { id: string }).id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestId(requestId, () => next());
  }
}
