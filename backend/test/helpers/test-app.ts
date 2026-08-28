import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { validationPipeOptions } from '../../src/config/validation.config';

import { OpenmaintClient } from '../../src/integrations/openmaint/openmaint.client';
import { OpenmaintService } from '../../src/integrations/openmaint/openmaint.service';
import { OpenmaintAuthService } from '../../src/integrations/openmaint/openmaint.auth.service';
import { OpenmaintRolesService } from '../../src/integrations/openmaint/openmaint.roles.service';
import { OpenmaintServiceSession } from '../../src/integrations/openmaint/openmaint.service-session';
import { OpenmaintUsersService } from '../../src/integrations/openmaint/openmaint.users.service';

import { CleaningTasksOpenmaintService } from '../../src/modules/cleaning-tasks/cleaning-tasks.openmaint.service';
import { PreventiveMaintenanceOpenmaintService } from '../../src/modules/preventive-maintenance/preventive-maintenance.openmaint.service';
import { CorrectiveMaintOpenmaintService } from '../../src/modules/maintenance-supervision/corrective-maint.openmaint.service';
import { IotAlarmOpenmaintService } from '../../src/modules/iot-alarms/iot-alarm.openmaint.service';
import { PasswordRecoveryOpenmaintService } from '../../src/modules/password-recovery/password-recovery.openmaint.service';
import { PaymentsOpenmaintRepository } from '../../src/modules/payments/payments-openmaint.repository';

import { MailerService } from '../../src/modules/notifications/mail/mailer.service';
import { ContificoService } from '../../src/integrations/contifico/contifico.service';
import { HostawayService } from '../../src/integrations/hostaway/hostaway.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { PushDispatchService } from '../../src/modules/push-notifications/push-dispatch.service';

import { openmaintClientTrap } from '../mocks/openmaint-client.trap';
import {
  createOpenmaintServiceMock,
  createOpenmaintAuthServiceMock,
  createOpenmaintRolesServiceMock,
  createOpenmaintServiceSessionMock,
  createOpenmaintUsersServiceMock,
} from '../mocks/openmaint-core.mock';
import {
  createCleaningTasksOpenmaintServiceMock,
  createPreventiveMaintenanceOpenmaintServiceMock,
  createCorrectiveMaintOpenmaintServiceMock,
  createIotAlarmOpenmaintServiceMock,
  createPasswordRecoveryOpenmaintServiceMock,
  createPaymentsOpenmaintRepositoryMock,
} from '../mocks/gateways.mock';
import {
  createMailerServiceMock,
  createContificoServiceMock,
  createHostawayServiceMock,
  createNotificationsServiceMock,
  createPushDispatchServiceMock,
} from '../mocks/external.mock';

/**
 * Todos los mocks que createTestApp() enchufa por defecto. Cada suite recibe
 * esto de vuelta y configura SOLO lo que le importa para su escenario; todo
 * lo demás se queda en el comportamiento de línea base de cada factory.
 *
 * `notifications` se deja fuera a propósito de la lista "siempre mockeada":
 * la suite propia de NotificationsModule prueba el servicio real (mockeando
 * MailerService por debajo), así que ahí NO se pasa `notifications` en
 * overrides y el mock de este objeto queda sin usar.
 */
export interface TestAppMocks {
  /**
   * El trap de OpenmaintClient — normalmente lanza si se llama, pero algunos
   * módulos (owners) inyectan OpenmaintClient DIRECTO además de OpenmaintService,
   * así que la suite que lo necesite puede configurar `.mockResolvedValueOnce`
   * aquí para esa llamada puntual.
   */
  openmaintClient: typeof openmaintClientTrap;
  openmaint: ReturnType<typeof createOpenmaintServiceMock>;
  openmaintAuth: ReturnType<typeof createOpenmaintAuthServiceMock>;
  openmaintRoles: ReturnType<typeof createOpenmaintRolesServiceMock>;
  openmaintServiceSession: ReturnType<typeof createOpenmaintServiceSessionMock>;
  openmaintUsers: ReturnType<typeof createOpenmaintUsersServiceMock>;
  cleaningTasksOpenmaint: ReturnType<
    typeof createCleaningTasksOpenmaintServiceMock
  >;
  preventiveOpenmaint: ReturnType<
    typeof createPreventiveMaintenanceOpenmaintServiceMock
  >;
  correctiveOpenmaint: ReturnType<
    typeof createCorrectiveMaintOpenmaintServiceMock
  >;
  iotOpenmaint: ReturnType<typeof createIotAlarmOpenmaintServiceMock>;
  passwordRecoveryOpenmaint: ReturnType<
    typeof createPasswordRecoveryOpenmaintServiceMock
  >;
  paymentsOpenmaint: ReturnType<typeof createPaymentsOpenmaintRepositoryMock>;
  mailer: ReturnType<typeof createMailerServiceMock>;
  contifico: ReturnType<typeof createContificoServiceMock>;
  hostaway: ReturnType<typeof createHostawayServiceMock>;
  notifications: ReturnType<typeof createNotificationsServiceMock>;
  pushDispatch: ReturnType<typeof createPushDispatchServiceMock>;
}

export const createFreshMocks = (): TestAppMocks => ({
  openmaintClient: openmaintClientTrap,
  openmaint: createOpenmaintServiceMock(),
  openmaintAuth: createOpenmaintAuthServiceMock(),
  openmaintRoles: createOpenmaintRolesServiceMock(),
  openmaintServiceSession: createOpenmaintServiceSessionMock(),
  openmaintUsers: createOpenmaintUsersServiceMock(),
  cleaningTasksOpenmaint: createCleaningTasksOpenmaintServiceMock(),
  preventiveOpenmaint: createPreventiveMaintenanceOpenmaintServiceMock(),
  correctiveOpenmaint: createCorrectiveMaintOpenmaintServiceMock(),
  iotOpenmaint: createIotAlarmOpenmaintServiceMock(),
  passwordRecoveryOpenmaint: createPasswordRecoveryOpenmaintServiceMock(),
  paymentsOpenmaint: createPaymentsOpenmaintRepositoryMock(),
  mailer: createMailerServiceMock(),
  contifico: createContificoServiceMock(),
  hostaway: createHostawayServiceMock(),
  notifications: createNotificationsServiceMock(),
  pushDispatch: createPushDispatchServiceMock(),
});

export interface CreateTestAppOptions {
  /**
   * No sobreescribir NotificationsService — úsalo SOLO en la suite de
   * `notifications`, que prueba ese servicio real (mockeando MailerService
   * por debajo). En cualquier otra suite, dejarlo en `false` (por defecto).
   */
  realNotificationsService?: boolean;
}

/**
 * Levanta AppModule completo con los 16 providers de red sustituidos por
 * mocks (más el trap de OpenmaintClient, que no debería dispararse nunca si
 * los 16 están bien enchufados). Requiere DATABASE_URL apuntando a un
 * Postgres real con las migraciones aplicadas — ver test/setup-env.ts y
 * `docker compose up -d` en backend/.
 */
export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<{ app: INestApplication; mocks: TestAppMocks }> {
  const mocks = createFreshMocks();

  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OpenmaintClient)
    .useValue(openmaintClientTrap)
    .overrideProvider(OpenmaintService)
    .useValue(mocks.openmaint)
    .overrideProvider(OpenmaintAuthService)
    .useValue(mocks.openmaintAuth)
    .overrideProvider(OpenmaintRolesService)
    .useValue(mocks.openmaintRoles)
    .overrideProvider(OpenmaintServiceSession)
    .useValue(mocks.openmaintServiceSession)
    .overrideProvider(OpenmaintUsersService)
    .useValue(mocks.openmaintUsers)
    .overrideProvider(CleaningTasksOpenmaintService)
    .useValue(mocks.cleaningTasksOpenmaint)
    .overrideProvider(PreventiveMaintenanceOpenmaintService)
    .useValue(mocks.preventiveOpenmaint)
    .overrideProvider(CorrectiveMaintOpenmaintService)
    .useValue(mocks.correctiveOpenmaint)
    .overrideProvider(IotAlarmOpenmaintService)
    .useValue(mocks.iotOpenmaint)
    .overrideProvider(PasswordRecoveryOpenmaintService)
    .useValue(mocks.passwordRecoveryOpenmaint)
    .overrideProvider(PaymentsOpenmaintRepository)
    .useValue(mocks.paymentsOpenmaint)
    .overrideProvider(MailerService)
    .useValue(mocks.mailer)
    .overrideProvider(ContificoService)
    .useValue(mocks.contifico)
    .overrideProvider(HostawayService)
    .useValue(mocks.hostaway)
    .overrideProvider(PushDispatchService)
    .useValue(mocks.pushDispatch);

  if (!options.realNotificationsService) {
    builder
      .overrideProvider(NotificationsService)
      .useValue(mocks.notifications);
  }

  const moduleFixture: TestingModule = await builder.compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  return { app, mocks };
}

/**
 * Limpia el historial de llamadas (mock.calls / mock.results) entre tests,
 * sin tocar los `mockResolvedValue` de línea base que puso cada factory —
 * esos sobreviven toda la suite, igual que en el E2E original.
 *
 * OJO al escribir un test con `mockResolvedValueOnce`: la cola NO se vacía
 * aquí (verificado: clearAllMocks limpia historial, no colas). Encolar
 * exactamente tantos valores como llamadas hace el código bajo prueba en ESE
 * test es responsabilidad de quien escribe el test — en una suite E2E
 * dirigida por supertest esto es seguro, porque toda la cadena de llamadas
 * al gateway ya se ejecutó y consumió la cola antes de que corra ningún
 * `.expect()`, así que una aserción fallida nunca deja sobrantes a mitad de
 * request.
 */
export const resetMockCalls = () => jest.clearAllMocks();
