import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AccessIotGateway } from '../access-control/access-iot.gateway';
import {
  LiveSession,
  LiveSessionErrorCode,
  LiveSessionResult,
} from '../access-control/access-iot.types';
import { CameraCatalogService } from './camera-catalog.service';
import {
  LiveViewRequest,
  LiveViewStatus,
} from './entities/live-view-request.entity';

const CAMERA_ID = /^[A-Za-z0-9._-]{1,64}$/;

interface Refusal {
  status: HttpStatus;
  code: string;
  message: string;
  /** Avería de integración o configuración: que la vea Sistemas en el log. */
  alert?: boolean;
}

/** Tabla de `live-integration-dt4fm.md`; `code` es lo que lee el frontend. */
export const LIVE_SESSION_REFUSALS: Record<LiveSessionErrorCode, Refusal> = {
  invalid_request: {
    status: HttpStatus.BAD_GATEWAY,
    code: 'invalid_request',
    message: 'La VPS de video rechazó la petición',
    alert: true,
  },
  invalid_response: {
    status: HttpStatus.BAD_GATEWAY,
    code: 'live_unavailable',
    message: 'La VPS de video respondió fuera de contrato',
    alert: true,
  },
  not_found: {
    status: HttpStatus.NOT_FOUND,
    code: 'not_found',
    message: 'La cámara ya no existe',
  },
  device_ambiguous: {
    status: HttpStatus.BAD_GATEWAY,
    code: 'device_ambiguous',
    message: 'Dos edificios declaran esa cámara',
    alert: true,
  },
  gateway_unreachable: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'gateway_unreachable',
    message: 'El edificio no responde',
  },
  live_capacity_reached: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'live_capacity_reached',
    message: 'Hay demasiadas cámaras abiertas',
  },
  live_unavailable: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'live_unavailable',
    message: 'El servicio de video no está disponible',
  },
  unauthorized: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'live_unavailable',
    message: 'La VPS de video rechazó el service token',
    alert: true,
  },
  timeout: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'live_unavailable',
    message: 'El servicio de video no respondió a tiempo',
  },
  network: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'live_unavailable',
    message: 'No se pudo contactar con el servicio de video',
  },
};

const liveError = (status: HttpStatus, code: string, message: string) =>
  new HttpException({ statusCode: status, code, message }, status);

/**
 * Pide la sesión a la VPS y deja el registro. Sin registro no hay video: si la
 * fila no se puede marcar `issued`, la sesión no sale y el ticket caduca solo.
 */
@Injectable()
export class LiveSessionService {
  private readonly logger = new Logger(LiveSessionService.name);

  constructor(
    @InjectRepository(LiveViewRequest)
    private readonly views: Repository<LiveViewRequest>,
    private readonly iot: AccessIotGateway,
    private readonly catalog: CameraCatalogService,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('LIVE_VIDEO_ENABLED') === 'true';
  }

  async start(
    cameraId: string,
    username: string,
    rawRequestId: string,
  ): Promise<LiveSession> {
    if (!this.isEnabled()) {
      throw liveError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'live_disabled',
        'La videovigilancia en vivo está desactivada',
      );
    }

    if (!CAMERA_ID.test(cameraId)) {
      throw liveError(
        HttpStatus.BAD_REQUEST,
        'invalid_request',
        'Identificador de cámara inválido',
      );
    }

    const requestId = rawRequestId.toLowerCase();
    const row = await this.record(cameraId, username, requestId);
    let result: LiveSessionResult;

    try {
      result = await this.iot.createLiveSession(cameraId, { requestId });
    } catch (error) {
      this.logger.error(
        `Sesión en vivo ${cameraId} sin pedir request=${requestId}: ${(error as Error).message}`,
      );
      await this.finish(row, 'failed', 'internal_error');
      const { status, code, message } = LIVE_SESSION_REFUSALS.live_unavailable;
      throw liveError(status, code, message);
    }

    if (result.outcome === 'failed') {
      await this.finish(row, 'failed', result.errorCode);
      throw this.refuse(result.errorCode, cameraId, username, requestId);
    }

    try {
      await this.views.update(row.id, {
        status: 'issued',
        buildingId: result.session.buildingId,
        finishedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `Sesión en vivo ${cameraId} emitida pero sin registrar request=${requestId}: ${(error as Error).message}`,
      );
      throw liveError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'live_unavailable',
        'No se pudo registrar la visualización',
      );
    }

    this.logger.log(
      `Sesión en vivo ${cameraId} por usuario=${username} request=${requestId}`,
    );

    return result.session;
  }

  private async record(
    cameraId: string,
    username: string,
    requestId: string,
  ): Promise<LiveViewRequest> {
    try {
      return await this.views.save(
        this.views.create({
          requestId,
          cameraId,
          buildingId: this.catalog.find(cameraId)?.buildingId ?? null,
          actorUsername: username,
          status: 'requested',
          errorCode: null,
          requestedAt: new Date(),
          finishedAt: null,
        }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw liveError(
          HttpStatus.CONFLICT,
          'duplicate_request',
          'Esa solicitud ya se usó: cada visualización necesita un requestId nuevo',
        );
      }

      throw error;
    }
  }

  /** La sesión ya falló: un registro que no se completa no debe tapar ese error. */
  private async finish(
    row: LiveViewRequest,
    status: LiveViewStatus,
    errorCode: LiveViewRequest['errorCode'],
  ): Promise<void> {
    try {
      await this.views.update(row.id, {
        status,
        errorCode,
        finishedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `No se pudo cerrar el registro request=${row.requestId}: ${(error as Error).message}`,
      );
    }
  }

  private refuse(
    errorCode: LiveSessionErrorCode,
    cameraId: string,
    username: string,
    requestId: string,
  ): HttpException {
    const { status, code, message, alert } = LIVE_SESSION_REFUSALS[errorCode];

    if (errorCode === 'not_found') this.catalog.forget(cameraId);

    if (alert) {
      this.logger.error(
        `Sesión en vivo ${cameraId} -> ${errorCode} usuario=${username} request=${requestId}`,
      );
    }

    return liveError(status, code, message);
  }
}
