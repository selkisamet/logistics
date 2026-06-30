import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

/**
 * @lojistik/shared içindeki zod şemalarını NestJS pipe olarak kullanır.
 * Kullanım: @Body(new ZodValidationPipe(createCustomerSchema)) dto: CreateCustomerInput
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Doğrulama hatası',
          errors: err.flatten().fieldErrors,
        });
      }
      throw err;
    }
  }
}
