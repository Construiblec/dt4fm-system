import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  Code: string;

  @IsString()
  @IsOptional()
  Description?: string;

  @IsString()
  @IsNotEmpty()
  Subject: string;

  @IsString()
  @IsNotEmpty()
  Body: string;

  @IsBoolean()
  @IsOptional()
  Active?: boolean;
}
