import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { type ZodSchema } from 'zod';

/**
 * Request validation with Zod — the single validation library for ApteeZ.
 * Schemas live in `@apteez/validation` so web forms and API endpoints
 * validate the exact same shape. Failures surface as VALIDATION_ERROR with
 * field-level details, matching the shared error contract.
 *
 * Usage (in a later prompt): `@Body(new ZodValidationPipe(schema))`.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
