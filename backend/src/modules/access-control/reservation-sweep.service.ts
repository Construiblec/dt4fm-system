import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { HostawayBillingReservation } from '../../integrations/hostaway/hostaway.mock';
import { BUSINESS_TIMEZONE } from '../push-notifications/scheduler/scheduler.constants';
import { CredentialService } from './credential.service';
import { GuestStay } from './entities/guest-stay.entity';
import { GuestStayService } from './guest-stay.service';

/** Días de llegadas que se revisan hacia delante en cada barrido. */
const WINDOW_DAYS = 14;

/**
 * Red de seguridad del webhook. Un webhook perdido no se nota: la reserva no se
 * proyecta y el huésped llega sin PIN, o peor, una cancelación no entregada deja
 * un PIN vivo.
 */
@Injectable()
export class ReservationSweepService {
  private readonly logger = new Logger(ReservationSweepService.name);

  constructor(
    @InjectRepository(GuestStay)
    private readonly stays: Repository<GuestStay>,
    private readonly hostaway: HostawayService,
    private readonly guestStayService: GuestStayService,
    private readonly credentialService: CredentialService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 5 * * *', { timeZone: BUSINESS_TIMEZONE })
  async sweep(): Promise<void> {
    if (this.configService.get<string>('ACCESS_SCHEDULER_ENABLED') !== 'true') {
      return;
    }

    for (const date of this.window()) {
      await this.reconcileDate(date);
    }
  }

  async reconcileDate(date: string): Promise<void> {
    let reservations: HostawayBillingReservation[];

    try {
      reservations = await this.hostaway.getReservationsByArrivalDate(date);
    } catch (error) {
      // Un fallo de Hostaway no puede traducirse en revocaciones masivas.
      this.logger.warn(
        `Hostaway no respondió para ${date}: ${this.describe(error)}`,
      );
      return;
    }

    for (const reservation of reservations) {
      try {
        await this.guestStayService.upsertFromReservation({
          hostawayReservationId: String(reservation.hostawayReservationId),
          listingId: String(reservation.listingMapId ?? ''),
          guestName: reservation.guestName,
          guestEmail: reservation.guestEmail,
          arrivalDate: reservation.arrivalDate,
          departureDate: reservation.departureDate,
          status: 'confirmed',
          issuedBy: 'hostaway-sweep',
        });
      } catch (error) {
        this.logger.error(
          `No se pudo reconciliar la reserva ${reservation.hostawayReservationId}: ${this.describe(error)}`,
        );
      }
    }

    await this.cancelDisappeared(date, reservations.length, reservations);
  }

  /**
   * Una reserva que ya no aparece en Hostaway está cancelada. Con una salvedad:
   * si la respuesta viene vacía pero hay estancias locales, es mucho más
   * probable un fallo de la API que una cancelación en bloque.
   */
  private async cancelDisappeared(
    date: string,
    total: number,
    reservations: HostawayBillingReservation[],
  ): Promise<void> {
    const locales = await this.stays.find({
      where: { arrivalDate: date },
    });

    const vivas = locales.filter((stay) => stay.status !== 'cancelled');

    if (vivas.length === 0) {
      return;
    }

    if (total === 0) {
      this.logger.warn(
        `Hostaway devolvió 0 reservas para ${date} con ${vivas.length} estancia(s) locales: no se cancela nada`,
      );
      return;
    }

    const vigentes = new Set(
      reservations.map((r) => String(r.hostawayReservationId)),
    );

    for (const stay of vivas) {
      if (vigentes.has(stay.hostawayReservationId)) {
        continue;
      }

      stay.status = 'cancelled';
      await this.stays.save(stay);

      const revoked = await this.credentialService.revokeByGuestStay(
        stay.id,
        'reservation_cancelled',
      );

      this.logger.log(
        `Reserva ${stay.hostawayReservationId} ya no está en Hostaway: cancelada, ${revoked} credencial(es) revocada(s)`,
      );
    }
  }

  private window(): string[] {
    const days: string[] = [];

    for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
      const day = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
      days.push(day.toISOString().slice(0, 10));
    }

    return days;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
