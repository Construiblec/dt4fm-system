import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import { AccessIotGateway } from './access-iot.gateway';
import { BuildingCatalogService } from './building-catalog.service';
import { CredentialService } from './credential.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { ListCredentialsQueryDto } from './dto/list-credentials.dto';
import { RevokeCredentialDto } from './dto/revoke-credential.dto';
import { AccessCredential } from './entities/access-credential.entity';

/**
 * `SuperUser` es el administrador de openMAINT; no existe un rol con code
 * `Admin`. Limpieza no entra: estas rutas gobiernan puertas de edificio.
 */
const ACCESS_ADMIN_ROLES = ['SuperUser'];

@ApiTags('Control de accesos')
@ApiSecurity('x-session-token')
@Controller('access')
export class AccessControlController {
  private readonly logger = new Logger(AccessControlController.name);

  constructor(
    private readonly credentialService: CredentialService,
    private readonly catalog: BuildingCatalogService,
    private readonly iot: AccessIotGateway,
    private readonly sessionRoleService: SessionRoleService,
    private readonly configService: ConfigService,
  ) {}

  @Get('credentials')
  @ApiOperation({
    summary: 'Buscar credenciales',
    description: 'Nunca devuelve el PIN, ni cifrado ni en claro.',
  })
  @ApiHeader({ name: 'x-session-token', description: 'Sesión de openMAINT' })
  @ApiResponse({ status: 200, description: 'Listado de credenciales.' })
  async list(
    @Query() query: ListCredentialsQueryDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    await this.requireAdmin(sessionToken);

    const credentials = await this.credentialService.list(query);

    return { items: credentials.map((item) => this.toPublicView(item)) };
  }

  @Post('credentials')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Emitir una credencial manualmente',
    description:
      'Falla si el edificio no tiene control de accesos instalado: pedir un PIN donde no hay lector es un error del operador, no un caso a ignorar.',
  })
  @ApiHeader({ name: 'x-session-token', description: 'Sesión de openMAINT' })
  @ApiResponse({ status: 201, description: 'Credencial emitida.' })
  @ApiResponse({
    status: 400,
    description: 'Edificio sin cobertura o vigencia inválida.',
  })
  async create(
    @Body() dto: CreateCredentialDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const username = await this.requireAdmin(sessionToken);

    const credential = await this.credentialService.issue({
      subjectType: dto.subjectType,
      subjectRef: dto.subjectRef,
      displayName: dto.displayName,
      scope: dto.scope,
      buildingId: dto.buildingId,
      openmaintUnitId: dto.openmaintUnitId ?? null,
      validFrom: new Date(dto.validFrom),
      validTo: new Date(dto.validTo),
      issuedBy: `manual:${username}`,
    });

    return this.toPublicView(credential);
  }

  @Post('credentials/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar una credencial' })
  @ApiHeader({ name: 'x-session-token', description: 'Sesión de openMAINT' })
  @ApiResponse({ status: 200, description: 'Credencial revocada.' })
  @ApiResponse({ status: 404, description: 'La credencial no existe.' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeCredentialDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    await this.requireAdmin(sessionToken);

    return this.toPublicView(
      await this.credentialService.revoke(id, dto.reason),
    );
  }

  /**
   * Excepción temporal: sin portal del huésped no existe canal de entrega, así
   * que soporte necesita poder leer el PIN. Apagar con
   * `ACCESS_ALLOW_PIN_REVEAL=false` el día que el portal entre en servicio.
   */
  @Get('credentials/:id/pin')
  @ApiOperation({
    summary: 'Revelar el PIN de una credencial',
    description:
      'Deshabilitado por defecto. Cada lectura queda registrada con la credencial y el usuario.',
  })
  @ApiHeader({ name: 'x-session-token', description: 'Sesión de openMAINT' })
  @ApiResponse({ status: 200, description: 'PIN en claro.' })
  @ApiResponse({
    status: 403,
    description: 'La revelación está deshabilitada.',
  })
  async revealPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const username = await this.requireAdmin(sessionToken);

    if (this.configService.get<string>('ACCESS_ALLOW_PIN_REVEAL') !== 'true') {
      throw new ForbiddenException(
        'La revelación de PINes está deshabilitada en este entorno',
      );
    }

    const credential = await this.credentialService.findById(id);

    this.logger.warn(
      `PIN revelado: credencial=${credential.id} usuario=${username}`,
    );

    return {
      id: credential.id,
      pin: this.credentialService.revealPin(credential),
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Salud del control de accesos',
    description:
      'Un edificio incomunicado no produce errores visibles: las puertas siguen abriendo con lo ya sincronizado, pero altas y revocaciones dejan de aplicarse en silencio.',
  })
  @ApiHeader({ name: 'x-session-token', description: 'Sesión de openMAINT' })
  @ApiResponse({
    status: 200,
    description: 'Estado por edificio y credenciales en failed.',
  })
  async health(@Headers('x-session-token') sessionToken: string) {
    await this.requireAdmin(sessionToken);

    const [health, buildings, failedCredentials] = await Promise.all([
      this.iot.getHealth(),
      this.catalog.list(),
      this.credentialService.countFailed(),
    ]);

    return {
      buildings: health.buildings,
      coveredBuildings: buildings.map(({ buildingId, code, name }) => ({
        buildingId,
        code,
        name,
      })),
      failedCredentials,
    };
  }

  /** Devuelve el username, que es lo que se anota en `issued_by` y en el log. */
  private async requireAdmin(sessionToken: string): Promise<string> {
    const token = (sessionToken ?? '').trim();

    if (!token) {
      throw new UnauthorizedException('Falta la sesión de openMAINT');
    }

    const { role, username } =
      await this.sessionRoleService.resolveIdentity(token);

    if (!role || !ACCESS_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Se requiere rol de administración para gestionar accesos',
      );
    }

    return username;
  }

  /** El PIN no sale por aquí: ni en claro ni cifrado. */
  private toPublicView(credential: AccessCredential) {
    return {
      id: credential.id,
      subjectType: credential.subjectType,
      subjectRef: credential.subjectRef,
      displayName: credential.displayName,
      scope: credential.scope,
      buildingId: credential.buildingId,
      openmaintUnitId: credential.openmaintUnitId,
      validFrom: credential.validFrom,
      validTo: credential.validTo,
      status: credential.status,
      revokedReason: credential.revokedReason,
      issuedBy: credential.issuedBy,
      guestStayId: credential.guestStayId,
      syncState: credential.syncState,
      syncDetail: credential.syncDetail,
      pinConfigured: Boolean(credential.pinCiphertext),
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }
}
