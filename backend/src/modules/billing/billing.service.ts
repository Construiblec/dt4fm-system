import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContificoService } from '../../integrations/contifico/contifico.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { HostawayBillingReservation } from '../../integrations/hostaway/hostaway.mock';
import { ContificoCreateDocumentoDto } from '../../integrations/contifico/contifico.types';

const OPENMAINT_BILLING_CLASS = 'HostawayInvoice';

export interface BillingRunResult {
  date: string;
  total: number;
  invoiced: number;
  skipped: number;
  failed: number;
  errors: string[];
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly contificoService: ContificoService,
    private readonly openmaintClient: OpenmaintClient,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly hostawayService: HostawayService,
    private readonly configService: ConfigService,
  ) {}

  // ── Punto de entrada del scheduler ────────────────────────────────────────

  async runDailyBilling(date: string): Promise<BillingRunResult> {
    this.logger.log(`[Billing] Iniciando facturacion diaria para ${date}`);

    const result: BillingRunResult = {
      date,
      total: 0,
      invoiced: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // 1. Obtener reservaciones del dia desde Hostaway
    const reservations = await this.hostawayService.getReservationsByArrivalDate(date);
    result.total = reservations.length;

    if (reservations.length === 0) {
      this.logger.log(`[Billing] Sin reservaciones para facturar el ${date}`);
      return result;
    }

    // 2. Obtener sesion de openMAINT una sola vez para todo el proceso
    const sessionId = await this.getOpenmaintSession();

    // 3. Procesar cada reservacion secuencialmente
    for (const reservation of reservations) {
      try {
        // Verificar si ya fue facturada (deduplicacion)
        const alreadyInvoiced = await this.checkAlreadyInvoiced(
          reservation.hostawayReservationId,
          sessionId,
        );

        if (alreadyInvoiced) {
          this.logger.log(
            `[Billing] Reservacion ${reservation.hostawayReservationId} ya facturada - omitiendo`,
          );
          result.skipped++;
          continue;
        }

        await this.processReservation(reservation, sessionId);
        result.invoiced++;
      } catch (error) {
        const msg = `Reservacion ${reservation.hostawayReservationId}: ${error?.message ?? 'Error desconocido'}`;
        this.logger.error(`[Billing] ${msg}`);
        result.failed++;
        result.errors.push(msg);
      }
    }

    this.logger.log(
      `[Billing] Completado ${date} -> total:${result.total} facturadas:${result.invoiced} omitidas:${result.skipped} fallidas:${result.failed}`,
    );

    return result;
  }

  // ── Procesar una reservacion individual ───────────────────────────────────

  private async processReservation(
    reservation: HostawayBillingReservation,
    sessionId: string,
  ): Promise<void> {
    const { hostawayReservationId, guestName, totalPrice } = reservation;

    this.logger.log(
      `[Billing] Procesando ${hostawayReservationId} - ${guestName} - $${totalPrice}`,
    );

    const payload = this.buildContificoPayload(reservation);

    let contificoId = '';
    let contificoDocumento = '';
    let facturaError = '';

    try {
      const facturaResponse = await this.contificoService.createDocumento(payload);
      contificoId = facturaResponse.id;
      contificoDocumento = facturaResponse.documento;
      this.logger.log(
        `[Billing] Factura Contifico: ${contificoDocumento} (id: ${contificoId})`,
      );
    } catch (error) {
      facturaError = error?.message ?? 'Error desconocido al crear factura';
      this.logger.error(
        `[Billing] Error Contifico para ${hostawayReservationId}: ${facturaError}`,
      );
    }

    // Guardar en openMAINT siempre, incluso si fallo Contifico
    await this.saveToOpenmaint(
      {
        reservationId: hostawayReservationId,
        guestName,
        listingName: reservation.listingName,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        total: totalPrice,
        currency: reservation.currency,
        contificoId,
        contificoDocumento,
        facturaError,
        channelName: reservation.channelName,
      },
      sessionId,
    );

    if (facturaError) {
      throw new Error(facturaError);
    }
  }

  // ── Builder del payload Contifico ─────────────────────────────────────────

  private buildContificoPayload(
    r: HostawayBillingReservation,
  ): ContificoCreateDocumentoDto {
    const posToken = this.configService.get<string>('CONTIFICO_POS_TOKEN') ?? '';
    const productoId = this.configService.get<string>('CONTIFICO_PRODUCTO_ID') ?? '';

    const fechaEmision = new Date().toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const total = r.totalPrice;
    const subtotal0 = total;

    const razonSocial = r.guestName?.trim() || 'Consumidor Final';
    const telefonos = r.guestPhone?.replace(/[^\d+]/g, '') ?? '';
    const email = r.guestEmail ?? this.getEmailFallbackByChannel(r.channelName);

    // Numero de documento basado en reservationId
    const docNumero = `001-001-${r.hostawayReservationId.padStart(9, '0')}`;

    return {
      pos: posToken,
      fecha_emision: fechaEmision,
      tipo_documento: 'FAC',
      tipo_registro: 'CLI',
      documento: docNumero,
      autorizacion: r.confirmationCode || r.hostawayReservationId,
      estado: 'P',
      caja_id: null,
      cliente: {
        cedula: '9999999999',
        razon_social: razonSocial,
        tipo: 'I',
        telefonos,
        email,
        direccion: 'Sin direccion',
        es_extranjero: true,
      },
      descripcion: `Hospedaje Hostaway #${r.hostawayReservationId}`,
      subtotal_0: subtotal0,
      subtotal_12: 0,
      iva: 0,
      ice: 0,
      servicio: 0,
      total,
      adicional1: `Propiedad: ${r.listingName || r.listingMapId}`,
      adicional2: `Check-in: ${r.arrivalDate} | Check-out: ${r.departureDate} | ${r.nights} noche(s) | Canal: ${r.channelName}`,
      detalles: [
        {
          producto_id: productoId,
          cantidad: r.nights || 1,
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
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getEmailFallbackByChannel(channelName: string): string {
    const map: Record<string, string> = {
      airbnbOfficial: 'reservas.airbnb@noreply.com',
      bookingcom: 'reservas.booking@noreply.com',
      direct: 'reservas.directo@noreply.com',
    };
    return map[channelName] ?? 'reservas@noreply.com';
  }

  private async getOpenmaintSession(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME') ?? '';
    const password = this.configService.get<string>('OPENMAINT_PASSWORD') ?? '';
    const response = await this.openmaintAuthService.login(username, password);
    return response?.data?._id ?? '';
  }

  private async checkAlreadyInvoiced(
    reservationId: string,
    sessionId: string,
  ): Promise<boolean> {
    try {
      const filter = encodeURIComponent(
        JSON.stringify({
          attribute: {
            simple: {
              attribute: 'ReservationId',
              operator: 'equal',
              value: reservationId,
            },
          },
        }),
      );

      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_BILLING_CLASS}/cards?filter=${filter}&limit=1`,
        sessionId,
      )) as { data?: unknown[] };

      return (response?.data?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  private async saveToOpenmaint(
    data: {
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
      channelName: string;
    },
    sessionId: string,
  ): Promise<void> {
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
      ChannelName: data.channelName,
      FechaProcesamiento: new Date().toISOString(),
      Estado: data.facturaError ? 'ERROR' : 'OK',
    };

    const response = (await this.openmaintClient.post(
      `/classes/${OPENMAINT_BILLING_CLASS}/cards`,
      card,
      sessionId,
    )) as { success?: boolean; data?: { _id?: number } };

    if (!response?.success) {
      this.logger.warn(
        `[Billing] openMAINT success:false para reservacion ${data.reservationId}`,
      );
    } else {
      this.logger.log(
        `[Billing] openMAINT id=${response?.data?._id} para reservacion ${data.reservationId}`,
      );
    }
  }
}
