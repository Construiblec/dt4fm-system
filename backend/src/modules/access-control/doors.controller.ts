import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import { DoorAction } from './access-iot.types';
import { requireCavIdentity } from './cav-session';
import { RemoteOpenDto } from './dto/remote-open.dto';
import { RemoteOpenService } from './remote-open.service';

@ApiTags('Control de accesos')
@ApiSecurity('authorization')
@Controller('access-doors')
export class DoorsController {
  constructor(
    private readonly remoteOpen: RemoteOpenService,
    private readonly sessionRoleService: SessionRoleService,
  ) {}

  @Get()
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Puertas por edificio, con su estado y la última apertura remota',
  })
  @ApiResponse({ status: 200, description: 'Listado de puertas.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({ status: 503, description: 'La VPS de accesos no respondió.' })
  async list(
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    await requireCavIdentity(
      this.sessionRoleService,
      authorization,
      sessionToken,
    );

    return { data: await this.remoteOpen.listDoors() };
  }

  @Post(':deviceId/open')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Abrir una puerta a distancia',
    description:
      'Peatonal o vehicular. `outcome` puede ser `opened`, `failed` o `uncertain`: este último significa que la orden salió pero nadie confirmó si se abrió.',
  })
  @ApiResponse({ status: 200, description: 'Resultado de la apertura.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({ status: 404, description: 'La puerta no existe.' })
  @ApiResponse({
    status: 409,
    description: 'Ese requestId ya está en curso o es de otra persona.',
  })
  @ApiResponse({
    status: 429,
    description: 'La puerta se acaba de abrir; hay que esperar unos segundos.',
  })
  @ApiResponse({ status: 503, description: 'Apertura remota desactivada.' })
  open(
    @Param('deviceId') deviceId: string,
    @Body() dto: RemoteOpenDto,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.command(deviceId, 'open', dto, authorization, sessionToken);
  }

  @Post(':deviceId/close')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Bajar una barrera vehicular antes de que se cierre sola',
    description:
      'Solo puertas vehiculares: las peatonales se traban solas. `outcome` puede ser `closed`, `failed` o `uncertain`.',
  })
  @ApiResponse({ status: 200, description: 'Resultado del cierre.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({ status: 404, description: 'La puerta no existe.' })
  @ApiResponse({ status: 422, description: 'La puerta es peatonal.' })
  @ApiResponse({ status: 429, description: 'Se acaba de cerrar.' })
  @ApiResponse({ status: 503, description: 'Apertura remota desactivada.' })
  close(
    @Param('deviceId') deviceId: string,
    @Body() dto: RemoteOpenDto,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.command(deviceId, 'close', dto, authorization, sessionToken);
  }

  private async command(
    deviceId: string,
    action: DoorAction,
    dto: RemoteOpenDto,
    authorization: string,
    sessionToken: string,
  ) {
    const { username } = await requireCavIdentity(
      this.sessionRoleService,
      authorization,
      sessionToken,
    );

    const result = await this.remoteOpen.forStaff(
      deviceId,
      action,
      username,
      dto.requestId,
    );

    return { data: { ...result, deviceId } };
  }
}
