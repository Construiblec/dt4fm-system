import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadAttachmentDto {
  @IsOptional()
  @IsIn(['Document', 'Image', 'Photo', 'Signature'])
  category?: 'Document' | 'Image' | 'Photo' | 'Signature' = 'Photo';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
