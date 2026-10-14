import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import { incidentEligibility } from '../access-control/guest-stay-timing';
import { GuestPortalData } from '../access-control/guest-portal-data.service';
import {
  IncidentsService,
  UploadedImage,
} from '../incidents/incidents.service';
import { SHORT_DESCRIPTION_MAX } from '../incidents/dto/create-incident.dto';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { CreateGuestIncidentDto } from './dto/create-guest-incident.dto';
import { GuestLocationService } from './guest-location.service';

const MAX_REPORTS_PER_STAY = 5;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Marcadores que las notificaciones interpretan; el huésped no puede imitarlos. */
const RESERVED_MARKERS = /---\s*Datos del (visitante|huésped)\s*---/gi;

export interface GuestIncidentResult {
  incidentId: number;
  attachmentsUploaded: number;
  attachmentsFailed: number;
}

/**
 * Reporte de incidencias desde el portal del huésped.
 *
 * El huésped nunca recibe una sesión de openMAINT: el correctivo se abre con la
 * sesión de servicio y un solicitante fijo, igual que las alarmas IoT, y el
 * edificio y la unidad salen de su estancia, no de lo que envíe.
 */
@Injectable()
export class GuestIncidentService {
  private readonly logger = new Logger(GuestIncidentService.name);

  constructor(
    private readonly incidents: IncidentsService,
    private readonly serviceSession: OpenmaintServiceSession,
    private readonly location: GuestLocationService,
    private readonly rateLimiter: RateLimiterService,
    private readonly configService: ConfigService,
  ) {}

  async report(
    guest: GuestPortalData,
    dto: CreateGuestIncidentDto,
    images: UploadedImage[] = [],
    now: Date = new Date(),
  ): Promise<GuestIncidentResult> {
    this.assertEligible(guest, now);

    const requesterId = this.requesterId();

    if (
      !this.rateLimiter.hit(
        `guest:incident:${guest.stayId}`,
        MAX_REPORTS_PER_STAY,
        REPORT_WINDOW_MS,
      )
    ) {
      throw new HttpException(
        'Ya enviaste varios reportes hoy. Si es urgente, escríbenos directamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const sessionId = await this.serviceSession.get();
      const { unitName, floorId } = await this.location.lookup(
        guest.openmaintUnitId,
        guest.buildingId,
      );

      const result = await this.incidents.createIncident(
        sessionId,
        requesterId,
        {
          buildingId: guest.buildingId!,
          ...(floorId ? { floorId } : {}),
          ...(guest.openmaintUnitId ? { unitId: guest.openmaintUnitId } : {}),
          shortDescription: this.shortDescription(dto),
          notes: this.notes(guest, unitName, dto),
        },
        images,
      );

      this.logger.log(
        `Incidencia ${result.incidentId} reportada desde el portal por la estancia ${guest.stayId}`,
      );

      return {
        incidentId: result.incidentId,
        attachmentsUploaded: result.attachmentsUploaded,
        attachmentsFailed: result.attachmentsFailed,
      };
    } catch (error) {
      this.logger.error(
        `No se pudo abrir la incidencia de la estancia ${guest.stayId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadGatewayException(
        'No pudimos registrar tu reporte. Inténtalo de nuevo en unos minutos.',
      );
    }
  }

  private assertEligible(guest: GuestPortalData, now: Date): void {
    const eligibility = incidentEligibility(
      {
        stayStatus: guest.stayStatus,
        buildingId: guest.buildingId,
        checkInAt: guest.checkInAt,
        accessValidTo: guest.accessValidTo,
      },
      now,
    );

    switch (eligibility) {
      case 'ok':
        return;
      case 'antes-del-checkin':
        throw new ForbiddenException(
          'Podrás reportar incidencias desde la hora de tu check-in.',
        );
      case 'sin-edificio':
        throw new UnprocessableEntityException(
          'Tu reserva aún no está vinculada a un edificio. Escríbenos para reportar el problema.',
        );
      default:
        throw new ForbiddenException(
          'Tu estadía ya no admite reportes desde el portal.',
        );
    }
  }

  private requesterId(): number {
    const value = Number(
      this.configService.get<string>('OPENMAINT_GUEST_REQUESTER_ID'),
    );

    if (!Number.isInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(
        'El reporte de incidencias no está disponible en este momento.',
      );
    }

    return value;
  }

  /** El título es lo que escribió el huésped; la unidad ya viaja en `Unit`. */
  private shortDescription(dto: CreateGuestIncidentDto): string {
    const title = this.clean(dto.title ?? '');
    const fallback = this.clean(dto.description).split(/\r?\n/)[0];

    return (title || fallback).slice(0, SHORT_DESCRIPTION_MAX);
  }

  private notes(
    guest: GuestPortalData,
    unitName: string | null,
    dto: CreateGuestIncidentDto,
  ): string {
    const lines = [this.clean(dto.description)];

    if (dto.location) {
      lines.push(`Ubicación indicada: ${this.clean(dto.location)}`);
    }

    lines.push(
      '',
      '--- Datos del huésped ---',
      `Nombre: ${this.clean(guest.guestName)}`,
      `Correo: ${guest.guestEmail ? this.clean(guest.guestEmail) : 'No disponible'}`,
      `Reserva Hostaway: ${guest.reservationId}`,
      `Estancia: ${guest.stayId}`,
      `Unidad: ${unitName ?? 'No disponible'}`,
    );

    return lines.join('\n');
  }

  /**
   * openMAINT mete las notas sin escapar en el HTML de su bitácora: un `<` del
   * huésped sería marcado real en la pantalla del personal. Se cambian por
   * comillas angulares, que se leen igual y no son HTML.
   */
  private clean(value: string): string {
    return value
      .replace(RESERVED_MARKERS, '')
      .replace(/</g, '‹')
      .replace(/>/g, '›')
      .trim();
  }
}
