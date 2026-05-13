import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { VerifyOwnerDto } from './dto/verify-owner.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';

const PROPIETARIOS_GROUP = { _id: 3361541, name: 'Propietarios' };
const OPENMAINT_PAYMENTS_CLASS = 'Pagos';
const OPENMAINT_UNITS_VIEW = 'TenantAlicuotaSummary';

type UnitRaw = {
  _id: number;
  'Propietario': string;
  'Unidad Inmobiliaria': string;
  '% Alícuota Unidad': number;
  '% Alícuota Parqueadero': number;
  '% Alícuota Bodega': number;
  '% Alícuota Total': number;
  'Valor Expensa $': number;
};

type PagoRaw = {
  _id: number;
  Description: string;
  Propietario: number;
  '_Propietario_description': string;
  Monto: number;
  FechadePago: string | null;
  '_Estado_code': string;
  '_Estado_description': string;
  Periodo: string;
  Tipo: string;
  Unidad: string;
};

type OpenmaintUserResponse = {
  data?: {
    _id: number;
    username: string;
    description: string;
    email: string | null;
  };
};

@Injectable()
export class OwnersService {
  constructor(
    private readonly configService: ConfigService,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintService: OpenmaintService,
    private readonly openmaintClient: OpenmaintClient,
  ) {}

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async getBuildings() {
    const sessionId = await this.getAdminSessionId();
    const response = await this.openmaintService.getBuildings(sessionId) as {
      data?: { _id: number; Code: string; Name: string; Description: string }[];
    };
    return (response.data ?? []).map((b) => ({
      id: b._id,
      code: b.Code,
      name: b.Name,
      description: b.Description,
    }));
  }

  async verifyOwner(dto: VerifyOwnerDto) {
    const sessionId = await this.getAdminSessionId();
    const tenant = await this.openmaintService.findTenantByIdNumber(
      dto.idNumber,
      Number(dto.buildingId),
      sessionId,
    );
    if (!tenant) {
      throw new BadRequestException(
        'No se encontró un propietario con esa cédula en el edificio seleccionado',
      );
    }
    return {
      found: true,
      tenantId: tenant._id,
      name: tenant.Description,
      idNumber: tenant.IDNumber,
      phone: tenant.Phone ?? null,
      email: tenant.Email ?? null,
    };
  }

  async registerOwner(dto: RegisterOwnerDto) {
    const sessionId = await this.getAdminSessionId();
    const tenant = await this.openmaintService.findTenantByIdNumber(
      dto.idNumber,
      Number(dto.buildingId),
      sessionId,
    );
    if (!tenant) {
      throw new BadRequestException(
        'No se encontró un propietario con esa cédula en el edificio seleccionado',
      );
    }
    try {
      const createdUser = await this.openmaintService.createOwnerUser(
        {
          username: dto.username,
          password: dto.password,
          description: tenant.Description,
          email: tenant.Email ?? '',
          active: true,
          defaultUserGroup: PROPIETARIOS_GROUP._id,
          userGroups: [PROPIETARIOS_GROUP],
        },
        sessionId,
      );
      return {
        success: true,
        username: createdUser.username,
        userId: createdUser._id,
        tenantId: tenant._id,
        name: tenant.Description,
      };
    } catch (error) {
      const status = error?.response?.status ?? error?.status;
      if (status === 409) {
        throw new ConflictException('El nombre de usuario ya está en uso, elige otro');
      }
      throw new InternalServerErrorException(
        'No se pudo crear el usuario. Intenta de nuevo más tarde.',
      );
    }
  }

  async loginOwner(username: string, password: string) {
    // 1. Autenticar en OpenMAINT
    const loginResponse = await this.openmaintAuthService.login(username, password);

    if (!loginResponse?.data?._id) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const sessionId: string = loginResponse.data._id;
    const role: string = loginResponse.data.role ?? '';
    const userId: number = loginResponse.data.userId;

    if (!role.toLowerCase().includes('propietario')) {
      throw new UnauthorizedException('El usuario no tiene permisos de propietario');
    }

    // 2. Obtener datos del usuario para resolver tenantId
    // El description del usuario coincide con el nombre del Tenant
    const adminSessionId = await this.getAdminSessionId();

    let tenantId: number | null = null;
    let ownerName: string = username;

    try {
      const userResponse = (await this.openmaintClient.get(
        `/users/${userId}`,
        adminSessionId,
      )) as OpenmaintUserResponse;

      ownerName = userResponse?.data?.description ?? username;

      // Buscar el Tenant por descripción (nombre completo)
      const filter = encodeURIComponent(
        JSON.stringify({
          attribute: {
            simple: {
              attribute: 'Description',
              operator: 'equal',
              value: ownerName,
            },
          },
        }),
      );

      const tenantResponse = (await this.openmaintClient.get(
        `/classes/Tenant/cards?filter=${filter}&limit=1`,
        adminSessionId,
      )) as { data?: { _id: number }[] };

      tenantId = tenantResponse?.data?.[0]?._id ?? null;
    } catch {
      // No bloqueamos el login si falla la resolución del tenantId
    }

    return {
      sessionId,
      username,
      role,
      tenantId,
      name: ownerName,
    };
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async getOwnerUnits(tenantId: number) {
    const sessionId = await this.getAdminSessionId();

    try {
      const response = (await this.openmaintClient.get(
        `/views/${OPENMAINT_UNITS_VIEW}/cards?limit=50`,
        sessionId,
      )) as { data?: UnitRaw[] };

      const all = response.data ?? [];
      const owned = all.filter((u) => u._id === tenantId);

      return owned.map((u) => ({
        nombre: u['Unidad Inmobiliaria'],
        alicuotaUnidad: u['% Alícuota Unidad'],
        alicuotaParqueadero: u['% Alícuota Parqueadero'],
        alicuotaBodega: u['% Alícuota Bodega'],
        alicuotaTotal: u['% Alícuota Total'],
        valorExpensa: u['Valor Expensa $'],
      }));
    } catch {
      throw new InternalServerErrorException('No se pudieron obtener las unidades');
    }
  }

  async getOwnerPendingPayments(tenantId: number) {
    const sessionId = await this.getAdminSessionId();

    const filter = encodeURIComponent(
      JSON.stringify({
        attribute: {
          simple: {
            attribute: 'Propietario',
            operator: 'equal',
            value: tenantId,
          },
        },
      }),
    );

    try {
      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards?filter=${filter}&limit=50`,
        sessionId,
      )) as { data?: PagoRaw[] };

      const all = response.data ?? [];
      const pendientes = all.filter((p) => p._Estado_code === 'Pendiente');
      const alDia = pendientes.length === 0;

      return {
        alDia,
        totalPendiente: pendientes.reduce((acc, p) => acc + (p.Monto ?? 0), 0),
        pagos: all.map((p) => ({
          id: p._id,
          unidad: p.Unidad,
          monto: p.Monto,
          periodo: p.Periodo,
          estado: p._Estado_description,
          estadoCodigo: p._Estado_code,
          fechaPago: p.FechadePago ?? null,
          tipo: p.Tipo,
        })),
      };
    } catch {
      throw new InternalServerErrorException('No se pudieron obtener los pagos');
    }
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  private async getAdminSessionId(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME');
    const password = this.configService.get<string>('OPENMAINT_PASSWORD');
    const response = await this.openmaintAuthService.login(username!, password!);
    if (!response?.data?._id) {
      throw new InternalServerErrorException(
        'No se pudo obtener sesión de servicio con OpenMAINT',
      );
    }
    return response.data._id;
  }
}
