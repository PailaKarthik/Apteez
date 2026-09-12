import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/**
 * Wraps every successful response in the shared envelope
 * `{ success: true, data }`. Errors bypass interceptors and are shaped by
 * the global exception filter instead.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data: unknown) => ({ success: true as const, data: data ?? null })));
  }
}
