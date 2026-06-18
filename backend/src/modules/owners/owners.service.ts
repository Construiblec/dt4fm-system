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
import { ChangePasswordDto } from './dto/change-password.dto';
import { ContactAdminDto } from './dto/contact-admin.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { PayPaymentDto } from './dto/pay-payment.dto';
import { PaymentPaidNotifierService } from './payment-paid-notifier.service';
import FormData from 'form-data';

const PROPIETARIOS_GROUP = { _id: 3361541, name: 'Propietarios' };
const OPENMAINT_PAYMENTS_CLASS = 'Pagos';
const OPENMAINT_UNITS_VIEW = 'TenantAlicuotaSummary';
const OPENMAINT_COMMON_AREAS_CLASS = 'CommonAreas';
const STATE_RENT_CODE = 72122;

// Lookup IDs de Estado (TipoPago)
const ESTADO_PENDIENTE = 3166839;
const ESTADO_PAGADO = 3166845;

// Lookup IDs de MetodoPago
const METODO_EFECTIVO = 3167095;
const METODO_TRANSFERENCIA = 3167098;
const METODO_TARJETA = 3167117;

// ─── Tipos internos ────────────────────────────────────────────────────────────

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
  MetododoPago: number | null;
};

type OpenmaintUserResponse = {
  data?: {
    _id: number;
    username: string;
    description: string;
    email: string | null;
    language: string | null;
  };
};

type CommonAreaRaw = {
  _id: number;
  Code: string;
  Name: string;
  Description: string | null;
  Notes: string | null;
  '_State_code': string | null;
  '_State_description': string | null;
  '_State_description_translation': string | null;
  '_Condition_code': string | null;
  '_Condition_description': string | null;
  '_Building_code': string | null;
  '_Building_description': string | null;
  '_Floor_description': string | null;
  TotalNetArea: number | null;
  CoveredArea: number | null;
  Building: number | null;
  Floor: number | null;
  Precio: number | null;
  FechaReservaInicio: string | null;
  FechaReservaFin: string | null;
};

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class OwnersService {
  constructor(
    private readonly configService: ConfigService,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintService: OpenmaintService,
    private readonly openmaintClient: OpenmaintClient,
    private readonly paidNotifier: PaymentPaidNotifierService,
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
      sessionId,
    );
    if (!tenant) {
      throw new BadRequestException(
        'No se encontró un propietario con esa cédula',
      );
    }

    const parts = (tenant.Description ?? '').trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const firstLastName = parts[1] ?? '';
    const suggestedUsername = firstName && firstLastName
      ? `${firstName}.${firstLastName}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      : firstName.toLowerCase();

    return {
      found: true,
      tenantId: tenant._id,
      name: tenant.Description,
      idNumber: tenant.IDNumber,
      phone: tenant.Phone ?? null,
      email: tenant.Email ?? null,
      suggestedUsername,
    };
  }

  async registerOwner(dto: RegisterOwnerDto) {
    const sessionId = await this.getAdminSessionId();
    const tenant = await this.openmaintService.findTenantByIdNumber(
      dto.idNumber,
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
      const status =
        error?.response?.status ??
        error?.status ??
        error?.getStatus?.();
      const responseData: string = JSON.stringify(error?.response?.data ?? error?.message ?? '');
      const isDuplicate =
        status === 409 ||
        status === 422 ||
        responseData.includes('DuplicateKeyException') ||
        responseData.includes('duplicate key') ||
        responseData.includes('already exists');
      if (isDuplicate) {
        throw new ConflictException('El nombre de usuario ya está en uso, elige otro');
      }
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException(
        'No se pudo crear el usuario. Intenta de nuevo más tarde.',
      );
    }
  }

  async loginOwner(username: string, password: string) {
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
    const adminSessionId = await this.getAdminSessionId();
    let tenantId: number | null = null;
    let ownerName: string = username;
    try {
      const userResponse = (await this.openmaintClient.get(
        `/users/${userId}`,
        adminSessionId,
      )) as OpenmaintUserResponse;
      ownerName = userResponse?.data?.description ?? username;
      const filter = encodeURIComponent(
        JSON.stringify({
          attribute: {
            simple: { attribute: 'Description', operator: 'equal', value: ownerName },
          },
        }),
      );
      const tenantResponse = (await this.openmaintClient.get(
        `/classes/Tenant/cards?filter=${filter}&limit=1`,
        adminSessionId,
      )) as { data?: { _id: number }[] };
      tenantId = tenantResponse?.data?.[0]?._id ?? null;
    } catch {
      // No bloqueamos el login
    }
    return { sessionId, username, role, tenantId, userId, name: ownerName };
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
          simple: { attribute: 'Propietario', operator: 'equal', value: tenantId },
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
      return {
        alDia: pendientes.length === 0,
        totalPendiente: pendientes.reduce((acc, p) => acc + (p.Monto ?? 0), 0),
        pagos: all.map((p) => this.mapPago(p)),
      };
    } catch {
      throw new InternalServerErrorException('No se pudieron obtener los pagos');
    }
  }

  // ─── Pagos ─────────────────────────────────────────────────────────────────

  /**
   * Marca uno o varios pagos como Pagado en OpenMAINT.
   * Actualiza Estado, FechadePago y MetododoPago en cada card de Pagos.
   */
  async payPayments(dto: PayPaymentDto) {
    const sessionId = await this.getAdminSessionId();
    const today = dto.paymentDate;
    const metodoPago =
      dto.method === 'card' ? METODO_TARJETA
      : dto.method === 'cash' ? METODO_EFECTIVO
      : METODO_TRANSFERENCIA;

    const results: { id: number; success: boolean; error?: string }[] = [];

    for (const paymentId of dto.paymentIds) {
      try {
        await this.openmaintClient.put(
          `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards/${paymentId}`,
          {
            Estado: ESTADO_PAGADO,
            FechadePago: today,
            MetododoPago: metodoPago,
            Notes: dto.notes ?? null,
          },
          sessionId,
        );
        results.push({ id: paymentId, success: true });
      } catch (error) {
        console.error(`[owners] payPayment error for id ${paymentId}:`, {
          status: error?.response?.status,
          data: JSON.stringify(error?.response?.data),
        });
        results.push({ id: paymentId, success: false, error: 'No se pudo procesar' });
      }
    }

    const allSuccess = results.every((r) => r.success);

    // Notificación al administrador (best-effort): NO debe afectar el pago.
    const paidIds = results.filter((r) => r.success).map((r) => r.id);
    if (paidIds.length > 0) {
      try {
        await this.paidNotifier.notifyPaidPayments(paidIds, sessionId);
      } catch (error) {
        console.error('[owners] notifyPaidPayments error:', {
          message: (error as Error)?.message,
        });
      }
    }

    return {
      success: allSuccess,
      results,
      message: allSuccess
        ? 'Pago(s) registrado(s) correctamente'
        : 'Algunos pagos no pudieron procesarse',
    };
  }

  /**
   * Sube el comprobante de pago como adjunto a la card de Pagos en OpenMAINT.
   * Usa multipart/form-data con los campos "file" y "attachment".
   */
  async uploadPaymentVoucher(paymentId: number, file: UploadedFile) {
    const sessionId = await this.getAdminSessionId();

    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    formData.append(
      'attachment',
      JSON.stringify({
        fileName: file.originalname,
        category: '390625',
        Code: 'Comprobante',
        Description: 'Comprobante',
        majorVersion: true,
      }),
    );

    try {
      await this.openmaintClient.post(
        `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards/${paymentId}/attachments`,
        formData,
        sessionId,
        { headers: formData.getHeaders() },
      );
      return { success: true, message: 'Comprobante subido correctamente' };
    } catch (error) {
      console.error('[owners] uploadPaymentVoucher error:', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException('No se pudo subir el comprobante');
    }
  }

  // ─── Perfil ────────────────────────────────────────────────────────────────

  async getOwnerProfile(userId: number) {
    const adminSessionId = await this.getAdminSessionId();
    try {
      const response = (await this.openmaintClient.get(
        `/users/${userId}`,
        adminSessionId,
      )) as OpenmaintUserResponse;
      const user = response?.data;
      if (!user) throw new InternalServerErrorException('No se encontró el perfil');
      return { userId: user._id, username: user.username, name: user.description, email: user.email ?? null };
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException('No se pudo obtener el perfil');
    }
  }

  async changeOwnerPassword(userId: number, dto: ChangePasswordDto) {
    const adminSessionId = await this.getAdminSessionId();
    const profileResponse = (await this.openmaintClient.get(
      `/users/${userId}`,
      adminSessionId,
    )) as OpenmaintUserResponse;
    const user = profileResponse?.data;
    if (!user?.username) throw new InternalServerErrorException('No se pudo identificar el usuario');
    try {
      await this.openmaintAuthService.login(user.username, dto.currentPassword);
    } catch {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    try {
      await this.openmaintClient.put(
        `/users/${userId}`,
        {
          username: user.username,
          description: user.description,
          email: user.email ?? '',
          active: true,
          password: dto.newPassword,
          defaultUserGroup: PROPIETARIOS_GROUP._id,
          userGroups: [PROPIETARIOS_GROUP],
        },
        adminSessionId,
      );
      return { success: true, message: 'Contraseña actualizada correctamente' };
    } catch (error) {
      console.error('[owners] changeOwnerPassword error:', { status: error?.response?.status });
      throw new InternalServerErrorException('No se pudo actualizar la contraseña');
    }
  }

  async contactAdmin(tenantId: number, dto: ContactAdminDto) {
    const adminSessionId = await this.getAdminSessionId();
    try {
      await this.openmaintClient.post(
        `/classes/Tenant/cards/${tenantId}/emails`,
        { subject: `[Contacto Propietario] ${dto.subject}`, body: dto.message, status: 'draft' },
        adminSessionId,
      );
      return { success: true, message: 'Tu mensaje fue enviado al administrador correctamente' };
    } catch (error) {
      console.error('[owners] contactAdmin error:', { status: error?.response?.status });
      throw new InternalServerErrorException('No se pudo enviar el mensaje.');
    }
  }

  // ─── Áreas comunales y reservas ────────────────────────────────────────────

  async getCommonAreas(buildingId?: number) {
    const sessionId = await this.getAdminSessionId();
    try {
      let path = `/classes/${OPENMAINT_COMMON_AREAS_CLASS}/cards?limit=100&sort=${encodeURIComponent(JSON.stringify([{ property: 'Name', direction: 'ASC' }]))}`;
      if (buildingId) {
        const filter = encodeURIComponent(
          JSON.stringify({
            attribute: { simple: { attribute: 'Building', operator: 'equal', value: buildingId } },
          }),
        );
        path += `&filter=${filter}`;
      }
      const response = (await this.openmaintClient.get(path, sessionId)) as { data?: CommonAreaRaw[] };
      const areas = (response.data ?? []).filter(
        (a) => a.Name && !a.Name.toLowerCase().includes('técnica'),
      );
      return areas.map((a) => this.mapCommonArea(a));
    } catch {
      throw new InternalServerErrorException('No se pudieron obtener las áreas comunales');
    }
  }

  async getCommonAreaById(areaId: number) {
    const sessionId = await this.getAdminSessionId();
    try {
      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_COMMON_AREAS_CLASS}/cards/${areaId}`,
        sessionId,
      )) as { data?: CommonAreaRaw };
      if (!response.data) throw new InternalServerErrorException('Área no encontrada');
      return this.mapCommonArea(response.data);
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException('No se pudo obtener el área comunal');
    }
  }

  async createReservation(dto: CreateReservationDto, tenantId: number) {
    const sessionId = await this.getAdminSessionId();
    const areaId = Number(dto.commonAreaId);
    const areaRaw = (await this.openmaintClient.get(
      `/classes/${OPENMAINT_COMMON_AREAS_CLASS}/cards/${areaId}`,
      sessionId,
    )) as { data?: CommonAreaRaw };
    const area = areaRaw.data;
    if (!area) throw new BadRequestException('El área comunal no existe');
    if (area._State_code === 'Rent') throw new ConflictException('El área ya está reservada');
    try {
      await this.openmaintClient.put(
        `/classes/${OPENMAINT_COMMON_AREAS_CLASS}/cards/${areaId}`,
        {
          State: STATE_RENT_CODE,
          FechaReservaInicio: dto.fechaInicio,
          FechaReservaFin: dto.fechaFin,
          Notes: dto.notes ?? `Reservado por tenantId: ${tenantId}`,
        },
        sessionId,
      );
      return {
        success: true,
        message: 'Reserva creada correctamente',
        areaId,
        fechaInicio: dto.fechaInicio,
        fechaFin: dto.fechaFin,
        precio: area.Precio ?? 0,
      };
    } catch (error) {
      console.error('[owners] createReservation error:', { status: error?.response?.status });
      throw new InternalServerErrorException('No se pudo crear la reserva');
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private mapPago(p: PagoRaw) {
    return {
      id: p._id,
      unidad: p.Unidad,
      monto: p.Monto,
      periodo: p.Periodo,
      estado: p._Estado_description,
      estadoCodigo: p._Estado_code,
      fechaPago: p.FechadePago ?? null,
      tipo: p.Tipo,
    };
  }

  private mapCommonArea(a: CommonAreaRaw) {
    return {
      id: a._id,
      code: a.Code,
      name: a.Name?.trim(),
      notes: a.Notes ?? null,
      estado: this.mapAreaState(a._State_code),
      estadoCodigo: a._State_code ?? null,
      condicion: a._Condition_description ?? null,
      edificio: a._Building_description ?? null,
      edificioId: a.Building ?? null,
      piso: a._Floor_description ?? null,
      areaNeta: a.TotalNetArea ?? a.CoveredArea ?? null,
      precio: a.Precio ?? null,
      fechaReservaInicio: a.FechaReservaInicio ?? null,
      fechaReservaFin: a.FechaReservaFin ?? null,
    };
  }

  private mapAreaState(stateCode: string | null): string {
    switch (stateCode) {
      case 'Vacant': return 'Libre';
      case 'Rent': return 'Reservado';
      default: return 'Disponible';
    }
  }

  private async getAdminSessionId(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME');
    const password = this.configService.get<string>('OPENMAINT_PASSWORD');
    const response = await this.openmaintAuthService.login(username!, password!);
    if (!response?.data?._id) {
      throw new InternalServerErrorException('No se pudo obtener sesión de servicio con OpenMAINT');
    }
    return response.data._id;
  }
}
