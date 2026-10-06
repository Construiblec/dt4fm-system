import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
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
import { CAV_ROLES, requireIdentity } from '../access-control/cav-session';
import { CameraCatalogService } from './camera-catalog.service';
import { ListViewsQueryDto } from './dto/list-views.query.dto';
import { LiveSessionDto } from './dto/live-session.dto';
import { LiveSessionService } from './live-session.service';
import { VideoViewsService } from './video-views.service';

const HISTORY_ROLES = ['SuperUser'];

@ApiTags('Videovigilancia')
@ApiSecurity('authorization')
@Controller('cameras')
export class CamerasController {
  constructor(
    private readonly catalog: CameraCatalogService,
    private readonly liveSessions: LiveSessionService,
    private readonly views: VideoViewsService,
    private readonly sessionRoleService: SessionRoleService,
  ) {}

  @Get()
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Cámaras en vivo por edificio',
    description:
      '`reachable: false`: el gateway del edificio no respondió en la última consulta y sus cámaras son las conocidas. `stale: true`: la VPS no respondió.',
  })
  @ApiResponse({ status: 200, description: 'Catálogo de cámaras.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({
    status: 503,
    description: 'La VPS no respondió y no hay catálogo conocido.',
  })
  async list(
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    await this.requireViewer(authorization, sessionToken);

    return {
      data: {
        enabled: this.liveSessions.isEnabled(),
        ...(await this.catalog.overview()),
      },
    };
  }

  @Get('views')
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Historial de visualizaciones en vivo',
    description:
      'Quién pidió qué cámara y cuándo, de la más reciente a la más antigua.',
  })
  @ApiResponse({ status: 200, description: 'Visualizaciones.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol SuperUser.' })
  async history(
    @Query() query: ListViewsQueryDto,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    await requireIdentity(
      this.sessionRoleService,
      HISTORY_ROLES,
      'Se requiere rol de administración para consultar el historial de video',
      authorization,
      sessionToken,
    );

    return { data: { items: await this.views.list(query) } };
  }

  @Post(':cameraId/live-sessions')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Pedir una sesión de video en vivo',
    description:
      'Registra la visualización y devuelve la sesión de la VPS tal cual. El `ticket` vale para una sola oferta y 60 s: un reintento es otra sesión con otro `requestId`. Los errores llevan `code`.',
  })
  @ApiResponse({ status: 201, description: 'Sesión para negociar el video.' })
  @ApiResponse({ status: 400, description: '`cameraId` o cuerpo inválidos.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({
    status: 404,
    description: '`not_found`: la cámara ya no existe.',
  })
  @ApiResponse({
    status: 409,
    description: '`duplicate_request`: ese requestId ya se usó.',
  })
  @ApiResponse({
    status: 502,
    description:
      '`invalid_request`, `device_ambiguous` o respuesta fuera de contrato.',
  })
  @ApiResponse({
    status: 503,
    description:
      '`live_disabled`, `gateway_unreachable`, `live_capacity_reached` o `live_unavailable`.',
  })
  async start(
    @Param('cameraId') cameraId: string,
    @Body() dto: LiveSessionDto,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const { username } = await this.requireViewer(authorization, sessionToken);

    return {
      data: await this.liveSessions.start(cameraId, username, dto.requestId),
    };
  }

  private requireViewer(authorization: string, sessionToken: string) {
    return requireIdentity(
      this.sessionRoleService,
      CAV_ROLES,
      'Se requiere rol de Supervisor CAV para ver las cámaras',
      authorization,
      sessionToken,
    );
  }
}
