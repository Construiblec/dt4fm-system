import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import { AuthorizationsService } from './authorizations.service';
import { requireCavIdentity } from './cav-session';
import { ChangeAccessLevelDto } from './dto/change-access-level.dto';
import { ListAuthorizationsQueryDto } from './dto/list-authorizations.dto';

@ApiTags('Control de accesos')
@ApiSecurity('authorization')
@Controller('access-authorizations')
export class AuthorizationsController {
  private readonly logger = new Logger(AuthorizationsController.name);

  constructor(
    private readonly authorizations: AuthorizationsService,
    private readonly sessionRoleService: SessionRoleService,
  ) {}

  @Get()
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Próximos check-ins con credencial vigente',
    description:
      'Solo aparecen las estancias que tienen credencial viva. Un edificio sin control de accesos nunca llega a tenerla, así que queda fuera por construcción — no por un filtro aparte.',
  })
  @ApiResponse({ status: 200, description: 'Listado de autorizaciones.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  async list(
    @Query() query: ListAuthorizationsQueryDto,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const sessionId = await this.requireCavRole(authorization, sessionToken);

    return {
      data: await this.authorizations.list(query.from, query.to, sessionId),
    };
  }

  @Get(':stayId')
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Detalle de una autorización',
    description: 'Nunca devuelve el PIN, ni en claro ni cifrado.',
  })
  @ApiResponse({ status: 200, description: 'Autorización encontrada.' })
  @ApiResponse({
    status: 404,
    description: 'No existe, o la estancia no tiene credencial vigente.',
  })
  async detail(
    @Param('stayId', ParseUUIDPipe) stayId: string,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const sessionId = await this.requireCavRole(authorization, sessionToken);

    return { data: await this.authorizations.detail(stayId, sessionId) };
  }

  @Post(':stayId/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Renovar el PIN de una autorización',
    description:
      'Genera un PIN nuevo y lo empuja a la puerta. **No lo devuelve**: el huésped lo ve en su portal la próxima vez que abra su enlace, que sigue siendo el mismo.',
  })
  @ApiResponse({ status: 200, description: 'PIN renovado.' })
  @ApiResponse({
    status: 400,
    description: 'La credencial no está vigente.',
  })
  async regenerate(
    @Param('stayId', ParseUUIDPipe) stayId: string,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const { sessionId, username } = await requireCavIdentity(
      this.sessionRoleService,
      authorization,
      sessionToken,
    );

    this.logger.log(`PIN renovado: estancia=${stayId} usuario=${username}`);

    return { data: await this.authorizations.regenerate(stayId, sessionId) };
  }

  @Post(':stayId/access-level')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Cambiar a qué habilita el PIN',
    description:
      'Asignación manual de acceso vehicular. El PIN **no** cambia: el dueño ya lo tiene anotado.',
  })
  @ApiResponse({ status: 200, description: 'Nivel actualizado.' })
  @ApiResponse({
    status: 400,
    description:
      'El edificio no tiene entrada vehicular, o el sujeto ya tiene otra credencial con ese ámbito.',
  })
  async changeAccessLevel(
    @Param('stayId', ParseUUIDPipe) stayId: string,
    @Body() dto: ChangeAccessLevelDto,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const sessionId = await this.requireCavRole(authorization, sessionToken);

    return {
      data: await this.authorizations.changeAccessLevel(
        stayId,
        dto.accessLevel,
        sessionId,
      ),
    };
  }

  /** La sesión validada se reusa en las llamadas a openMAINT que resuelven las unidades. */
  private async requireCavRole(
    authorization: string,
    sessionToken: string,
  ): Promise<string> {
    return (
      await requireCavIdentity(
        this.sessionRoleService,
        authorization,
        sessionToken,
      )
    ).sessionId;
  }
}
