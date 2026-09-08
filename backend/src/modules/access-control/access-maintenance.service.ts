import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { BUSINESS_TIMEZONE } from '../push-notifications/scheduler/scheduler.constants';
import { AccessIotGateway } from './access-iot.gateway';
import { InventoryUser } from './access-iot.types';
import { CredentialService, LIVE_STATUSES } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';

/** Tope defensivo de páginas, para no iterar sin fin ante un cursor anómalo. */
const MAX_INVENTORY_PAGES = 50;

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

    for (const credential of vencidas) {
      credential.status = 'expired';
      credential.syncState = 'pending';
      credential.syncAttempts = 0;
      await this.credentials.save(credential);
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

    const porBorrar = await this.credentials.find({
      where: [
        { status: 'expired', syncState: 'pending' },
        { status: 'revoked', syncState: 'pending' },
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
        await this.reconcileDevice(device.deviceId);
      } catch (error) {
        this.logger.warn(
          `No se pudo conciliar ${device.deviceId}: ${this.describe(error)}`,
        );
      }
    }
  }

  async reconcileDevice(deviceId: string): Promise<void> {
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

    const enAparato = new Set(gestionados.map((user) => user.employeeNo));

    const vivas = await this.credentials.find({
      where: { status: In(LIVE_STATUSES), syncState: 'synced' },
      take: 500,
    });

    for (const credential of vivas) {
      const escritaAqui = (credential.syncDetail ?? []).some(
        (entry) => entry.deviceId === deviceId && entry.state === 'written',
      );

      if (!escritaAqui) {
        continue;
      }

      const employeeNo = (credential.syncDetail ?? []).find(
        (entry) => entry.deviceId === deviceId,
      )?.employeeNo;

      if (employeeNo && !enAparato.has(employeeNo)) {
        // La escritura se perdió, o alguien la borró a mano: se reescribe sola.
        this.logger.warn(
          `Credencial ${credential.id} ausente de ${deviceId}: se reprograma su escritura`,
        );
        credential.syncState = 'pending';
        credential.syncAttempts = 0;
        await this.credentials.save(credential);
      }
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
