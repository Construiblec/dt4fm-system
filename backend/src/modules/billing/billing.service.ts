import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContificoService } from '../../integrations/contifico/contifico.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { ContificoCreateDocumentoDto } from '../../integrations/contifico/contifico.types';
import { HostawayWebhookDto } from './dto/hostaway-webhook.dto';

const OPENMAINT_BILLING_CLASS = 'HostawayInvoice';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly contificoService: ContificoService,
    private readonly openmaintClient: OpenmaintClient,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {}

  async handleReservationWebhook(dto: HostawayWebhookDto): Promise<{ ok: boolean }> {
    const reservation = dto.data;

    if (reservation.status && !['confirmed', 'new'].includes(reservation.status)) {
      this.logger.warn(`[Billing] Reservación ignorada por estado: ${reservation.status}`);
      return { ok: true };
    }

    const reservationId = String(
      reservation.hostawayReservationId ?? reservation.id ?? '',
    );

    const guestName = reservation.guestFirstName
      ? `${reservation.guestFirstName} ${reservation.guestLastName ?? ''}`.trim()
      : (reservation.guestName ?? 'Huésped');

    this.logger.log(`[Billing] Procesando reservación ${reservationId} - ${guestName}`);

    // ── 1. Construir payload Contifico ─────────────────────────────────────
    const total = reservation.totalPrice ?? 0;
    const subtotal0 = total;
    const subtotal12 = 0;
    const iva = 0;

    const productoId = this.configService.get<string>('CONTIFICO_PRODUCTO_ID') ?? '';
    const posToken = this.configService.get<string>('CONTIFICO_POS_TOKEN') ?? '';

    const today = new Date().toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const documentoPayload: ContificoCreateDocumentoDto = {
      pos: posToken,
      fecha_emision: today,
      tipo_documento: 'FAC',
      tipo_registro: 'CLI',
      documento: `001-001-${reservationId.padStart(9, '0')}`,
      autorizacion: reservationId,
      estado: 'P',
      caja_id: null,
      cliente: {
        cedula: '9999999999',
        razon_social: guestName,
        tipo: 'I',
        email: reservation.guestEmail ?? '',
        telefonos: reservation.guestPhone ?? '',
        es_extranjero: true,
      },
      descripcion: `Reservación Hostaway #${reservationId} - ${reservation.listingName ?? ''}`,
      subtotal_0: subtotal0,
      subtotal_12: subtotal12,
      iva,
      ice: 0,
      servicio: 0,
      total,
      adicional1: `Propiedad: ${reservation.listingName ?? ''}`,
      adicional2: `Check-in: ${reservation.arrivalDate ?? ''} | Check-out: ${reservation.departureDate ?? ''}`,
      detalles: [
        {
          producto_id: productoId,
          cantidad: 1,
          precio: total,
          porcentaje_iva: 0,
          porcentaje_descuento: 0,
          base_cero: subtotal0,
          base_gravable: 0,
          base_no_gravable: 0,
          valor_ice: null,
        },
      ],
    };

    // ── 2. Crear factura en Contifico ──────────────────────────────────────
    let contificoId = '';
    let contificoDocumento = '';
    let facturaError = '';

    try {
      const facturaResponse = await this.contificoService.createDocumento(documentoPayload);
      contificoId = facturaResponse.id;
      contificoDocumento = facturaResponse.documento;
      this.logger.log(`[Billing] Factura creada en Contifico: ${contificoDocumento} (${contificoId})`);
    } catch (error) {
      facturaError = error?.message ?? 'Error desconocido';
      this.logger.error(`[Billing] No se pudo crear la factura en Contifico: ${facturaError}`);
    }

    // ── 3. Guardar en openMAINT ────────────────────────────────────────────
    try {
      await this.saveToOpenmaint({
        reservationId,
        guestName,
        listingName: reservation.listingName ?? '',
        arrivalDate: reservation.arrivalDate ?? '',
        departureDate: reservation.departureDate ?? '',
        total,
        currency: reservation.currency ?? 'USD',
        contificoId,
        contificoDocumento,
        facturaError,
        accion: dto.action,
      });
    } catch (omError) {
      this.logger.error(`[Billing] No se pudo guardar en openMAINT: ${omError?.message}`);
    }

    if (facturaError) {
      throw new InternalServerErrorException(`Factura no creada en Contifico: ${facturaError}`);
    }

    return { ok: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getOpenmaintSession(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME') ?? '';
    const password = this.configService.get<string>('OPENMAINT_PASSWORD') ?? '';
    const response = await this.openmaintAuthService.login(username, password);
    return response?.data?._id ?? '';
  }

  private async saveToOpenmaint(data: {
    reservationId: string;
    guestName: string;
    listingName: string;
    arrivalDate: string;
    departureDate: string;
    total: number;
    currency: string;
    contificoId: string;
    contificoDocumento: string;
    facturaError: string;
    accion: string;
  }): Promise<void> {
    const sessionId = await this.getOpenmaintSession();

    // Formato exacto capturado desde la UI de openMAINT
    const card = {
      _type: OPENMAINT_BILLING_CLASS,
      _tenant: '',
      Code: null,
      Description: null,
      ReservationId: data.reservationId,
      GuestName: data.guestName,
      ListingName: data.listingName,
      ArrivalDate: data.arrivalDate,
      DepartureDate: data.departureDate,
      Total: data.total,
      Currency: data.currency,
      ContificoId: data.contificoId,
      ContificoDocumento: data.contificoDocumento,
      FacturaError: data.facturaError,
      Accion: data.accion,
      FechaProcesamiento: new Date().toISOString(),
      Estado: data.facturaError ? 'ERROR' : 'OK',
    };

    const response = await this.openmaintClient.post(
      `/classes/${OPENMAINT_BILLING_CLASS}/cards`,
      card,
      sessionId,
    ) as { success?: boolean; data?: { _id?: number } };

    if (!response?.success) {
      throw new Error('openMAINT respondió success: false al crear el card');
    }

    this.logger.log(
      `[Billing] Registro guardado en openMAINT id=${response?.data?._id}`,
    );
  }
}
