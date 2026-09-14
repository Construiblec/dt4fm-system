import {
  BadRequestException,
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import type { UploadedImage } from '../incidents/incidents.service';
import { CreateGuestIncidentDto } from './dto/create-guest-incident.dto';
import { IssueGuestLinkDto } from './dto/issue-guest-link.dto';
import { GuestIncidentService } from './guest-incident.service';
import { GuestLocationService } from './guest-location.service';
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

const MAX_INCIDENT_IMAGES = 6;
const MAX_INCIDENT_IMAGE_BYTES = 5 * 1024 * 1024;

@ApiTags('Portal del huésped')
@Controller('guest')
export class GuestPortalController {
  private readonly logger = new Logger(GuestPortalController.name);

  constructor(
    private readonly portal: GuestPortalService,
    private readonly sessionRoleService: SessionRoleService,
    private readonly location: GuestLocationService,
    private readonly incidents: GuestIncidentService,
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

  @Post('magic-link/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-session-token', description: 'Sesión de openMAINT' })
  @ApiOperation({
    summary: 'Enviar el enlace de acceso por el canal configurado',
    description:
      'Fuerza el envío aunque ya se haya hecho antes: es el camino para "el ' +
      'huésped dice que no le llegó". El envío normal es automático al ' +
      'proyectarse la reserva. La respuesta dice si salió y por dónde; nunca ' +
      'incluye el token.',
  })
  @ApiResponse({ status: 200, description: 'Resultado del envío.' })
  @ApiResponse({ status: 401, description: 'Falta la sesión de openMAINT.' })
  @ApiResponse({
    status: 403,
    description: 'Se requiere rol de administración.',
  })
  @ApiResponse({
    status: 404,
    description: 'La estancia no existe, está cancelada o ya terminó.',
  })
  async deliverLink(
    @Body() dto: IssueGuestLinkDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const username = await this.requireAdmin(sessionToken);

    const result = await this.portal.deliverLink(dto.stayId);

    this.logger.log(
      `Envío del enlace de la estancia ${dto.stayId} por ${username}: ${result.outcome}`,
    );

    return result;
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
  async getMe(@Req() request: RequestWithGuest) {
    const guest = request.guest!;
    // Solo aquí y no en el guard: el POST de incidencias no necesita los textos.
    const location = await this.location.lookup(
      guest.openmaintUnitId,
      guest.buildingId,
    );

    return { ...guest, ...location };
  }

  @Post('incidents')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GuestTokenGuard)
  @UseInterceptors(
    FilesInterceptor('images', MAX_INCIDENT_IMAGES, {
      limits: {
        fileSize: MAX_INCIDENT_IMAGE_BYTES,
        files: MAX_INCIDENT_IMAGES,
      },
      fileFilter: (_req, file, callback) => {
        const isImage = /^image\/(png|jpeg|jpg|webp)$/i.test(file.mimetype);

        callback(
          isImage
            ? null
            : new BadRequestException(
                'Solo se permiten imágenes PNG, JPG o WEBP.',
              ),
          isImage,
        );
      },
    }),
  )
  @ApiHeader({
    name: GUEST_TOKEN_HEADER,
    description: 'Token del enlace, o `Authorization: Bearer`.',
    required: false,
  })
  @ApiOperation({
    summary: 'Reportar una incidencia desde el portal del huésped',
    description:
      'Solo desde la hora del check-in. Edificio y unidad salen de la estancia ' +
      'del enlace; se ignoran si llegan en el cuerpo.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string', example: 'No sale agua caliente' },
        location: { type: 'string', example: 'Baño principal' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Hasta 6 imágenes PNG, JPG o WEBP de 5 MB',
        },
      },
      required: ['description'],
    },
  })
  @ApiResponse({ status: 201, description: 'Incidencia registrada.' })
  @ApiResponse({ status: 400, description: 'Datos o archivos inválidos.' })
  @ApiResponse({ status: 401, description: 'Enlace inválido o vencido.' })
  @ApiResponse({ status: 403, description: 'Todavía no empezó el check-in.' })
  @ApiResponse({
    status: 422,
    description: 'La reserva no está vinculada a un edificio.',
  })
  @ApiResponse({ status: 429, description: 'Demasiados reportes.' })
  @ApiResponse({ status: 502, description: 'openMAINT no respondió.' })
  @ApiResponse({ status: 503, description: 'Falta configurar el solicitante.' })
  reportIncident(
    @Req() request: RequestWithGuest,
    @Body() dto: CreateGuestIncidentDto,
    @UploadedFiles() images: UploadedImage[] = [],
  ) {
    return this.incidents.report(request.guest!, dto, images);
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
