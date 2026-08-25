import { Body, Controller, Headers, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { SwitchRoleDto } from './dto/switch-role.dto';

/** La sesión viaja en `Authorization` sin esquema, o en `x-session-token`. */
const readSessionId = (authorization?: string, sessionToken?: string) =>
  (sessionToken ?? authorization ?? '').replace(/^Bearer\s+/i, '').trim();

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Login único para equipo y residentes. Devuelve `availableRoles` con ' +
      'todos los grupos de la cuenta: si trae más de uno, el cliente debe ' +
      'ofrecer elegir con cuál entrar.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Autenticación exitosa. Retorna la sesión, el rol activo, los roles ' +
      'disponibles y los identificadores resueltos.',
  })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas.' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('role')
  @ApiOperation({
    summary: 'Cambiar el rol activo de la sesión',
    description:
      'Cambia el grupo de la sesión ya emitida sin volver a pedir contraseña. ' +
      'openMAINT recalcula los privilegios reales sobre el mismo sessionId, ' +
      'así que no es un cambio cosmético. El rol pedido debe estar entre los ' +
      '`availableRoles` de la sesión.',
  })
  @ApiHeader({ name: 'Authorization', description: 'Session ID de openMAINT' })
  @ApiResponse({ status: 201, description: 'Sesión actualizada al nuevo rol.' })
  @ApiResponse({
    status: 401,
    description: 'Sesión no válida o el usuario no pertenece a ese rol.',
  })
  async switchRole(
    @Body() dto: SwitchRoleDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-session-token') sessionToken?: string,
  ) {
    return this.authService.switchRole(
      readSessionId(authorization, sessionToken),
      dto,
    );
  }

  @Put('password')
  @ApiOperation({
    summary: 'Cambiar la contraseña con sesión iniciada',
    description:
      'Válido para cualquier rol. Conserva los grupos de la cuenta, que es ' +
      'imprescindible en usuarios multi-rol.',
  })
  @ApiHeader({ name: 'Authorization', description: 'Session ID de openMAINT' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada.' })
  @ApiResponse({
    status: 400,
    description: 'La contraseña actual no coincide.',
  })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-session-token') sessionToken?: string,
  ) {
    return this.authService.changePassword(
      readSessionId(authorization, sessionToken),
      dto,
    );
  }
}
