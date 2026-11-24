import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  ParseIntPipe,
} from '@nestjs/common';

@Injectable()
export class PositiveIntPipe extends ParseIntPipe {
  async transform(value: string, metadata: ArgumentMetadata): Promise<number> {
    const id = /^\d+$/.test(value) ? await super.transform(value, metadata) : 0;

    if (id <= 0 || !Number.isSafeInteger(id)) {
      throw new BadRequestException(
        `${metadata.data ?? 'id'} debe ser un entero positivo`,
      );
    }

    return id;
  }
}
