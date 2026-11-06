import { HttpService } from '@nestjs/axios';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { Repository } from 'typeorm';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { CredentialService } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';
import { GuestPinNotice } from './entities/guest-pin-notice.entity';
import { GuestStay } from './entities/guest-stay.entity';
import {
  buildGuestPinMessage,
  GuestPinNoticeService,
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

const noticeWith = (overrides: Partial<GuestPinNotice> = {}): GuestPinNotice =>
  ({
    id: 'n-1',
    credentialId: 'cred-1',
    pinFingerprint: 'huella-1',
    status: 'failed',
    error: 'conversation_not_found',
    createdAt: new Date(),
    ...overrides,
  }) as GuestPinNotice;

const harness = (
  options: {
    stay?: GuestStay | null;
    credentials?: AccessCredential[];
    env?: Record<string, string>;
    handled?: boolean;
    lastNotice?: GuestPinNotice | null;
    notices?: GuestPinNotice[];
    pendingStayIds?: string[];
  } = {},
) => {
  const env: Record<string, string> = {
    GUEST_PIN_NOTICE_ENABLED: 'true',
    ACCESS_SCHEDULER_ENABLED: 'true',
    ...options.env,
  };

  const notices = {
    exists: jest.fn().mockResolvedValue(options.handled ?? false),
    findOne: jest.fn().mockResolvedValue(options.lastNotice ?? null),
    find: jest.fn().mockResolvedValue(options.notices ?? []),
    create: jest.fn((row: Partial<GuestPinNotice>) => row),
    save: jest.fn((row: Partial<GuestPinNotice>) => Promise.resolve(row)),
  };
  const stays = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.stay === undefined ? stayWith() : options.stay,
      ),
  };
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValue(
        (options.pendingStayIds ?? []).map((stayId) => ({ stayId })),
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

describe('GuestPinNoticeService', () => {
  describe('texto', () => {
    it('lleva el PIN, en español e inglés, y ninguna URL', () => {
      const texto = buildGuestPinMessage('Bruno Salas', PIN);

      expect(texto).toContain(`tu código de acceso al edificio es ${PIN}`);
      expect(texto).toContain(`your building access code is ${PIN}`);
      expect(texto).not.toMatch(/https?:\/\//);
    });

    it('usa «Huésped» si la reserva no trae nombre', () => {
      expect(buildGuestPinMessage('  ', PIN)).toMatch(/^Hola Huésped:/);
    });
  });

  describe('notify', () => {
    it('envía el PIN por la conversación de la reserva y lo registra', async () => {
      const { service, hostaway, notices } = harness();

      const resultado = await service.notify(STAY_ID);

      expect(resultado).toEqual({
        outcome: 'sent',
        channel: 'hostaway-message',
        target: 'conversation:777',
      });
      expect(hostaway.findConversationByReservation).toHaveBeenCalledWith(
        '90000002',
      );
      const [conversationId, texto, tipo] = hostaway.sendConversationMessage
        .mock.calls[0] as [number, string, string];
      expect(conversationId).toBe(777);
      expect(texto).toContain(PIN);
      expect(tipo).toBe('channel');
      expect(notices.save).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: 'cred-1',
          guestStayId: STAY_ID,
          pinFingerprint: 'huella-1',
          status: 'sent',
          target: 'conversation:777',
        }),
      );
    });

    it('nunca guarda ni registra el PIN', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service, notices, hostaway } = harness();
      hostaway.sendConversationMessage.mockRejectedValueOnce(
        new ServiceUnavailableException('Hostaway rechazó el mensaje'),
      );

      await service.notify(STAY_ID);
      await service.notify(STAY_ID);

      const registrado = JSON.stringify([
        notices.save.mock.calls,
        log.mock.calls,
        warn.mock.calls,
      ]);
      expect(registrado).not.toContain(PIN);

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
      expect(hostaway.findConversationByReservation).not.toHaveBeenCalled();
    });

    it('no envía hasta que la credencial está en la puerta', async () => {
      // Un `pin_conflict` todavía podría cambiar el PIN.
      const { service, hostaway, notices } = harness({
        credentials: [credentialWith({ syncState: 'pending' })],
      });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'not_synced',
      });
      expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
      expect(notices.save).not.toHaveBeenCalled();
    });

    it.each([['direct'], [null], ['']])(
      'no envía nada a una reserva directa (%p)',
      async (channelName) => {
        const { service, hostaway } = harness({
          stay: stayWith({ channelName }),
        });

        expect(await service.notify(STAY_ID)).toMatchObject({
          outcome: 'skipped',
          reason: 'direct_reservation',
        });
        expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
      },
    );

    it('no envía a una estancia terminada o cancelada', async () => {
      const { service, hostaway } = harness({
        stay: stayWith({ status: 'completed' }),
      });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'stay_not_live',
      });
      expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
    });

    it('no envía si la estancia no tiene credencial viva', async () => {
      const { service } = harness({ credentials: [] });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'no_credential',
      });
    });

    it('no repite un aviso ya enviado para el mismo PIN', async () => {
      const { service, hostaway, notices } = harness({ handled: true });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'already_sent',
      });
      expect(notices.exists).toHaveBeenCalledWith({
        where: expect.objectContaining({
          credentialId: 'cred-1',
          pinFingerprint: 'huella-1',
        }) as unknown,
      });
      expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
    });

    it('vuelve a avisar cuando el PIN cambia', async () => {
      // La consulta es por huella: con un PIN nuevo no hay aviso previo.
      const { service, hostaway, notices } = harness({
        credentials: [credentialWith({ pinFingerprint: 'huella-2' })],
      });

      expect((await service.notify(STAY_ID)).outcome).toBe('sent');
      expect(notices.save).toHaveBeenCalledWith(
        expect.objectContaining({ pinFingerprint: 'huella-2' }),
      );
      expect(hostaway.sendConversationMessage).toHaveBeenCalledTimes(1);
    });

    it('espera el enfriamiento tras un fallo reciente', async () => {
      const { service, hostaway } = harness({ lastNotice: noticeWith() });

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'skipped',
        reason: 'retry_cooldown',
      });
      expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
    });

    it('reintenta cuando el fallo ya es antiguo', async () => {
      const { service } = harness({
        lastNotice: noticeWith({
          createdAt: new Date(Date.now() - 31 * 60_000),
        }),
      });

      expect((await service.notify(STAY_ID)).outcome).toBe('sent');
    });

    it('`force` ignora el registro y el enfriamiento', async () => {
      const { service, hostaway, notices } = harness({
        handled: true,
        lastNotice: noticeWith(),
      });

      expect((await service.notify(STAY_ID, { force: true })).outcome).toBe(
        'sent',
      );
      expect(notices.exists).not.toHaveBeenCalled();
      expect(hostaway.sendConversationMessage).toHaveBeenCalledTimes(1);
    });

    it('sin conversación todavía queda como fallo para reintentar', async () => {
      const { service, hostaway, notices } = harness();
      hostaway.findConversationByReservation.mockResolvedValueOnce(null);

      expect(await service.notify(STAY_ID)).toMatchObject({
        outcome: 'failed',
        reason: 'conversation_not_found',
      });
      expect(notices.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'conversation_not_found',
        }),
      );
    });

    it('un error de Hostaway no lanza y guarda el código HTTP', async () => {
      const { service, hostaway, notices } = harness();
      hostaway.sendConversationMessage.mockRejectedValueOnce(
        new ServiceUnavailableException('Hostaway rechazó el mensaje'),
      );

      const resultado = await service.notify(STAY_ID);

      expect(resultado.outcome).toBe('failed');
      expect(notices.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', httpStatus: 503 }),
      );
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

  describe('canal webhook de pruebas', () => {
    const URL = 'https://webhook.site/prueba';
    const webhookEnv = {
      GUEST_PIN_NOTICE_CHANNEL: 'webhook',
      GUEST_PIN_NOTICE_WEBHOOK_URL: URL,
    };

    it('manda el mensaje al webhook y no toca Hostaway', async () => {
      const { service, http, hostaway, notices } = harness({ env: webhookEnv });

      expect(await service.notify(STAY_ID)).toEqual({
        outcome: 'sent',
        channel: 'webhook',
        target: URL,
      });
      const [url, body] = http.post.mock.calls[0] as [
        string,
        { event: string; reservationId: string; message: string },
      ];
      expect(url).toBe(URL);
      expect(body.event).toBe('guest-pin.notice');
      expect(body.reservationId).toBe('90000002');
      expect(body.message).toContain(PIN);
      expect(hostaway.findConversationByReservation).not.toHaveBeenCalled();
      expect(notices.save).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'webhook', status: 'sent' }),
      );
    });

    it('sigue sin enviar a reservas directas', async () => {
      const { service, http } = harness({
        env: webhookEnv,
        stay: stayWith({ channelName: 'direct' }),
      });

      expect((await service.notify(STAY_ID)).reason).toBe('direct_reservation');
      expect(http.post).not.toHaveBeenCalled();
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
      expect(notices.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', httpStatus: 502 }),
      );
    });

    it('cualquier otro valor usa Hostaway', async () => {
      const { service, http, hostaway } = harness({
        env: { GUEST_PIN_NOTICE_CHANNEL: 'whatsapp' },
      });

      await service.notify(STAY_ID);

      expect(http.post).not.toHaveBeenCalled();
      expect(hostaway.sendConversationMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('barrido', () => {
    it('avisa a cada estancia pendiente', async () => {
      const { service, stays } = harness({
        pendingStayIds: [STAY_ID, 'otra-estancia'],
      });

      await service.sweep();

      expect(stays.findOne).toHaveBeenCalledTimes(2);
    });

    it('no corre con el scheduler apagado', async () => {
      const { service, stays } = harness({
        env: { ACCESS_SCHEDULER_ENABLED: 'false' },
        pendingStayIds: [STAY_ID],
      });

      await service.sweep();

      expect(stays.findOne).not.toHaveBeenCalled();
    });

    it('no corre con el aviso apagado', async () => {
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

      const estado = await service.statusFor([par]);

      expect(estado.get(STAY_ID)).toEqual({
        status: 'pending',
        at: null,
        error: null,
      });
    });

    it('un envío correcto con el PIN vigente cuenta como enviado', async () => {
      const at = new Date('2026-09-12T10:00:00Z');
      const { service } = harness({
        notices: [noticeWith({ status: 'sent', error: null, createdAt: at })],
      });

      expect((await service.statusFor([par])).get(STAY_ID)).toEqual({
        status: 'sent',
        at: at.toISOString(),
        error: null,
      });
    });

    it('un envío con un PIN anterior no cuenta', async () => {
      const { service } = harness({
        notices: [
          noticeWith({ status: 'sent', pinFingerprint: 'huella-vieja' }),
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
        error: 'conversation_not_found',
      });
    });

    it('las credenciales anteriores al despliegue no aplican', async () => {
      const { service } = harness({
        notices: [noticeWith({ status: 'skipped', error: 'pre_existing' })],
      });

      expect((await service.statusFor([par])).get(STAY_ID)).toEqual({
        status: 'not_applicable',
        at: null,
        error: 'pre_existing',
      });
    });

    it('una reserva directa no aplica', async () => {
      const { service } = harness();

      const estado = await service.statusFor([
        {
          stay: stayWith({ channelName: 'direct' }),
          credential: credentialWith(),
        },
      ]);

      expect(estado.get(STAY_ID)?.status).toBe('not_applicable');
    });
  });
});
