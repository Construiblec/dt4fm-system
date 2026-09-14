import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import { IssueGuestLinkDto } from './dto/issue-guest-link.dto';
import { GuestPortalService } from './guest-portal.service';
import {
  GUEST_TOKEN_HEADER,
  GuestTokenGuard,
} from './guards/guest-token.guard';
import type { RequestWithGuest } from './guards/guest-token.guard';

/**
 * Mismo criterio que `AccessControlController`: `SuperUser` es el administrador
 * de openMAINT y no existe un rol con code `Admin`. Emitir un enlace equivale a
 * entregar el PIN de una puerta, así que gobierna el mismo rol.
 */
const PORTAL_ADMIN_ROLES = ['SuperUser'];

@ApiTags('Portal del huésped')
@Controller('guest')
export class GuestPortalController {
  private readonly logger = new Logger(GuestPortalController.name);

  constructor(
    private readonly portal: GuestPortalService,
    private readonly sessionRoleService: SessionRoleService,
  ) {}

  @Post('magic-link')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'x-session-token', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Emitir el enlace de acceso de una estancia',
    description:
      'Endpoint interno de apoyo mientras el envío automático no existe. El ' +
      'enlace vale desde este momento hasta el fin del acceso de la estancia; ' +
      'el PIN solo se muestra dentro de la ventana de check-in a check-out.',
  })
  @ApiResponse({ status: 201, description: 'Enlace emitido.' })
  @ApiResponse({ status: 401, description: 'Falta la sesión de openMAINT.' })
  @ApiResponse({
    status: 403,
    description: 'Se requiere rol de administración.',
  })
  @ApiResponse({
    status: 404,
    description: 'La estancia no existe, está cancelada o ya terminó.',
  })
  @ApiResponse({
    status: 503,
    description: 'Falta configurar GUEST_MAGICLINK_SECRET.',
  })
  async issueLink(
    @Body() dto: IssueGuestLinkDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const username = await this.requireAdmin(sessionToken);

    const link = await this.portal.issueLink(dto.stayId);

    this.logger.log(
      `Enlace de la estancia ${link.stayId} emitido por ${username}`,
    );

    return link;
  }

  @Get('me')
  @UseGuards(GuestTokenGuard)
  @ApiHeader({
    name: GUEST_TOKEN_HEADER,
    description:
      'Token del enlace. También se acepta en `Authorization: Bearer` o, ' +
      'solo para la primera carga, en el query string `?token=`.',
    required: false,
  })
  @ApiOperation({
    summary: 'Datos del huésped que abrió el enlace',
    description:
      'Punto de entrada del portal. La identidad sale siempre del token, ' +
      'nunca de un parámetro de la petición. El PIN viene en `pin` solo ' +
      'dentro de la ventana de acceso; fuera de ella, `pinState` explica por qué no.',
  })
  @ApiResponse({ status: 200, description: 'Enlace válido.' })
  @ApiResponse({
    status: 401,
    description: 'Enlace inválido, cancelado o vencido.',
  })
  @ApiResponse({ status: 429, description: 'Demasiadas peticiones.' })
  getMe(@Req() request: RequestWithGuest) {
    return request.guest;
  }

  /** Devuelve el username, que es lo que se anota en el log. */
  private async requireAdmin(sessionToken: string): Promise<string> {
    const token = (sessionToken ?? '').trim();

    if (!token) {
      throw new UnauthorizedException('Falta la sesión de openMAINT');
    }

    const { role, username } =
      await this.sessionRoleService.resolveIdentity(token);

    if (!role || !PORTAL_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Se requiere rol de administración para emitir enlaces de huésped',
      );
    }

    return username;
  }
}
