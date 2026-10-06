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
    summary:
      'Puertas por edificio, con la fase de cada barrera y su último pulso',
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
    summary: 'Pulsar la barrera vehicular desde la fase «Abrir»',
    description:
      'Solo barreras vehiculares con tiempos medidos. Manda un pulso: `triggered` dice que salió, nada sobre la posición de la barrera. `uncertain`: pudo salir.',
  })
  @ApiResponse({ status: 200, description: 'Resultado del pulso.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({ status: 404, description: 'La puerta no existe.' })
  @ApiResponse({
    status: 409,
    description:
      'La fase de la barrera no admite «Abrir», o ese requestId ya está en curso o es de otra persona.',
  })
  @ApiResponse({
    status: 422,
    description:
      'No es una barrera vehicular o su edificio no tiene tiempos medidos.',
  })
  @ApiResponse({
    status: 429,
    description: 'La barrera recibió un pulso hace menos de 10 s.',
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
    summary: 'Pulsar la barrera vehicular desde la fase «Cerrar»',
    description:
      'El mismo pulso que «Abrir», solo dentro de la ventana de cierre. `outcome`: `triggered`, `failed` o `uncertain`.',
  })
  @ApiResponse({ status: 200, description: 'Resultado del pulso.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({ status: 404, description: 'La puerta no existe.' })
  @ApiResponse({ status: 409, description: 'Fuera de la ventana de cierre.' })
  @ApiResponse({
    status: 422,
    description:
      'No es una barrera vehicular o su edificio no tiene tiempos medidos.',
  })
  @ApiResponse({ status: 429, description: 'Pulso hace menos de 10 s.' })
  @ApiResponse({ status: 503, description: 'Apertura remota desactivada.' })
  close(
    @Param('deviceId') deviceId: string,
    @Body() dto: RemoteOpenDto,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.command(deviceId, 'close', dto, authorization, sessionToken);
  }

  @Post(':deviceId/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'authorization', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Liberar una barrera con un pulso sin confirmar',
    description:
      'Tras revisar la barrera, la devuelve a la fase «Abrir». Nunca se deduce la fase de un pulso incierto.',
  })
  @ApiResponse({ status: 200, description: 'Barrera liberada.' })
  @ApiResponse({ status: 403, description: 'Se requiere rol de CAV.' })
  @ApiResponse({ status: 404, description: 'La puerta no existe.' })
  @ApiResponse({
    status: 409,
    description: 'La barrera no tiene un pulso sin confirmar.',
  })
  async resolve(
    @Param('deviceId') deviceId: string,
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const { username } = await requireCavIdentity(
      this.sessionRoleService,
      authorization,
      sessionToken,
    );

    return { data: await this.remoteOpen.resolveUncertain(deviceId, username) };
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
