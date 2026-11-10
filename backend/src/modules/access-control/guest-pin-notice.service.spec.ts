import { HttpService } from '@nestjs/axios';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { FindOperator, Repository } from 'typeorm';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { CredentialService } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';
import { GuestPinNotice } from './entities/guest-pin-notice.entity';
import { GuestStay } from './entities/guest-stay.entity';
import {
  buildPinRenewedMessage,
  DOOR_CODE_CHANNEL,
  DOOR_CODE_INSTRUCTION,
  GuestPinNoticeService,
  RENEWAL_MESSAGE_CHANNEL,
} from './guest-pin-notice.service';

const PIN = '4821';
const STAY_ID = 'c47ca6f1-f675-4653-a3a6-31487feb054b';

const stayWith = (overrides: Partial<GuestStay> = {}): GuestStay =>
  ({
    id: STAY_ID,
    hostawayReservationId: '90000002',
    guestName: 'Bruno Salas',
    channelName: 'airbnbOfficial',
    status: 'pending',
    ...overrides,
  }) as GuestStay;

const credentialWith = (
  overrides: Partial<AccessCredential> = {},
): AccessCredential =>
  ({
    id: 'cred-1',
    subjectType: 'guest',
    subjectRef: '90000002',
    scope: 'pedestrian',
    status: 'active',
    syncState: 'synced',
    pinFingerprint: 'huella-1',
    ...overrides,
  }) as AccessCredential;

let seq = 0;
const noticeWith = (overrides: Partial<GuestPinNotice> = {}): GuestPinNotice =>
  ({
    id: `n-${++seq}`,
    credentialId: 'cred-1',
    pinFingerprint: 'huella-1',
    channel: DOOR_CODE_CHANNEL,
    target: 'reservation:90000002',
    status: 'failed',
    error: 'Hostaway caído',
    createdAt: new Date(Date.now() - 60_000),
    ...overrides,
  }) as GuestPinNotice;

/** Repositorio en memoria: basta para `findOne`/`find` con igualdad e `In`. */
const memoryNotices = (initial: GuestPinNotice[]) => {
  const rows = [...initial];
  const matches = (row: GuestPinNotice, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, expected]) => {
      const actual = (row as unknown as Record<string, unknown>)[key];
      return expected instanceof FindOperator
        ? (expected.value as unknown[]).includes(actual)
        : actual === expected;
    });
  const query = (where: Record<string, unknown>) =>
    rows
      .filter((row) => matches(row, where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    rows,
    findOne: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(query(where)[0] ?? null),
    ),
    find: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(query(where)),
    ),
    create: jest.fn((row: Partial<GuestPinNotice>) => row),
    save: jest.fn((row: GuestPinNotice) => {
      rows.push({ ...row, id: `n-${++seq}`, createdAt: new Date() });
      return Promise.resolve(row);
    }),
  };
};

const harness = (
  options: {
    stay?: GuestStay | null;
    credentials?: AccessCredential[];
    env?: Record<string, string>;
    notices?: GuestPinNotice[];
    pendingStayIds?: string[];
    staleRows?: {
      credentialId: string;
      pinFingerprint: string;
      stayId: string;
      reservationId: string;
    }[];
  } = {},
) => {
  const env: Record<string, string> = {
    GUEST_PIN_NOTICE_ENABLED: 'true',
    ACCESS_SCHEDULER_ENABLED: 'true',
    ...options.env,
  };

  const notices = memoryNotices(options.notices ?? []);
  const stays = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.stay === undefined ? stayWith() : options.stay,
      ),
  };
  // Las dos consultas se distinguen por la primera columna que seleccionan.
  let firstAlias = '';
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn(function (this: unknown, _: string, alias: string) {
      firstAlias = alias;
      return this;
    }),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(() =>
      Promise.resolve(
        firstAlias === 'credentialId'
          ? (options.staleRows ?? [])
          : (options.pendingStayIds ?? []).map((stayId) => ({ stayId })),
      ),
    ),
  };
  const credentials = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const credentialService = {
    findLiveForGuest: jest
      .fn()
      .mockResolvedValue(options.credentials ?? [credentialWith()]),
    revealPin: jest.fn().mockReturnValue(PIN),
  };
  const hostaway = {
    setReservationDoorCode: jest.fn().mockResolvedValue(undefined),
    findConversationByReservation: jest
      .fn()
      .mockResolvedValue({ id: 777, reservationId: 90000002, channelId: 1 }),
    sendConversationMessage: jest.fn().mockResolvedValue({ messageId: 1 }),
  };

  const http = { post: jest.fn().mockReturnValue(of({ status: 200 })) };

  const service = new GuestPinNoticeService(
    notices as unknown as Repository<GuestPinNotice>,
    stays as unknown as Repository<GuestStay>,
    credentials as unknown as Repository<AccessCredential>,
    credentialService as unknown as CredentialService,
    hostaway as unknown as HostawayService,
    http as unknown as HttpService,
    { get: (key: string) => env[key] } as unknown as ConfigService,
  );

  return { service, notices, stays, credentialService, hostaway, http };
};

const requested = (overrides: Partial<GuestPinNotice> = {}) =>
  noticeWith({
    channel: RENEWAL_MESSAGE_CHANNEL,
    status: 'requested',
    target: '',
    error: null,
    ...overrides,
  });

describe('GuestPinNoticeService', () => {
  describe('texto de renovación', () => {
    it('lleva el PIN nuevo, en español e inglés, y ninguna URL', () => {
      const texto = buildPinRenewedMessage('Bruno Salas', PIN);

      expect(texto).toContain(`El nuevo código es ${PIN}`);
      expect(texto).toContain(`Your new code is ${PIN}`);
      expect(texto).not.toMatch(/https?:\/\//);
    });

    it('usa «Huésped» si la reserva no trae nombre', () => {
      expect(buildPinRenewedMessage('  ', PIN)).toMatch(/^Hola Huésped:/);
    });
  });

  describe('doorCode', () => {
    it('escribe el PIN en la reserva y lo registra, sin mandar mensaje', async () => {
      const { service, hostaway, notices } = harness();

      expect(await service.notify(STAY_ID)).toEqual({
        outcome: 'sent',
        channel: DOOR_CODE_CHANNEL,
        target: 'reservation:90000002',
      });
      expect(hostaway.setReservationDoorCode).toHaveBeenCalledWith(
        '90000002',
        PIN,
        DOOR_CODE_INSTRUCTION,
      );
      expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
      expect(notices.rows).toEqual([
        expect.objectContaining({
          credentialId: 'cred-1',
          guestStayId: STAY_ID,
          pinFingerprint: 'huella-1',
          channel: DOOR_CODE_CHANNEL,
          status: 'sent',
        }),
      ]);
    });

    it('nunca guarda ni registra el PIN', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service, notices, hostaway } = harness({
        notices: [requested()],
      });
      hostaway.setReservationDoorCode.mockRejectedValueOnce(
        new ServiceUnavailableException('Hostaway rechazó el doorCode'),
      );

      await service.notify(STAY_ID);
      await service.notify(STAY_ID);

      expect(
        JSON.stringify([notices.rows, log.mock.calls, warn.mock.calls]),
      ).not.toContain(PIN);

      log.mockRestore();
      warn.mockRestore();
    });

    it('apagado no hace nada', async () => {
      const { service, hostaway } = harness({
        env: { GUEST_PIN_NOTICE_ENABLED: 'false' },
      });

      expect(await service.notify(STAY_ID)).toEqual({
        outcome: 'skipped',
        reason: 'disabled',
      });
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
    });

    it('no escribe hasta que la credencial está en la puerta', async () => {
      // Un `pin_conflict` todavía podría cambiar el PIN.
      const { service, hostaway, notices } = harness({
        credentials: [credentialWith({ syncState: 'pending' })],
      });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'not_synced',
      });
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
      expect(notices.rows).toEqual([]);
    });

    it.each([['direct'], [null], ['']])(
      'también escribe el doorCode en una reserva directa (%p)',
      async (channelName) => {
        const { service, hostaway } = harness({
          stay: stayWith({ channelName }),
        });

        expect(await service.notify(STAY_ID)).toMatchObject({
          outcome: 'sent',
        });
        expect(hostaway.setReservationDoorCode).toHaveBeenCalledWith(
          '90000002',
          PIN,
          expect.any(String),
        );
        expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
      },
    );

    it('no escribe en una estancia terminada o cancelada', async () => {
      const { service, hostaway } = harness({
        stay: stayWith({ status: 'completed' }),
      });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'stay_not_live',
      });
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
    });

    it('no escribe si la estancia no tiene credencial viva', async () => {
      const { service } = harness({ credentials: [] });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'no_credential',
      });
    });

    it('no repite la escritura para el mismo PIN', async () => {
      const { service, hostaway } = harness({
        notices: [noticeWith({ status: 'sent', error: null })],
      });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'already_sent',
      });
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
    });

    it('el mensaje del flujo anterior no cuenta: también se escribe el doorCode', async () => {
      const { service, hostaway } = harness({
        notices: [
          noticeWith({ channel: RENEWAL_MESSAGE_CHANNEL, status: 'sent' }),
          noticeWith({ channel: 'none', status: 'skipped' }),
        ],
      });

      expect((await service.notify(STAY_ID)).outcome).toBe('sent');
      expect(hostaway.setReservationDoorCode).toHaveBeenCalledTimes(1);
    });

    it('vuelve a escribir cuando el PIN cambia', async () => {
      const { service, notices } = harness({
        credentials: [credentialWith({ pinFingerprint: 'huella-2' })],
        notices: [noticeWith({ status: 'sent', error: null })],
      });

      expect((await service.notify(STAY_ID)).outcome).toBe('sent');
      expect(notices.rows.at(-1)).toMatchObject({
        pinFingerprint: 'huella-2',
        status: 'sent',
      });
    });

    it('vuelve a escribir si se borró y el acceso se restauró con el mismo PIN', async () => {
      const { service, hostaway } = harness({
        notices: [
          noticeWith({
            status: 'sent',
            createdAt: new Date(Date.now() - 120_000),
          }),
          noticeWith({ status: 'cleared' }),
        ],
      });

      expect((await service.notify(STAY_ID)).outcome).toBe('sent');
      expect(hostaway.setReservationDoorCode).toHaveBeenCalledTimes(1);
    });

    it('espera el enfriamiento tras un fallo reciente', async () => {
      const { service, hostaway } = harness({ notices: [noticeWith()] });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'retry_cooldown',
      });
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
    });

    it('reintenta cuando el fallo ya es antiguo', async () => {
      const { service } = harness({
        notices: [
          noticeWith({ createdAt: new Date(Date.now() - 31 * 60_000) }),
        ],
      });

      expect((await service.notify(STAY_ID)).outcome).toBe('sent');
    });

    it('`force` (Reenviar del CAV) reescribe aunque ya estuviera escrito', async () => {
      const { service, hostaway } = harness({
        notices: [noticeWith({ status: 'sent' }), noticeWith()],
      });

      expect((await service.notify(STAY_ID, { force: true })).outcome).toBe(
        'sent',
      );
      expect(hostaway.setReservationDoorCode).toHaveBeenCalledTimes(1);
      expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
    });

    it('un error de Hostaway no lanza y guarda el código HTTP', async () => {
      const { service, hostaway, notices } = harness();
      hostaway.setReservationDoorCode.mockRejectedValueOnce(
        new ServiceUnavailableException('Hostaway rechazó el doorCode'),
      );

      expect((await service.notify(STAY_ID)).outcome).toBe('failed');
      expect(notices.rows.at(-1)).toMatchObject({
        status: 'failed',
        httpStatus: 503,
      });
    });

    it('elige la credencial de mayor alcance si hay varias', async () => {
      const { service, credentialService } = harness({
        credentials: [
          credentialWith({ id: 'peatonal', scope: 'pedestrian' }),
          credentialWith({ id: 'ambas', scope: 'both' }),
        ],
      });

      await service.notify(STAY_ID);

      expect(credentialService.revealPin).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ambas' }),
      );
    });
  });

  describe('mensaje de renovación', () => {
    it('requestRenewalMessage deja la petición registrada', async () => {
      const { service, notices } = harness();

      await service.requestRenewalMessage(stayWith(), credentialWith());

      expect(notices.rows).toEqual([
        expect.objectContaining({
          channel: RENEWAL_MESSAGE_CHANNEL,
          status: 'requested',
        }),
      ]);
    });

    it('no pide mensaje para reservas directas', async () => {
      const { service, notices } = harness();

      await service.requestRenewalMessage(
        stayWith({ channelName: 'direct' }),
        credentialWith(),
      );

      expect(notices.rows).toEqual([]);
    });

    it('con renovación pendiente escribe el doorCode y manda el PIN nuevo por el chat', async () => {
      const { service, hostaway, notices } = harness({
        notices: [requested()],
      });

      const resultado = await service.notify(STAY_ID);

      expect(resultado).toMatchObject({
        outcome: 'sent',
        channel: DOOR_CODE_CHANNEL,
        renewal: {
          outcome: 'sent',
          channel: RENEWAL_MESSAGE_CHANNEL,
          target: 'conversation:777',
        },
      });
      const [conversationId, texto, tipo] = hostaway.sendConversationMessage
        .mock.calls[0] as [number, string, string];
      expect(conversationId).toBe(777);
      expect(texto).toBe(buildPinRenewedMessage('Bruno Salas', PIN));
      expect(tipo).toBe('channel');
      expect(notices.rows.at(-1)).toMatchObject({
        channel: RENEWAL_MESSAGE_CHANNEL,
        status: 'sent',
      });
    });

    it('lo manda una sola vez', async () => {
      const { service, hostaway } = harness({ notices: [requested()] });

      await service.notify(STAY_ID);
      const segundo = await service.notify(STAY_ID);

      expect(segundo.renewal).toBeUndefined();
      expect(hostaway.sendConversationMessage).toHaveBeenCalledTimes(1);
    });

    it('sobrevive a una rotación antes de llegar a la puerta: va por credencial', async () => {
      const { service, hostaway } = harness({
        credentials: [credentialWith({ pinFingerprint: 'huella-rotada' })],
        notices: [requested({ pinFingerprint: 'huella-1' })],
      });

      await service.notify(STAY_ID);

      expect(hostaway.sendConversationMessage).toHaveBeenCalledTimes(1);
    });

    it('espera a que el PIN nuevo esté en la puerta', async () => {
      const { service, hostaway } = harness({
        credentials: [credentialWith({ syncState: 'pending' })],
        notices: [requested()],
      });

      await service.notify(STAY_ID);

      expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
    });

    it('sin conversación queda como fallo y se reintenta después', async () => {
      const { service, hostaway, notices } = harness({
        notices: [requested()],
        env: { GUEST_PIN_NOTICE_RETRY_COOLDOWN_MINUTES: '0' },
      });
      hostaway.findConversationByReservation.mockResolvedValueOnce(null);

      expect((await service.notify(STAY_ID)).renewal).toMatchObject({
        outcome: 'failed',
        reason: 'conversation_not_found',
      });
      expect(notices.rows.at(-1)).toMatchObject({
        channel: RENEWAL_MESSAGE_CHANNEL,
        status: 'failed',
      });

      expect((await service.notify(STAY_ID)).renewal?.outcome).toBe('sent');
    });

    it('un fallo del doorCode no impide el mensaje', async () => {
      const { service, hostaway } = harness({ notices: [requested()] });
      hostaway.setReservationDoorCode.mockRejectedValueOnce(
        new ServiceUnavailableException('caído'),
      );

      const resultado = await service.notify(STAY_ID);

      expect(resultado.outcome).toBe('failed');
      expect(resultado.renewal?.outcome).toBe('sent');
    });
  });

  describe('canal webhook de pruebas', () => {
    const URL = 'https://webhook.site/prueba';
    const webhookEnv = {
      GUEST_PIN_NOTICE_CHANNEL: 'webhook',
      GUEST_PIN_NOTICE_WEBHOOK_URL: URL,
    };

    it('manda el doorCode y el mensaje al webhook sin tocar Hostaway', async () => {
      const { service, http, hostaway, notices } = harness({
        env: webhookEnv,
        notices: [requested()],
      });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'sent',
        channel: DOOR_CODE_CHANNEL,
        target: URL,
        renewal: { outcome: 'sent', target: URL },
      });
      const cuerpos = http.post.mock.calls.map(
        ([, body]) => body as Record<string, unknown>,
      );
      expect(cuerpos[0]).toMatchObject({
        event: 'guest-pin.door-code',
        reservationId: '90000002',
        doorCode: PIN,
      });
      expect(cuerpos[1]).toMatchObject({ event: 'guest-pin.renewal-message' });
      expect(String(cuerpos[1].message)).toContain(PIN);
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
      expect(hostaway.findConversationByReservation).not.toHaveBeenCalled();
      expect(notices.rows.at(-1)).toMatchObject({ target: URL });
    });

    it('en reservas directas también manda el doorCode', async () => {
      const { service, http } = harness({
        env: webhookEnv,
        stay: stayWith({ channelName: 'direct' }),
      });

      expect((await service.notify(STAY_ID)).outcome).toBe('sent');
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    it('sin URL queda como fallo', async () => {
      const { service, http } = harness({
        env: { GUEST_PIN_NOTICE_CHANNEL: 'webhook' },
      });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'failed',
        reason: 'GUEST_PIN_NOTICE_WEBHOOK_URL no está configurada',
      });
      expect(http.post).not.toHaveBeenCalled();
    });

    it('un receptor caído guarda el código HTTP', async () => {
      const { service, http, notices } = harness({ env: webhookEnv });
      http.post.mockReturnValueOnce(
        throwError(() =>
          Object.assign(new Error('Request failed with status code 502'), {
            response: { status: 502 },
          }),
        ),
      );

      expect((await service.notify(STAY_ID)).outcome).toBe('failed');
      expect(notices.rows.at(-1)).toMatchObject({
        status: 'failed',
        httpStatus: 502,
      });
    });

    it('cualquier otro valor usa Hostaway', async () => {
      const { service, http, hostaway } = harness({
        env: { GUEST_PIN_NOTICE_CHANNEL: 'whatsapp' },
      });

      await service.notify(STAY_ID);

      expect(http.post).not.toHaveBeenCalled();
      expect(hostaway.setReservationDoorCode).toHaveBeenCalledTimes(1);
    });
  });

  describe('barrido', () => {
    const stale = {
      credentialId: 'cred-1',
      pinFingerprint: 'huella-1',
      stayId: STAY_ID,
      reservationId: '90000002',
    };

    it('procesa cada estancia pendiente', async () => {
      const { service, stays } = harness({
        pendingStayIds: [STAY_ID, 'otra-estancia'],
      });

      await service.sweep();

      expect(stays.findOne).toHaveBeenCalledTimes(2);
    });

    it('borra el doorCode de las estancias que ya no tienen acceso, una vez por reserva', async () => {
      const { service, hostaway, notices } = harness({
        staleRows: [stale, { ...stale, credentialId: 'cred-vieja' }],
      });

      await service.sweep();

      expect(hostaway.setReservationDoorCode).toHaveBeenCalledTimes(1);
      expect(hostaway.setReservationDoorCode).toHaveBeenCalledWith(
        '90000002',
        null,
      );
      expect(notices.rows).toEqual([
        expect.objectContaining({
          credentialId: 'cred-1',
          pinFingerprint: 'huella-1',
          status: 'cleared',
        }),
        expect.objectContaining({
          credentialId: 'cred-vieja',
          status: 'cleared',
        }),
      ]);
    });

    it('si el borrado falla no lo marca, para reintentarlo', async () => {
      const { service, hostaway, notices } = harness({ staleRows: [stale] });
      hostaway.setReservationDoorCode.mockRejectedValueOnce(new Error('caído'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await service.sweep();

      expect(notices.rows).toEqual([]);
      warn.mockRestore();
    });

    it('en modo webhook avisa el borrado al webhook', async () => {
      const { service, http, hostaway } = harness({
        staleRows: [stale],
        env: {
          GUEST_PIN_NOTICE_CHANNEL: 'webhook',
          GUEST_PIN_NOTICE_WEBHOOK_URL: 'https://webhook.site/prueba',
        },
      });

      await service.sweep();

      expect((http.post.mock.calls[0] as [string, object])[1]).toMatchObject({
        event: 'guest-pin.door-code-cleared',
        reservationId: '90000002',
      });
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
    });

    it('no corre con el scheduler apagado', async () => {
      const { service, stays, hostaway } = harness({
        env: { ACCESS_SCHEDULER_ENABLED: 'false' },
        pendingStayIds: [STAY_ID],
        staleRows: [stale],
      });

      await service.sweep();

      expect(stays.findOne).not.toHaveBeenCalled();
      expect(hostaway.setReservationDoorCode).not.toHaveBeenCalled();
    });

    it('no corre con la publicación apagada', async () => {
      const { service, stays } = harness({
        env: { GUEST_PIN_NOTICE_ENABLED: 'false' },
        pendingStayIds: [STAY_ID],
      });

      await service.sweep();

      expect(stays.findOne).not.toHaveBeenCalled();
    });
  });

  describe('estado para el CAV', () => {
    const par = { stay: stayWith(), credential: credentialWith() };

    it('sin intentos está pendiente', async () => {
      const { service } = harness();

      expect((await service.statusFor([par])).get(STAY_ID)).toEqual({
        status: 'pending',
        at: null,
        error: null,
        renewalMessage: true,
      });
    });

    it('una escritura correcta con el PIN vigente cuenta como hecha', async () => {
      const at = new Date('2026-09-12T10:00:00Z');
      const { service } = harness({
        notices: [noticeWith({ status: 'sent', error: null, createdAt: at })],
      });

      expect((await service.statusFor([par])).get(STAY_ID)).toEqual({
        status: 'sent',
        at: at.toISOString(),
        error: null,
        renewalMessage: true,
      });
    });

    it('una escritura con un PIN anterior no cuenta', async () => {
      const { service } = harness({
        notices: [
          noticeWith({ status: 'sent', pinFingerprint: 'huella-vieja' }),
        ],
      });

      expect((await service.statusFor([par])).get(STAY_ID)?.status).toBe(
        'pending',
      );
    });

    it('el mensaje del flujo anterior no cuenta como escrito', async () => {
      const { service } = harness({
        notices: [
          noticeWith({ channel: RENEWAL_MESSAGE_CHANNEL, status: 'sent' }),
        ],
      });

      expect((await service.statusFor([par])).get(STAY_ID)?.status).toBe(
        'pending',
      );
    });

    it('el último fallo se muestra con su motivo', async () => {
      const { service } = harness({ notices: [noticeWith()] });

      expect((await service.statusFor([par])).get(STAY_ID)).toMatchObject({
        status: 'failed',
        error: 'Hostaway caído',
      });
    });

    it('una reserva directa tiene doorCode pero no mensaje de renovación', async () => {
      const { service } = harness();

      const estado = await service.statusFor([
        {
          stay: stayWith({ channelName: 'direct' }),
          credential: credentialWith(),
        },
      ]);

      expect(estado.get(STAY_ID)).toMatchObject({
        status: 'pending',
        renewalMessage: false,
      });
    });
  });
});
