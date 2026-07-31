import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadAttachmentDto {
  @ApiPropertyOptional({
    description: 'Categoría del archivo adjunto',
    enum: ['Document', 'Image', 'Photo', 'Signature'],
    default: 'Photo',
    example: 'Photo',
  })
  @IsOptional()
  @IsIn(['Document', 'Image', 'Photo', 'Signature'])
  category?: 'Document' | 'Image' | 'Photo' | 'Signature' = 'Photo';

  @ApiPropertyOptional({
    description: 'Descripción corta del adjunto',
    maxLength: 200,
    example: 'Foto de cocina limpia',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
