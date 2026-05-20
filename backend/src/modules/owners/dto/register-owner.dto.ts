import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class RegisterOwnerDto {
  @IsString()
  @IsNotEmpty()
  idNumber: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
