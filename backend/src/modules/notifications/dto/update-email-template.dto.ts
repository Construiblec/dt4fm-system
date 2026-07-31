import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateEmailTemplateDto {
  @IsString()
  @IsOptional()
  Code?: string;

  @IsString()
  @IsOptional()
  Description?: string;

  @IsString()
  @IsOptional()
  Subject?: string;

  @IsString()
  @IsOptional()
  Body?: string;

  @IsBoolean()
  @IsOptional()
  Active?: boolean;
}
