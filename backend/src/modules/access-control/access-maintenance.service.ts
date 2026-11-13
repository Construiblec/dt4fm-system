import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { BUSINESS_TIMEZONE } from '../push-notifications/scheduler/scheduler.constants';
import { AccessIotGateway } from './access-iot.gateway';
import { AccessIotDevice, InventoryUser } from './access-iot.types';
import {
  deriveEmployeeNo,
  normalizeScopes,
  scopesOf,
  unionScopes,
} from './credential-scopes';
import { CredentialService, LIVE_STATUSES } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';

/** Tope defensivo de páginas, para no iterar sin fin ante un cursor anómalo. */
const MAX_INVENTORY_PAGES = 50;

/** Cuánto atrás se buscan credenciales cerradas que puedan seguir en un aparato. */
const CLOSED_LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;

/** El terminal guarda la vigencia al segundo; los milisegundos de Postgres no cuentan. */
const sameSecond = (wire: string | null | undefined, date: Date): boolean =>
  wire != null &&
  Math.floor(Date.parse(wire) / 1000) === Math.floor(date.getTime() / 1000);

@Injectable()
export class AccessMaintenanceService {
  private readonly logger = new Logger(AccessMaintenanceService.name);

  constructor(
    @InjectRepository(AccessCredential)
    private readonly credentials: Repository<AccessCredential>,
    private readonly credentialService: CredentialService,
    private readonly iot: AccessIotGateway,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Contabilidad, no seguridad: el terminal ya ignora una credencial fuera de
   * su ventana. Marcarla es lo que permite que la purga la recoja después.
   */
  @Cron('10 * * * *', { timeZone: BUSINESS_TIMEZONE })
  async expire(): Promise<void> {
    if (!this.enabled()) return;

    const vencidas = await this.credentials.find({
      where: { status: In(LIVE_STATUSES), validTo: LessThan(new Date()) },
      take: 200,
    });

    // `update` y no `save`: no pisa lo que una sincronización en curso esté anotando.
    for (const credential of vencidas) {
      await this.credentials.update(
        { id: credential.id, status: In(LIVE_STATUSES) },
        { status: 'expired', syncState: 'pending', syncAttempts: 0 },
      );
    }

    if (vencidas.length > 0) {
      this.logger.log(`${vencidas.length} credencial(es) marcadas expiradas`);
    }
  }

  /**
   * Si solo expira la ventana sin borrar el registro, el hueco sigue ocupado y
   * el terminal acaba lleno rechazando altas. No es higiene opcional.
   */
  @Cron('0 3 * * *', { timeZone: BUSINESS_TIMEZONE })
  async purge(): Promise<void> {
    if (!this.enabled()) return;

    const frozen = await this.credentialService.frozenBuildingIds();
    const building = frozen.length > 0 ? { buildingId: Not(In(frozen)) } : {};
    const porBorrar = await this.credentials.find({
      where: [
        { status: 'expired', syncState: 'pending', ...building },
        { status: 'revoked', syncState: 'pending', ...building },
      ],
      take: 200,
    });

    for (const credential of porBorrar) {
      await this.credentialService.sync(credential);
    }

    if (porBorrar.length > 0) {
      this.logger.log(`Purga: ${porBorrar.length} credencial(es) procesadas`);
    }
  }

  /**
   * Conciliación nocturna. Existe porque hay dos almacenes de verdad y alguien
   * va a tocar un terminal por fuera del sistema: sin esto, cada fallo de red
   * deja un PIN activo que el backend cree revocado y nadie se entera.
   */
  @Cron('30 3 * * *', { timeZone: BUSINESS_TIMEZONE })
  async reconcile(): Promise<void> {
    if (!this.enabled()) return;

    const devices = await this.iot.listDevices();

    for (const device of devices) {
      try {
        await this.reconcileDevice(device.deviceId, device);
      } catch (error) {
        this.logger.warn(
          `No se pudo conciliar ${device.deviceId}: ${this.describe(error)}`,
        );
      }
    }
  }

  async reconcileDevice(
    deviceId: string,
    device?: AccessIotDevice,
  ): Promise<void> {
    const inventario = await this.readInventory(deviceId);
    const gestionados = inventario.filter((user) => user.managed);
    const ajenos = inventario.length - gestionados.length;

    if (ajenos > 0) {
      // Nunca se borra lo que este sistema no creó: un barrido «limpiador»
      // dejaría fuera de su casa a residentes cargados a mano.
      this.logger.log(
        `${deviceId}: ${ajenos} usuario(s) ajenos al sistema, se reportan y no se tocan`,
      );
    }

    const enAparato = new Map(
      gestionados.map((user) => [user.employeeNo, user]),
    );

    const vivas = await this.credentials.find({
      where: { status: In(LIVE_STATUSES), syncState: 'synced' },
      take: 500,
    });

    for (const credential of vivas) {
      const employeeNo = (credential.syncDetail ?? []).find(
        (entry) => entry.deviceId === deviceId && entry.state === 'written',
      )?.employeeNo;

      if (!employeeNo) {
        continue;
      }

      const user = enAparato.get(employeeNo);
      // Ausente: la escritura se perdió o alguien la borró a mano. Vigencia
      // distinta o sin offset (`null`): el PUT, idempotente, la corrige.
      const motivo = !user
        ? 'ausente de'
        : !sameSecond(user.validFrom, credential.validFrom) ||
            !sameSecond(user.validTo, credential.validTo)
          ? 'con otra vigencia en'
          : null;

      if (motivo) {
        this.logger.warn(
          `Credencial ${credential.id} ${motivo} ${deviceId}: se reprograma su escritura`,
        );
        await this.credentials.update(credential.id, {
          syncState: 'pending',
          syncAttempts: 0,
          rewritePending: true,
        });
      }
    }

    if (device && (await this.credentialService.isScoped(device.buildingId))) {
      await this.flagStrayScopes(device, enAparato);
    }
  }

  /**
   * Un PIN presente en un aparato cuyo scope ya no le corresponde: una reducción
   * o revocación que nunca llegó. Se anota como confirmado para que `sync()`
   * emita el DELETE exacto de ese scope.
   */
  private async flagStrayScopes(
    device: AccessIotDevice,
    enAparato: Map<string, InventoryUser>,
  ): Promise<void> {
    if (enAparato.size === 0) return;

    const candidatas = await this.credentials.find({
      where: [
        { buildingId: device.buildingId, status: In(LIVE_STATUSES) },
        {
          buildingId: device.buildingId,
          status: In(['revoked', 'expired']),
          validTo: MoreThan(new Date(Date.now() - CLOSED_LOOKBACK_MS)),
        },
      ],
      take: 2000,
    });

    for (const credential of candidatas) {
      const employeeNo =
        credential.employeeNo ??
        deriveEmployeeNo(credential.id, credential.subjectType);

      if (!enAparato.has(employeeNo)) continue;

      const deseados = LIVE_STATUSES.includes(credential.status)
        ? scopesOf(credential.scope)
        : [];
      const confirmados = normalizeScopes(credential.confirmedScopes);

      if (
        deseados.includes(device.scope) ||
        (confirmados.includes(device.scope) &&
          credential.syncState !== 'synced')
      ) {
        continue;
      }

      this.logger.warn(
        `Credencial ${credential.id} sigue en ${device.deviceId} (${device.scope}) sin corresponderle: se programa su retirada`,
      );
      await this.credentials.update(credential.id, {
        confirmedScopes: unionScopes(confirmados, [device.scope]),
        syncState: 'pending',
        syncAttempts: 0,
      });
    }
  }

  private async readInventory(deviceId: string): Promise<InventoryUser[]> {
    const users: InventoryUser[] = [];
    let cursor: string | undefined;

    // Paginar siempre: un tope fijo trunca en silencio en terminales llenos.
    for (let page = 0; page < MAX_INVENTORY_PAGES; page += 1) {
      const pagina = await this.iot.getDeviceInventory(deviceId, cursor);
      users.push(...pagina.users);

      if (!pagina.nextCursor) {
        return users;
      }

      cursor = pagina.nextCursor;
    }

    this.logger.warn(
      `${deviceId}: inventario truncado tras ${MAX_INVENTORY_PAGES} páginas`,
    );

    return users;
  }

  private enabled(): boolean {
    return (
      this.configService.get<string>('ACCESS_SCHEDULER_ENABLED') === 'true'
    );
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
