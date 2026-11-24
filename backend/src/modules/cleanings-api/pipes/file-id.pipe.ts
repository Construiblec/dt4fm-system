import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

// Cubre hex, UUID, base64url y el `uuid;versión` de Alfresco; sin separadores de ruta.
const FILE_ID = /^[A-Za-z0-9_-][A-Za-z0-9_.;:=~-]{0,199}$/;

@Injectable()
export class FileIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (
      typeof value !== 'string' ||
      !FILE_ID.test(value) ||
      value.includes('..')
    ) {
      throw new BadRequestException(`${metadata.data ?? 'id'} no es válido`);
    }

    return value;
  }
}
