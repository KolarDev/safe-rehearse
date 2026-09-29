import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Validates a request body against a shared zod schema. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request body',
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
