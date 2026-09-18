import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, QueryFailedError, Repository } from 'typeorm';
import { AccessIotGateway } from './access-iot.gateway';
import {
  AccessIotDevice,
  AccessIotErrorCode,
  DoorAction,
  DoorCommandOutcome,
} from './access-iot.types';
import { BuildingCatalogService } from './building-catalog.service';
import { GuestStay } from './entities/guest-stay.entity';
import {
  RemoteOpenActorType,
  RemoteOpenRequest,
  RemoteOpenStatus,
} from './entities/remote-open-request.entity';
import {
  aggregateOutcome,
  DeviceCommandOutcome,
  effectiveStatus,
  GuestGateEligibility,
  guestGateEligibility,
  openUntil,
  remoteOpenEnabled,
  VEHICULAR_AUTO_CLOSE_MS,
} from './remote-open.rules';

/** Protege el relé: la misma orden no se repite sobre una puerta en menos de esto. */
const COOLDOWN_MS = 10_000;
const GUEST_DAILY_OPEN_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Lo que cuenta como pulso enviado para el enfriamiento; un `failed` no llegó al relé. */
const PULSE_STATUSES: RemoteOpenStatus[] = [
  'attempted',
  'opened',
  'closed',
  'uncertain',
];
const CONFIRMED_STATUSES: RemoteOpenStatus[] = ['opened', 'closed'];

const GUEST_REFUSALS: Record<Exclude<GuestGateEligibility, 'ok'>, string> = {
  cancelada: 'Tu reserva está cancelada',
  'antes-del-checkin': 'Podrás usar la puerta desde tu check-in',
  finalizada: 'Tu estadía ya terminó',
  'sin-vehicular': 'Tu reserva no incluye acceso vehicular',
};

const COOLDOWN_MESSAGES: Record<DoorAction, string> = {
  open: 'La puerta se acaba de abrir. Espera unos segundos.',
  close: 'La puerta se acaba de cerrar. Espera unos segundos.',
};

export interface GuestOpenInput {
  stayId: string;
  buildingId: number | null;
  stayStatus: GuestStay['status'];
  accessValidFrom: Date;
  accessValidTo: Date;
  hasVehicularAccess: boolean;
}

type Actor =
  | { type: 'guest'; stayId: string }
  | { type: 'staff'; username: string };

export interface RemoteOpenResult {
  requestId: string;
  outcome: DoorCommandOutcome;
  errorCode?: AccessIotErrorCode;
  at?: string;
  /** Hasta cuándo sigue arriba la barrera tras abrirla; nulo en lo demás. */
  openUntil: string | null;
}

export interface DoorLastCommand {
  action: DoorAction;
  outcome: RemoteOpenStatus;
  at: Date;
  actorType: RemoteOpenActorType;
  actorUsername: string | null;
}

export interface DoorsOverview {
  enabled: boolean;
  buildings: {
    buildingId: number;
    name: string;
    online: boolean;
    doors: {
      deviceId: string;
      kind: string;
      scope: AccessIotDevice['scope'];
      online: boolean;
      lastCommand: DoorLastCommand | null;
      openUntil: Date | null;
    }[];
  }[];
}

interface CommandRow {
  device_id: string;
  action: DoorAction;
  status: RemoteOpenStatus;
  requested_at: Date;
  actor_type: RemoteOpenActorType;
  actor_username: string | null;
}

/**
 * Apertura y cierre remoto de puertas. El historial se escribe antes de llamar
 * a la VPS, y el `requestId` hace que repetir un toque no repita el pulso.
 * Solo las vehiculares se cierran a mano: las peatonales vuelven a trabar solas.
 */
@Injectable()
export class RemoteOpenService {
  private readonly logger = new Logger(RemoteOpenService.name);

  constructor(
    @InjectRepository(RemoteOpenRequest)
    private readonly requests: Repository<RemoteOpenRequest>,
    private readonly catalog: BuildingCatalogService,
    private readonly iot: AccessIotGateway,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return remoteOpenEnabled(this.config);
  }

  async forGuest(
    guest: GuestOpenInput,
    action: DoorAction,
    requestId: string,
  ): Promise<RemoteOpenResult> {
    const actor: Actor = { type: 'guest', stayId: guest.stayId };

    this.assertEnabled();

    const replay = await this.replay(actor, action, requestId);
    if (replay) return replay;

    const eligibility = guestGateEligibility(guest, new Date());
    if (eligibility !== 'ok') {
      throw new ForbiddenException(GUEST_REFUSALS[eligibility]);
    }

    const gates = (await this.catalog.devices()).filter(
      (device) =>
        device.buildingId === guest.buildingId && device.scope === 'vehicular',
    );

    if (gates.length === 0) {
      throw new UnprocessableEntityException(
        'Tu edificio no tiene una puerta vehicular con apertura remota',
      );
    }

    if (action === 'open') {
      await this.assertDailyLimit(guest.stayId);
    } else if (!(await this.guestOpenUntil(guest.stayId, guest.buildingId))) {
      // Solo quien la abrió la baja antes de tiempo: bajarla sobre el auto de otro no.
      throw new ConflictException(
        'La puerta ya se cerró, o no la abriste desde aquí',
      );
    }

    return this.command(actor, action, gates, requestId);
  }

  async forStaff(
    deviceId: string,
    action: DoorAction,
    username: string,
    requestId: string,
  ): Promise<RemoteOpenResult> {
    const actor: Actor = { type: 'staff', username };

    this.assertEnabled();

    const replay = await this.replay(actor, action, requestId);
    if (replay) return replay;

    const device = (await this.catalog.devices()).find(
      (candidate) => candidate.deviceId === deviceId,
    );

    if (!device) {
      throw new NotFoundException(`La puerta ${deviceId} no existe`);
    }

    if (action === 'close' && device.scope !== 'vehicular') {
      throw new UnprocessableEntityException(
        'Las puertas peatonales se traban solas: no hay nada que cerrar',
      );
    }

    return this.command(actor, action, [device], requestId);
  }

  /** Hasta cuándo puede este huésped bajar la barrera: solo si la última apertura fue suya. */
  async guestOpenUntil(
    stayId: string,
    buildingId: number | null,
  ): Promise<Date | null> {
    if (buildingId === null) return null;

    const now = new Date();
    const last = await this.requests.findOne({
      where: {
        buildingId,
        deviceScope: 'vehicular',
        status: In(CONFIRMED_STATUSES),
        requestedAt: MoreThan(
          new Date(now.getTime() - VEHICULAR_AUTO_CLOSE_MS),
        ),
      },
      order: { requestedAt: 'DESC' },
    });

    return last?.guestStayId === stayId ? openUntil(last, now) : null;
  }

  /** El `online` sale fresco de la VPS, no de la caché: es lo que el supervisor mira. */
  async listDoors(): Promise<DoorsOverview> {
    const [buildings, devices, lastCommands, openWindows] = await Promise.all([
      this.catalog.list(),
      this.iot.listDevices(),
      this.lastCommandByDevice(),
      this.openUntilByDevice(),
    ]);

    const buildingIds = [
      ...new Set(devices.map((device) => device.buildingId)),
    ];

    return {
      enabled: this.isEnabled(),
      buildings: buildingIds.map((buildingId) => {
        const building = buildings.find(
          (candidate) => candidate.buildingId === buildingId,
        );

        return {
          buildingId,
          name: building?.name ?? `Edificio ${buildingId}`,
          online: building?.online ?? false,
          doors: devices
            .filter((device) => device.buildingId === buildingId)
            .map((device) => ({
              deviceId: device.deviceId,
              kind: device.kind,
              scope: device.scope,
              online: device.online,
              lastCommand: lastCommands.get(device.deviceId) ?? null,
              openUntil:
                device.scope === 'vehicular'
                  ? (openWindows.get(device.deviceId) ?? null)
                  : null,
            })),
        };
      }),
    };
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'La apertura remota está desactivada',
      );
    }
  }

  private async assertDailyLimit(stayId: string): Promise<void> {
    const today = await this.requests.count({
      where: {
        guestStayId: stayId,
        action: 'open',
        requestedAt: MoreThan(new Date(Date.now() - DAY_MS)),
      },
    });

    if (today >= GUEST_DAILY_OPEN_LIMIT) {
      throw new HttpException(
        'Alcanzaste el límite de aperturas remotas de hoy. Usa tu PIN en el teclado.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Mismo `requestId`, actor y orden: se devuelve lo que pasó, sin otro pulso. */
  private async replay(
    actor: Actor,
    action: DoorAction,
    requestId: string,
  ): Promise<RemoteOpenResult | null> {
    const rows = await this.requests.find({ where: { requestId } });

    if (rows.length === 0) return null;

    const sameRequest = rows.every(
      (row) =>
        row.action === action &&
        (actor.type === 'guest'
          ? row.actorType === 'guest' && row.guestStayId === actor.stayId
          : row.actorType === 'staff' && row.actorUsername === actor.username),
    );

    if (!sameRequest) {
      throw new ConflictException('Esa solicitud pertenece a otra orden');
    }

    const now = new Date();
    const statuses = rows.map((row) => effectiveStatus(row, now));

    if (statuses.includes('attempted')) {
      throw new ConflictException('La solicitud anterior sigue en curso');
    }

    const result = aggregateOutcome(
      rows.map((row, index) => ({
        deviceId: row.deviceId,
        outcome: statuses[index] as DoorCommandOutcome,
        errorCode: row.errorCode,
        at: (row.finishedAt ?? row.requestedAt).toISOString(),
      })),
    );
    const opened = rows.find((row) => row.status === 'opened');

    return {
      requestId,
      ...result,
      openUntil:
        opened?.deviceScope === 'vehicular'
          ? (openUntil(opened, now)?.toISOString() ?? null)
          : null,
    };
  }

  private async command(
    actor: Actor,
    action: DoorAction,
    devices: AccessIotDevice[],
    requestId: string,
  ): Promise<RemoteOpenResult> {
    const results: DeviceCommandOutcome[] = [];
    let retryAfterMs = 0;
    let vehicularOpened: RemoteOpenRequest | null = null;

    for (const device of devices) {
      const row = await this.reserve(actor, action, device, requestId);

      if (typeof row === 'number') {
        retryAfterMs = Math.max(retryAfterMs, row);
        continue;
      }

      const result = await this.pulse(actor, row);
      results.push(result);

      if (result.outcome === 'opened' && device.scope === 'vehicular') {
        vehicularOpened = row;
      }
    }

    if (results.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: COOLDOWN_MESSAGES[action],
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      requestId,
      ...aggregateOutcome(results),
      openUntil: vehicularOpened
        ? new Date(
            vehicularOpened.requestedAt.getTime() + VEHICULAR_AUTO_CLOSE_MS,
          ).toISOString()
        : null,
    };
  }

  /**
   * Enfriamiento y alta del `attempted` bajo un candado por puerta, para que dos
   * toques simultáneos no pasen los dos. Devuelve los ms de espera si toca esperar.
   */
  private async reserve(
    actor: Actor,
    action: DoorAction,
    device: AccessIotDevice,
    requestId: string,
  ): Promise<RemoteOpenRequest | number> {
    try {
      return await this.requests.manager.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          device.deviceId,
        ]);

        const now = new Date();
        // Por orden y no por puerta: cerrar justo después de abrir es el caso de uso.
        const last = await manager.findOne(RemoteOpenRequest, {
          where: {
            deviceId: device.deviceId,
            action,
            status: In(PULSE_STATUSES),
            requestedAt: MoreThan(new Date(now.getTime() - COOLDOWN_MS)),
          },
          order: { requestedAt: 'DESC' },
        });

        if (last) {
          return COOLDOWN_MS - (now.getTime() - last.requestedAt.getTime());
        }

        return manager.save(
          manager.create(RemoteOpenRequest, {
            requestId,
            deviceId: device.deviceId,
            buildingId: device.buildingId,
            deviceScope: device.scope,
            action,
            actorType: actor.type,
            guestStayId: actor.type === 'guest' ? actor.stayId : null,
            actorUsername: actor.type === 'staff' ? actor.username : null,
            status: 'attempted',
            errorCode: null,
            requestedAt: now,
            finishedAt: null,
          }),
        );
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException('La solicitud anterior sigue en curso');
      }

      throw error;
    }
  }

  private async pulse(
    actor: Actor,
    row: RemoteOpenRequest,
  ): Promise<DeviceCommandOutcome> {
    const result = await this.iot.commandDevice(row.deviceId, row.action, {
      requestId: row.requestId,
      actor: {
        type: actor.type,
        ref: actor.type === 'guest' ? actor.stayId : actor.username,
      },
    });

    await this.requests.update(row.id, {
      status: result.outcome,
      errorCode: result.errorCode ?? null,
      finishedAt: new Date(),
    });
    row.status = result.outcome;

    this.logger.log(
      `Orden remota ${row.action} en ${row.deviceId}: ${result.outcome}` +
        (result.errorCode ? `/${result.errorCode}` : '') +
        ` por ${actor.type === 'guest' ? `estancia=${actor.stayId}` : `usuario=${actor.username}`}` +
        ` request=${row.requestId}`,
    );

    return {
      deviceId: row.deviceId,
      outcome: result.outcome,
      errorCode: result.errorCode,
      at: result.at ?? new Date().toISOString(),
    };
  }

  private async lastCommandByDevice(): Promise<Map<string, DoorLastCommand>> {
    const rows: CommandRow[] = await this.requests.query(
      `SELECT DISTINCT ON ("device_id") "device_id", "action", "status", "requested_at", "actor_type", "actor_username"
         FROM "remote_open_request"
        ORDER BY "device_id", "requested_at" DESC`,
    );
    const now = new Date();

    return new Map(
      rows.map((row) => [
        row.device_id,
        {
          action: row.action,
          outcome: effectiveStatus(
            { status: row.status, requestedAt: row.requested_at },
            now,
          ),
          at: row.requested_at,
          actorType: row.actor_type,
          actorUsername: row.actor_username,
        },
      ]),
    );
  }

  private async openUntilByDevice(): Promise<Map<string, Date>> {
    const now = new Date();
    const rows: CommandRow[] = await this.requests.query(
      `SELECT DISTINCT ON ("device_id") "device_id", "status", "requested_at"
         FROM "remote_open_request"
        WHERE "status" IN ('opened', 'closed') AND "requested_at" > $1
        ORDER BY "device_id", "requested_at" DESC`,
      [new Date(now.getTime() - VEHICULAR_AUTO_CLOSE_MS)],
    );
    const windows = new Map<string, Date>();

    for (const row of rows) {
      const until = openUntil(
        { status: row.status, requestedAt: row.requested_at },
        now,
      );
      if (until) windows.set(row.device_id, until);
    }

    return windows;
  }
}
