import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordRecoveryService } from './password-recovery.service';
import { RateLimiterService } from './rate-limiter.service';

const HOUR_MS = 60 * 60 * 1000;
/** Solicitudes por IP y por hora. */
const MAX_PER_IP = 10;
/** Solicitudes por cuenta y por hora. */
const MAX_PER_ACCOUNT = 5;
/** Intentos de canje de token por IP y por hora. */
const MAX_RESETS_PER_IP = 20;

@ApiTags('Recuperación de contraseña')
@Controller('auth')
export class PasswordRecoveryController {
  constructor(
    private readonly passwordRecoveryService: PasswordRecoveryService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar el enlace para restablecer la contraseña',
    description:
      'Endpoint público. Responde siempre lo mismo, exista o no la cuenta, ' +
      'para no permitir enumerar usuarios.',
  })
  @ApiResponse({ status: 200, description: 'Solicitud recibida.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    const target = dto.usernameOrEmail.trim().toLowerCase();

    // Al superar el límite se devuelve la misma respuesta genérica en lugar de
    // un 429: un error distinto delataría que la cuenta existe.
    const allowed =
      this.rateLimiter.hit(`forgot:ip:${ip}`, MAX_PER_IP, HOUR_MS) &&
      this.rateLimiter.hit(
        `forgot:account:${target}`,
        MAX_PER_ACCOUNT,
        HOUR_MS,
      );

    if (!allowed) {
      return this.passwordRecoveryService.genericResponse();
    }

    return this.passwordRecoveryService.requestReset(dto.usernameOrEmail);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer la contraseña con el token del correo',
    description:
      'Endpoint público. El token vence en 1 hora y deja de ser válido en ' +
      'cuanto la contraseña cambia.',
  })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada.' })
  @ApiResponse({ status: 400, description: 'Token inválido o vencido.' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    // Aquí sí se puede responder 429: el token es opaco, así que el error no
    // revela nada sobre ninguna cuenta. Frena la fuerza bruta sobre el token.
    if (!this.rateLimiter.hit(`reset:ip:${ip}`, MAX_RESETS_PER_IP, HOUR_MS)) {
      throw new HttpException(
        'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.passwordRecoveryService.resetPassword(
      dto.token,
      dto.newPassword,
    );
  }
}
