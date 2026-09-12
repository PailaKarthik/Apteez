import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  email: z.string().email(),
  page: z.coerce.number().int().min(1).default(1),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed (and coerced) value when valid', () => {
    expect(pipe.transform({ email: 'a@b.com' }, { type: 'body' })).toEqual({
      email: 'a@b.com',
      page: 1,
    });
  });

  it('throws a VALIDATION_ERROR with field details when invalid', () => {
    let caught: unknown;
    try {
      pipe.transform({ email: 'not-an-email', page: 0 }, { type: 'body' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    const body = (caught as BadRequestException).getResponse() as {
      code: string;
      details: Array<{ field: string; message: string }>;
    };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details[0]?.field).toBeDefined();
  });
});
