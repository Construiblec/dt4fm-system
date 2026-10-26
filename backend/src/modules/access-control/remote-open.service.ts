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
  cooldownEnd,
  EffectivePhase,
  effectivePhase,
  effectiveStatus,
  GateTimings,
  gateTimings,
  GuestGateEligibility,
  guestGateEligibility,
  isPedestrianDoor,
  isRemoteGate,
  PEDESTRIAN_COOLDOWN_MS,
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
  /** Fin del enfriamiento de la barrera; nulo si el pulso no salió o ya pasó. */
  cooldownUntil: string | null;
}

export interface GuestGate {
  /** Edificio con barrera y tiempos medidos: el portal enseña el botón. */
  available: boolean;
  canOpen: boolean;
  /** Fin de la ventana de cierre, solo si la abrió este huésped. */
  openUntil: Date | null;
  /** Fin del enfriamiento: hasta entonces el botón sale deshabilitado. */
  cooldownUntil: Date | null;
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
      /** Barrera vehicular con tiempos medidos o terminal peatonal: se pulsa a distancia. */
      remoteControl: boolean;
      phase: EffectivePhase | null;
      lastCommand: DoorLastCommand | null;
      /** Fin de la ventana de cierre. */
      openUntil: Date | null;
      /** Fin del cierre automático: hasta entonces nadie pulsa. */
      settlesAt: Date | null;
      /** Fin del enfriamiento tras el último pulso. */
      cooldownUntil: Date | null;
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
  cooldownUntil: Date | null;
}

const isRetryAfter = (value: unknown): value is { retryAfterMs: number } =>
  typeof (value as { retryAfterMs?: unknown })?.retryAfterMs === 'number';

/** Las filas anteriores a `trigger` dicen `opened`/`closed`: también fueron pulsos. */
const asOutcome = (status: RemoteOpenStatus): TriggerOutcome =>
  status === 'opened' || status === 'closed'
    ? 'triggered'
    : (status as TriggerOutcome);

/** Sin tiempos de barrera: la puerta es peatonal y se enfría 5 s, sin fase. */
const cooldownFor = (timings: GateTimings | null) =>
  timings ? PULSE_COOLDOWN_MS : PEDESTRIAN_COOLDOWN_MS;

/**
 * Apertura remota por `trigger`, un pulso único. En la barrera vehicular
 * «Abrir» y «Cerrar» son fases de interfaz guardadas en `vehicular_gate_phase`;
 * la peatonal solo tiene «Abrir», sin fase. El historial se escribe antes de llamar
 * a la VPS, y el `requestId` hace que repetir un toque no repita el pulso.
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

    const { device, timings } = await this.staffDoor(deviceId, action);

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
      cooldownUntil: null,
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
    const { phase, state, cooldownUntil } = await this.snapshot(
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
      cooldownUntil,
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
    const [snapshots, pedestrianCooldowns] = await Promise.all([
      this.snapshots(gates),
      this.pedestrianCooldowns(devices.filter(isPedestrianDoor)),
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
        const timings = this.timingsFor(buildingId);

        return {
          buildingId,
          name: building?.name ?? `Edificio ${buildingId}`,
          online: building?.online ?? false,
          doors: devices
            .filter((device) => device.buildingId === buildingId)
            .map((device) => {
              if (isPedestrianDoor(device)) {
                return {
                  deviceId: device.deviceId,
                  kind: device.kind,
                  scope: device.scope,
                  online: device.online,
                  remoteControl: true,
                  phase: null,
                  lastCommand: lastCommands.get(device.deviceId) ?? null,
                  openUntil: null,
                  settlesAt: null,
                  cooldownUntil:
                    pedestrianCooldowns.get(device.deviceId) ?? null,
                };
              }

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
                cooldownUntil: snapshot?.cooldownUntil ?? null,
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

  /** El Supervisor CAV pulsa barreras vehiculares con tiempos medidos y terminales peatonales. */
  private async staffDoor(
    deviceId: string,
    action: DoorAction,
  ): Promise<{ device: AccessIotDevice; timings: GateTimings | null }> {
    const device = await this.findDevice(deviceId);

    if (!isPedestrianDoor(device)) return this.staffGate(deviceId, device);

    if (action !== 'open') {
      throw new UnprocessableEntityException(
        'Las puertas peatonales solo admiten «Abrir»',
      );
    }

    return { device, timings: null };
  }

  private async findDevice(deviceId: string): Promise<AccessIotDevice> {
    const find = (devices: AccessIotDevice[]) =>
      devices.find((candidate) => candidate.deviceId === deviceId);
    // Una puerta recién dada de alta en la VPS aún no está en la caché.
    const device =
      find(await this.catalog.devices()) ??
      find(await this.catalog.devices(true));

    if (!device) {
      throw new NotFoundException(`La puerta ${deviceId} no existe`);
    }

    return device;
  }

  /** Solo las barreras vehiculares con tiempos medidos tienen fase. */
  private async staffGate(
    deviceId: string,
    known?: AccessIotDevice,
  ): Promise<{ device: AccessIotDevice; timings: GateTimings }> {
    const device = known ?? (await this.findDevice(deviceId));

    if (!isRemoteGate(device)) {
      throw new UnprocessableEntityException(
        'Esta puerta no admite apertura remota',
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
    const pedestrian = row.deviceScope === 'pedestrian';
    const timings = pedestrian ? null : this.timingsFor(row.buildingId);
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
      cooldownUntil:
        (outcome === 'failed'
          ? null
          : cooldownEnd(
              row.requestedAt,
              now,
              pedestrian ? PEDESTRIAN_COOLDOWN_MS : PULSE_COOLDOWN_MS,
            )?.toISOString()) ?? null,
    };
  }

  /** `timings` nulo: puerta peatonal, sin fase. */
  private async command(
    actor: Actor,
    action: DoorAction,
    device: AccessIotDevice,
    timings: GateTimings | null,
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
          message: `La ${timings ? 'barrera' : 'puerta'} acaba de recibir una orden. Espera unos segundos.`,
          retryAfterSeconds: Math.ceil(reserved.retryAfterMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { outcome, errorCode, at } = await this.pulse(actor, reserved);

    // En la peatonal un incierto es solo un aviso: no hay fase que bloquear.
    if (timings) await this.advancePhase(reserved, outcome, at);

    return {
      requestId,
      outcome,
      errorCode,
      at: at.toISOString(),
      openUntil:
        outcome === 'triggered' && action === 'open' && timings
          ? new Date(at.getTime() + timings.closeWindowMs).toISOString()
          : null,
      // Cuenta desde que se reservó la orden, igual que el `429`.
      cooldownUntil:
        outcome === 'failed'
          ? null
          : new Date(
              reserved.requestedAt.getTime() + cooldownFor(timings),
            ).toISOString(),
    };
  }

  /**
   * Fase, enfriamiento y alta del `attempted` bajo un candado por barrera, para
   * que dos toques simultáneos no pasen los dos. Una fase que no admite el
   * pulso es un `409` sin llamar a la VPS. La peatonal solo mira el enfriamiento.
   */
  private async reserve(
    actor: Actor,
    action: DoorAction,
    device: AccessIotDevice,
    timings: GateTimings | null,
    requestId: string,
  ): Promise<RemoteOpenRequest | { retryAfterMs: number }> {
    try {
      return await this.requests.manager.transaction(async (manager) => {
        await this.lock(manager, device.deviceId);

        const now = new Date();
        let cooldownUntil: Date | null;

        if (timings) {
          const snapshot = await this.snapshot(
            manager,
            device.deviceId,
            timings,
            now,
          );
          const refusal = pulseRefusal(
            action,
            snapshot.phase,
            actor.type === 'guest' ? actor : { type: 'staff' },
            snapshot.state?.openedByStayId ?? null,
          );

          if (refusal !== 'ok') {
            throw new ConflictException(PHASE_REFUSALS[refusal]);
          }

          cooldownUntil = snapshot.cooldownUntil;
        } else {
          cooldownUntil = await this.cooldownUntil(
            manager,
            device.deviceId,
            PEDESTRIAN_COOLDOWN_MS,
            now,
          );
        }

        if (cooldownUntil) {
          return { retryAfterMs: cooldownUntil.getTime() - now.getTime() };
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
    const [state, stale, cooldownUntil] = await Promise.all([
      manager.findOne(VehicularGatePhase, { where: { deviceId } }),
      manager.findOne(RemoteOpenRequest, {
        where: {
          deviceId,
          status: 'attempted',
          requestedAt: LessThan(new Date(now.getTime() - STALE_ATTEMPT_MS)),
        },
        order: { requestedAt: 'DESC' },
      }),
      this.cooldownUntil(manager, deviceId, PULSE_COOLDOWN_MS, now),
    ]);

    return {
      phase: effectivePhase(state, stale?.requestedAt ?? null, timings, now),
      state,
      cooldownUntil,
    };
  }

  /** Fin del enfriamiento contado desde el último pulso en la base. */
  private async cooldownUntil(
    manager: EntityManager,
    deviceId: string,
    cooldownMs: number,
    now: Date,
  ): Promise<Date | null> {
    const lastPulse = await manager.findOne(RemoteOpenRequest, {
      where: {
        deviceId,
        status: In(PULSE_STATUSES),
        requestedAt: MoreThan(new Date(now.getTime() - cooldownMs)),
      },
      order: { requestedAt: 'DESC' },
    });

    return cooldownEnd(lastPulse?.requestedAt ?? null, now, cooldownMs);
  }

  private async pedestrianCooldowns(
    doors: AccessIotDevice[],
  ): Promise<Map<string, Date | null>> {
    const now = new Date();
    const result = new Map<string, Date | null>();

    for (const door of doors) {
      result.set(
        door.deviceId,
        await this.cooldownUntil(
          this.requests.manager,
          door.deviceId,
          PEDESTRIAN_COOLDOWN_MS,
          now,
        ),
      );
    }

    return result;
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
