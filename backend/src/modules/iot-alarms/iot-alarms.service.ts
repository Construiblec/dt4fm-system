import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import {
  IOT_REQUESTER_LABEL,
  IOT_SUBJECT_PREFIX,
  SHORT_DESCR_MAX,
  resolveAlarmRule,
} from './constants/iot-alarm.constants';
import { CreateIotAlarmDto } from './dto/create-iot-alarm.dto';
import {
  AssetCard,
  AssetLookup,
  IotAlarmOpenmaintService,
} from './iot-alarm.openmaint.service';

export type IotAlarmResult = {
  incidentId: number;
  number: string | null;
  assetResolved: boolean;
  assetId: number | null;
};

@Injectable()
export class IotAlarmsService {
  private readonly logger = new Logger(IotAlarmsService.name);

  constructor(
    private readonly openmaint: IotAlarmOpenmaintService,
    private readonly serviceSession: OpenmaintServiceSession,
    private readonly pushDispatch: PushDispatchService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Traduce una alarma de la Raspberry en un correctivo de openMAINT.
   *
   * La Pi emite cada alarma una sola vez y no reintenta, así que aquí se
   * reintenta por ella; agotados los intentos, el payload íntegro queda en el
   * log de error como única copia.
   */
  async handle(
    dto: CreateIotAlarmDto,
    rawPayload: unknown,
  ): Promise<IotAlarmResult> {
    const maxAttempts = this.maxAttempts();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.createFromAlarm(dto, rawPayload);
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error)) {
          break;
        }

        this.logger.warn(
          `Intento ${attempt}/${maxAttempts} fallido para ${dto.event} / ${dto.assetCode}`,
        );

        if (attempt < maxAttempts) {
          await this.backoff(attempt);
        }
      }
    }

    this.logger.error(
      `Alarma IoT no registrada: ${JSON.stringify(rawPayload)}`,
      lastError instanceof Error ? lastError.stack : String(lastError),
    );

    throw new BadGatewayException(
      'No se pudo registrar la alarma en openMAINT',
    );
  }

  private async createFromAlarm(
    dto: CreateIotAlarmDto,
    rawPayload: unknown,
  ): Promise<IotAlarmResult> {
    const sessionId = await this.serviceSession.get();
    const lookup = await this.openmaint.findAssetByCode(
      sessionId,
      dto.assetCode,
    );

    const asset = lookup.outcome === 'found' ? lookup.asset : null;
    const rule = resolveAlarmRule(dto.event);

    // `Site` es obligatorio en CM01: sin activo resuelto no hay dónde colgarlo.
    const site = asset?.Building ?? this.fallbackSiteId();

    const created = await this.openmaint.createCorrective(sessionId, {
      OpeningDate: dto.timestamp,
      Requester: this.requesterId(),
      Type: rule.processType,
      Priority: rule.priority,
      Site: site,
      ShortDescr: this.buildSubject(dto, asset),
      ProcessNotes: this.buildNotes(dto, rawPayload, lookup),
      ...(asset?._id ? { Asset: asset._id } : {}),
      ...(asset?.Floor ? { Floor: asset.Floor } : {}),
    });

    this.notifySupervisors(created.id, asset);

    this.logger.log(
      `Correctivo ${created.number ?? created.id} abierto por alarma ${dto.event} (${dto.assetCode})`,
    );

    return {
      incidentId: created.id,
      number: created.number,
      assetResolved: asset !== null,
      assetId: asset?._id ?? null,
    };
  }

  /** Best-effort: `PushDispatchService` nunca propaga errores de notificación. */
  private notifySupervisors(incidentId: number, asset: AssetCard | null): void {
    void this.pushDispatch.notifyCorrectiveOpened({
      id: incidentId,
      // El literal evita que el aviso diga "Iot Sistema", que es como openMAINT
      // compone la descripción del empleado.
      requesterName: IOT_REQUESTER_LABEL,
      // El equipo que alarmó es lo que el supervisor necesita ver primero.
      assetName: asset?.Description,
      floorName: asset?._Floor_description,
      buildingName: asset?._Building_description,
    });
  }

  private buildSubject(
    dto: CreateIotAlarmDto,
    asset: AssetCard | null,
  ): string {
    const detail = dto.message?.trim() || dto.event;
    // Sin activo resuelto se muestra el código recibido, para no perder la pista.
    const target = asset?.Description ?? dto.assetCode;

    return `${IOT_SUBJECT_PREFIX} ${detail} - ${target}`.slice(
      0,
      SHORT_DESCR_MAX,
    );
  }

  /**
   * Vuelca el cuerpo crudo recibido: es lo único que explica al técnico por qué
   * se abrió el trabajo, y los campos de medición varían según la alarma.
   */
  private buildNotes(
    dto: CreateIotAlarmDto,
    rawPayload: unknown,
    lookup: AssetLookup,
  ): string {
    const lines = [`Alarma automática registrada por ${IOT_REQUESTER_LABEL}.`];

    if (lookup.outcome === 'missing') {
      lines.push(
        `AVISO: no existe ningún activo con el código "${dto.assetCode}"; el correctivo quedó sin equipo asociado.`,
      );
    }

    if (lookup.outcome === 'ambiguous') {
      lines.push(
        `AVISO: el código "${dto.assetCode}" corresponde a ${lookup.candidateIds.length} activos (${lookup.candidateIds.join(', ')}); no se pudo enlazar ninguno.`,
      );
    }

    lines.push('', 'Datos recibidos del servidor IoT:');

    const payload =
      rawPayload && typeof rawPayload === 'object'
        ? (rawPayload as Record<string, unknown>)
        : {};

    for (const [key, value] of Object.entries(payload)) {
      lines.push(`  ${key}: ${this.formatValue(value)}`);
    }

    return lines.join('\n');
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }

    return JSON.stringify(value) ?? '-';
  }

  private requesterId(): number {
    const value = Number(
      this.configService.get<string>('OPENMAINT_IOT_REQUESTER_ID'),
    );

    if (!Number.isInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(
        'Falta OPENMAINT_IOT_REQUESTER_ID: el correctivo no puede abrirse sin solicitante',
      );
    }

    return value;
  }

  private fallbackSiteId(): number {
    const value = Number(
      this.configService.get<string>('OPENMAINT_IOT_FALLBACK_SITE_ID'),
    );

    if (!Number.isInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(
        'Falta OPENMAINT_IOT_FALLBACK_SITE_ID: sin activo resuelto no hay Site que asignar',
      );
    }

    return value;
  }

  private maxAttempts(): number {
    const value = Number(
      this.configService.get<string>('IOT_CREATE_MAX_ATTEMPTS'),
    );

    return Number.isInteger(value) && value > 0 ? value : 3;
  }

  /** Un 4xx de openMAINT no mejora repitiendo; solo se insiste ante 5xx o red. */
  private isRetryable(error: unknown): boolean {
    if (error instanceof ServiceUnavailableException) {
      return false;
    }

    const status = this.getErrorStatus(error);

    return status === undefined || status >= 500;
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response &&
      typeof error.response.status === 'number'
    ) {
      return error.response.status;
    }

    return undefined;
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}
