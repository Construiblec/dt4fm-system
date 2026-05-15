import { IsString, IsNotEmpty } from 'class-validator';

export class ContactAdminDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
