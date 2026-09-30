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
import {
  EntityManager,
  In,
  LessThan,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AccessIotGateway } from './access-iot.gateway';
import {
  AccessIotDevice,
  AccessIotErrorCode,
  DoorAction,
  TriggerOutcome,
} from './access-iot.types';
import { BuildingCatalogService } from './building-catalog.service';
import { GuestStay } from './entities/guest-stay.entity';
import {
  RemoteOpenActorType,
  RemoteOpenRequest,
  RemoteOpenStatus,
} from './entities/remote-open-request.entity';
import { VehicularGatePhase } from './entities/vehicular-gate-phase.entity';
import {
  EffectivePhase,
  effectivePhase,
  effectiveStatus,
  GateTimings,
  gateTimings,
  GuestGateEligibility,
  guestGateEligibility,
  isRemoteGate,
  PULSE_COOLDOWN_MS,
  PulseRefusal,
  pulseRefusal,
  remoteOpenEnabled,
  STALE_ATTEMPT_MS,
} from './remote-open.rules';

const GUEST_DAILY_OPEN_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Lo que cuenta como pulso para el enfriamiento; un `failed` no llegó al relé. */
const PULSE_STATUSES: RemoteOpenStatus[] = [
  'attempted',
  'triggered',
  'uncertain',
  'opened',
  'closed',
];

const GUEST_REFUSALS: Record<Exclude<GuestGateEligibility, 'ok'>, string> = {
  cancelada: 'Tu reserva está cancelada',
  'antes-del-checkin': 'Podrás usar la puerta desde tu check-in',
  finalizada: 'Tu estadía ya terminó',
  'sin-vehicular': 'Tu reserva no incluye acceso vehicular',
};

const PHASE_REFUSALS: Record<Exclude<PulseRefusal, 'ok'>, string> = {
  'en-uso':
    'Alguien acaba de usar la barrera. Espera un momento o marca tu PIN en el teclado.',
  bajando:
    'La barrera puede estar bajando. Espera unos segundos antes de volver a pulsar.',
  'sin-confirmar':
    'La última orden a la barrera no se confirmó. Marca tu PIN en el teclado.',
  'sin-ventana': 'Pasó el tiempo para cerrarla desde aquí.',
  'de-otro': 'Solo quien abrió la barrera puede cerrarla desde aquí.',
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
  /** `triggered`: el pulso salió hacia la barrera; nada sobre su posición. */
  outcome: TriggerOutcome;
  errorCode?: AccessIotErrorCode;
  /** Hora del pulso según el backend. */
  at?: string;
  /** Fin de la ventana de cierre tras «Abrir»; nulo en lo demás. */
  openUntil: string | null;
}

export interface GuestGate {
  /** Edificio con barrera y tiempos medidos: el portal enseña el botón. */
  available: boolean;
  canOpen: boolean;
  /** Fin de la ventana de cierre, solo si la abrió este huésped. */
  openUntil: Date | null;
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
      /** Barrera vehicular con tiempos medidos: la única que se pulsa a distancia. */
      remoteControl: boolean;
      phase: EffectivePhase | null;
      lastCommand: DoorLastCommand | null;
      /** Fin de la ventana de cierre. */
      openUntil: Date | null;
      /** Fin del cierre automático: hasta entonces nadie pulsa. */
      settlesAt: Date | null;
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

interface PhaseSnapshot {
  phase: EffectivePhase;
  state: VehicularGatePhase | null;
}

const isRetryAfter = (value: unknown): value is { retryAfterMs: number } =>
  typeof (value as { retryAfterMs?: unknown })?.retryAfterMs === 'number';

/** Las filas anteriores a `trigger` dicen `opened`/`closed`: también fueron pulsos. */
const asOutcome = (status: RemoteOpenStatus): TriggerOutcome =>
  status === 'opened' || status === 'closed'
    ? 'triggered'
    : (status as TriggerOutcome);

/**
 * Apertura remota de la barrera vehicular por `trigger`, un pulso único.
 * «Abrir» y «Cerrar» son fases de interfaz que se guardan por barrera en
 * `vehicular_gate_phase`. El historial se escribe antes de llamar a la VPS, y el
 * `requestId` hace que repetir un toque no repita el pulso.
 */
@Injectable()
export class RemoteOpenService {
  private readonly logger = new Logger(RemoteOpenService.name);

  constructor(
    @InjectRepository(RemoteOpenRequest)
    private readonly requests: Repository<RemoteOpenRequest>,
    @InjectRepository(VehicularGatePhase)
    private readonly phases: Repository<VehicularGatePhase>,
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
    rawRequestId: string,
  ): Promise<RemoteOpenResult> {
    const actor: Actor = { type: 'guest', stayId: guest.stayId };
    const requestId = rawRequestId.toLowerCase();

    this.assertEnabled();

    const replay = await this.replay(actor, action, requestId);
    if (replay) return replay;

    const eligibility = guestGateEligibility(guest, new Date());
    if (eligibility !== 'ok') {
      throw new ForbiddenException(GUEST_REFUSALS[eligibility]);
    }

    const gate = (await this.catalog.devices()).find(
      (device) =>
        device.buildingId === guest.buildingId && isRemoteGate(device),
    );
    const timings = this.timingsFor(guest.buildingId);

    if (!gate || !timings) {
      throw new UnprocessableEntityException(
        'Tu edificio no tiene apertura remota de la barrera vehicular',
      );
    }

    if (action === 'open') await this.assertDailyLimit(guest.stayId);

    return this.command(actor, action, gate, timings, requestId);
  }

  async forStaff(
    deviceId: string,
    action: DoorAction,
    username: string,
    rawRequestId: string,
  ): Promise<RemoteOpenResult> {
    const actor: Actor = { type: 'staff', username };
    const requestId = rawRequestId.toLowerCase();

    this.assertEnabled();

    const replay = await this.replay(actor, action, requestId);
    if (replay) return replay;

    const { device, timings } = await this.staffGate(deviceId);

    return this.command(actor, action, device, timings, requestId);
  }

  /** Tras un pulso sin confirmar, el Supervisor CAV revisa la barrera y la libera. */
  async resolveUncertain(
    deviceId: string,
    username: string,
  ): Promise<{ deviceId: string; phase: EffectivePhase }> {
    const { device, timings } = await this.staffGate(deviceId);

    await this.requests.manager.transaction(async (manager) => {
      await this.lock(manager, device.deviceId);
      const now = new Date();
      const { phase, state } = await this.snapshot(
        manager,
        device.deviceId,
        timings,
        now,
      );

      if (phase !== 'uncertain') {
        throw new ConflictException(
          'La barrera no tiene una orden sin confirmar',
        );
      }

      await manager.save(VehicularGatePhase, {
        deviceId: device.deviceId,
        buildingId: device.buildingId,
        phase: 'ready',
        pulsedAt: state?.pulsedAt ?? null,
        openedByStayId: null,
        openedByUsername: null,
        requestId: null,
        resolvedBy: username,
        updatedAt: now,
      });
    });

    this.logger.log(
      `Barrera ${device.deviceId} liberada a mano por usuario=${username}`,
    );

    return { deviceId: device.deviceId, phase: 'ready' };
  }

  /** Lo que el portal enseña: la misma fase que comprueba la orden. */
  async guestGate(
    stayId: string,
    buildingId: number | null,
  ): Promise<GuestGate> {
    const unavailable: GuestGate = {
      available: false,
      canOpen: false,
      openUntil: null,
    };
    const timings = this.timingsFor(buildingId);

    if (!timings) return unavailable;

    let gate: AccessIotDevice | undefined;
    try {
      gate = (await this.catalog.devices()).find(
        (device) => device.buildingId === buildingId && isRemoteGate(device),
      );
    } catch (error) {
      // El portal no se cae por la VPS: sin catálogo solo falta el botón.
      this.logger.warn(
        `Sin catálogo de puertas para el portal: ${(error as Error).message}`,
      );
      return unavailable;
    }

    if (!gate) return unavailable;

    const now = new Date();
    const { phase, state } = await this.snapshot(
      this.requests.manager,
      gate.deviceId,
      timings,
      now,
    );

    return {
      available: true,
      canOpen: phase === 'ready',
      openUntil:
        phase === 'closable' && state?.openedByStayId === stayId
          ? this.closeWindowEnd(state, timings)
          : null,
    };
  }

  /**
   * El `online` sale fresco de la VPS, no de la caché: es lo que el supervisor
   * mira. Releer también deja en caché las puertas que luego puede pulsar.
   */
  async listDoors(): Promise<DoorsOverview> {
    const [buildings, devices, lastCommands] = await Promise.all([
      this.catalog.list(),
      this.catalog.devices(true),
      this.lastCommandByDevice(),
    ]);
    const gates = devices.filter(
      (device) => isRemoteGate(device) && this.timingsFor(device.buildingId),
    );
    const snapshots = await this.snapshots(gates);

    const buildingIds = [
      ...new Set(devices.map((device) => device.buildingId)),
    ];

    return {
      enabled: this.isEnabled(),
      buildings: buildingIds.map((buildingId) => {
        const building = buildings.find(
          (candidate) => candidate.buildingId === buildingId,
        );
        const timings = this.timingsFor(buildingId);

        return {
          buildingId,
          name: building?.name ?? `Edificio ${buildingId}`,
          online: building?.online ?? false,
          doors: devices
            .filter((device) => device.buildingId === buildingId)
            .map((device) => {
              const snapshot = snapshots.get(device.deviceId);
              const phase = snapshot?.phase ?? null;
              const pulsedAt = snapshot?.state?.pulsedAt ?? null;
              const moving = phase === 'closable' || phase === 'settling';

              return {
                deviceId: device.deviceId,
                kind: device.kind,
                scope: device.scope,
                online: device.online,
                remoteControl: snapshot !== undefined,
                phase,
                lastCommand: lastCommands.get(device.deviceId) ?? null,
                openUntil:
                  phase === 'closable' && snapshot?.state && timings
                    ? this.closeWindowEnd(snapshot.state, timings)
                    : null,
                settlesAt:
                  moving && pulsedAt && timings
                    ? new Date(pulsedAt.getTime() + timings.autoCloseMs)
                    : null,
              };
            }),
        };
      }),
    };
  }

  private timingsFor(buildingId: number | null): GateTimings | null {
    return gateTimings(
      this.config.get<string>('ACCESS_VEHICULAR_GATE_TIMINGS'),
      buildingId,
    );
  }

  private closeWindowEnd(
    state: VehicularGatePhase,
    timings: GateTimings,
  ): Date | null {
    return state.pulsedAt
      ? new Date(state.pulsedAt.getTime() + timings.closeWindowMs)
      : null;
  }

  /** El Supervisor CAV solo opera barreras vehiculares con tiempos medidos. */
  private async staffGate(
    deviceId: string,
  ): Promise<{ device: AccessIotDevice; timings: GateTimings }> {
    const find = (devices: AccessIotDevice[]) =>
      devices.find((candidate) => candidate.deviceId === deviceId);
    // Una puerta recién dada de alta en la VPS aún no está en la caché.
    const device =
      find(await this.catalog.devices()) ??
      find(await this.catalog.devices(true));

    if (!device) {
      throw new NotFoundException(`La puerta ${deviceId} no existe`);
    }

    if (!isRemoteGate(device)) {
      throw new UnprocessableEntityException(
        'Solo las barreras vehiculares admiten apertura remota',
      );
    }

    const timings = this.timingsFor(device.buildingId);

    if (!timings) {
      throw new UnprocessableEntityException(
        'El edificio no tiene medidos los tiempos de la barrera: la apertura remota no está disponible',
      );
    }

    return { device, timings };
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
    const row = await this.requests.findOne({ where: { requestId } });

    if (!row) return null;

    const sameRequest =
      row.action === action &&
      (actor.type === 'guest'
        ? row.actorType === 'guest' && row.guestStayId === actor.stayId
        : row.actorType === 'staff' && row.actorUsername === actor.username);

    if (!sameRequest) {
      throw new ConflictException('Esa solicitud pertenece a otra orden');
    }

    const now = new Date();
    const status = effectiveStatus(row, now);

    if (status === 'attempted') {
      throw new ConflictException('La solicitud anterior sigue en curso');
    }

    const outcome = asOutcome(status);
    const timings = this.timingsFor(row.buildingId);
    const state =
      outcome === 'triggered' && action === 'open' && timings
        ? await this.phases.findOne({ where: { deviceId: row.deviceId } })
        : null;
    // Solo mientras esta apertura siga siendo la vigente: otro pudo cerrarla ya.
    const until =
      state?.phase === 'open' && state.requestId === row.requestId && timings
        ? this.closeWindowEnd(state, timings)
        : null;

    return {
      requestId,
      outcome,
      errorCode: row.errorCode ?? undefined,
      at: (row.finishedAt ?? row.requestedAt).toISOString(),
      openUntil: until && until > now ? until.toISOString() : null,
    };
  }

  private async command(
    actor: Actor,
    action: DoorAction,
    device: AccessIotDevice,
    timings: GateTimings,
    requestId: string,
  ): Promise<RemoteOpenResult> {
    const reserved = await this.reserve(
      actor,
      action,
      device,
      timings,
      requestId,
    );

    if (isRetryAfter(reserved)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'La barrera acaba de recibir una orden. Espera unos segundos.',
          retryAfterSeconds: Math.ceil(reserved.retryAfterMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { outcome, errorCode, at } = await this.pulse(actor, reserved);

    await this.advancePhase(reserved, outcome, at);

    return {
      requestId,
      outcome,
      errorCode,
      at: at.toISOString(),
      openUntil:
        outcome === 'triggered' && action === 'open'
          ? new Date(at.getTime() + timings.closeWindowMs).toISOString()
          : null,
    };
  }

  /**
   * Fase, enfriamiento y alta del `attempted` bajo un candado por barrera, para
   * que dos toques simultáneos no pasen los dos. Una fase que no admite el
   * pulso es un `409` sin llamar a la VPS.
   */
  private async reserve(
    actor: Actor,
    action: DoorAction,
    device: AccessIotDevice,
    timings: GateTimings,
    requestId: string,
  ): Promise<RemoteOpenRequest | { retryAfterMs: number }> {
    try {
      return await this.requests.manager.transaction(async (manager) => {
        await this.lock(manager, device.deviceId);

        const now = new Date();
        const { phase, state } = await this.snapshot(
          manager,
          device.deviceId,
          timings,
          now,
        );
        const refusal = pulseRefusal(
          action,
          phase,
          actor.type === 'guest' ? actor : { type: 'staff' },
          state?.openedByStayId ?? null,
        );

        if (refusal !== 'ok') {
          throw new ConflictException(PHASE_REFUSALS[refusal]);
        }

        const last = await manager.findOne(RemoteOpenRequest, {
          where: {
            deviceId: device.deviceId,
            status: In(PULSE_STATUSES),
            requestedAt: MoreThan(new Date(now.getTime() - PULSE_COOLDOWN_MS)),
          },
          order: { requestedAt: 'DESC' },
        });

        if (last) {
          return {
            retryAfterMs:
              PULSE_COOLDOWN_MS - (now.getTime() - last.requestedAt.getTime()),
          };
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

  /** `actor` no viaja a la VPS: esta fila es el único registro de quién pulsó. */
  private async pulse(
    actor: Actor,
    row: RemoteOpenRequest,
  ): Promise<{
    outcome: TriggerOutcome;
    errorCode?: AccessIotErrorCode;
    at: Date;
  }> {
    const result = await this.iot.triggerDevice(row.deviceId, {
      requestId: row.requestId,
    });
    const at = new Date();

    await this.requests.update(row.id, {
      status: result.outcome,
      errorCode: result.errorCode ?? null,
      finishedAt: at,
    });

    this.logger.log(
      `Pulso remoto (${row.action}) en ${row.deviceId}: ${result.outcome}` +
        (result.errorCode ? `/${result.errorCode}` : '') +
        ` por ${actor.type === 'guest' ? `estancia=${actor.stayId}` : `usuario=${actor.username}`}` +
        ` request=${row.requestId}`,
    );

    return { outcome: result.outcome, errorCode: result.errorCode, at };
  }

  /** Un `failed` no toca la fase; un incierto nunca la deduce: queda `uncertain`. */
  private async advancePhase(
    row: RemoteOpenRequest,
    outcome: TriggerOutcome,
    at: Date,
  ): Promise<void> {
    if (outcome === 'failed') return;

    const opened = outcome === 'triggered' && row.action === 'open';

    await this.phases.save({
      deviceId: row.deviceId,
      buildingId: row.buildingId,
      phase: outcome === 'uncertain' ? 'uncertain' : opened ? 'open' : 'ready',
      pulsedAt: at,
      openedByStayId: opened ? row.guestStayId : null,
      openedByUsername: opened ? row.actorUsername : null,
      requestId: row.requestId,
      resolvedBy: null,
      updatedAt: at,
    });
  }

  private async lock(manager: EntityManager, deviceId: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      deviceId,
    ]);
  }

  private async snapshot(
    manager: EntityManager,
    deviceId: string,
    timings: GateTimings,
    now: Date,
  ): Promise<PhaseSnapshot> {
    const [state, stale] = await Promise.all([
      manager.findOne(VehicularGatePhase, { where: { deviceId } }),
      manager.findOne(RemoteOpenRequest, {
        where: {
          deviceId,
          status: 'attempted',
          requestedAt: LessThan(new Date(now.getTime() - STALE_ATTEMPT_MS)),
        },
        order: { requestedAt: 'DESC' },
      }),
    ]);

    return {
      phase: effectivePhase(state, stale?.requestedAt ?? null, timings, now),
      state,
    };
  }

  private async snapshots(
    gates: AccessIotDevice[],
  ): Promise<Map<string, PhaseSnapshot>> {
    const now = new Date();
    const result = new Map<string, PhaseSnapshot>();

    for (const gate of gates) {
      const timings = this.timingsFor(gate.buildingId);
      if (!timings) continue;

      result.set(
        gate.deviceId,
        await this.snapshot(this.requests.manager, gate.deviceId, timings, now),
      );
    }

    return result;
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
}
