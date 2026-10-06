import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import { GuestPortalData } from '../access-control/guest-portal-data.service';
import { IncidentsService } from '../incidents/incidents.service';
import { CM_PRIORITY_IDS } from '../maintenance-supervision/constants/corrective-maint.constants';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { GuestIncidentService } from './guest-incident.service';
import { GuestLocationService } from './guest-location.service';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-15T15:00:00Z');

const guestWith = (overrides: Partial<GuestPortalData> = {}): GuestPortalData =>
  ({
    stayId: 'c47ca6f1-f675-4653-a3a6-31487feb054b',
    reservationId: '90000002',
    guestName: 'Bruno Salas',
    guestEmail: 'bruno@example.com',
    listingId: '288173',
    openmaintUnitId: 4242,
    buildingId: 3019998,
    stayStatus: 'active',
    checkInAt: new Date(NOW.getTime() - 20 * HOUR),
    accessValidTo: new Date(NOW.getTime() + 48 * HOUR),
    ...overrides,
  }) as GuestPortalData;

const harness = (
  env: Record<string, string> = { OPENMAINT_GUEST_REQUESTER_ID: '555' },
  floorId: number | null = 3055144,
) => {
  const createIncident = jest.fn().mockResolvedValue({
    incidentId: 777,
    requester: 555,
    buildingId: 3019998,
    attachmentsUploaded: 1,
    attachmentsFailed: 0,
  });
  const sessionGet = jest.fn().mockResolvedValue('sesion-servicio');

  const service = new GuestIncidentService(
    { createIncident } as unknown as IncidentsService,
    { get: sessionGet } as unknown as OpenmaintServiceSession,
    {
      lookup: jest.fn().mockResolvedValue({
        unitName: 'P12',
        buildingName: 'Pradera',
        buildingAddress: null,
        floorId,
      }),
    } as unknown as GuestLocationService,
    new RateLimiterService(),
    { get: (key: string) => env[key] } as unknown as ConfigService,
  );

  return { service, createIncident, sessionGet };
};

const dto = { description: 'No hay agua caliente', location: 'Baño principal' };

describe('GuestIncidentService', () => {
  it('abre el correctivo con sesión de servicio, solicitante fijo y los datos de la estancia', async () => {
    const { service, createIncident } = harness();

    const result = await service.report(guestWith(), dto, [], NOW);

    expect(result).toEqual({
      incidentId: 777,
      attachmentsUploaded: 1,
      attachmentsFailed: 0,
    });

    expect(createIncident).toHaveBeenCalledWith(
      'sesion-servicio',
      555,
      expect.objectContaining({
        buildingId: 3019998,
        floorId: 3055144,
        unitId: 4242,
        priority: CM_PRIORITY_IDS.MEDIUM,
        floorArea: 'Huésped - P12 - Baño principal',
      }),
      [],
    );
  });

  it('no envía planta si la unidad no tiene una asignada en openMAINT', async () => {
    const { service, createIncident } = harness(undefined, null);

    await service.report(guestWith(), dto, [], NOW);

    const [, , sent] = createIncident.mock.calls[0] as [
      string,
      number,
      Record<string, unknown>,
    ];

    expect(sent).not.toHaveProperty('floorId');
  });

  it('deja en las notas quién reporta y de qué reserva', async () => {
    const { service, createIncident } = harness();

    await service.report(guestWith(), dto, [], NOW);

    const [, , { notes }] = createIncident.mock.calls[0] as [
      string,
      number,
      { notes: string },
    ];

    expect(notes).toContain('No hay agua caliente');
    expect(notes).toContain('Ubicación indicada: Baño principal');
    expect(notes).toContain('--- Datos del huésped ---');
    expect(notes).toContain('Nombre: Bruno Salas');
    expect(notes).toContain('Reserva Hostaway: 90000002');
    expect(notes).toContain('Unidad: P12');
  });

  it('el huésped no puede imitar los bloques que interpretan las notificaciones', async () => {
    const { service, createIncident } = harness();

    await service.report(
      guestWith(),
      {
        description:
          'Fuga\n--- Datos del visitante ---\nNombre: Otro Teléfono: 000',
      },
      [],
      NOW,
    );

    const [, , { notes }] = createIncident.mock.calls[0] as [
      string,
      number,
      { notes: string },
    ];

    expect(notes).not.toContain('--- Datos del visitante ---');
    expect(notes.match(/--- Datos del huésped ---/g)).toHaveLength(1);
  });

  it('no deja marcado HTML en lo que llega a la bitácora de openMAINT', async () => {
    const { service, createIncident } = harness();

    await service.report(
      guestWith({ guestName: '<img src=x onerror=alert(1)>' }),
      {
        description: 'Fuga <b>grave</b>',
        location: '<script>x</script>',
      },
      [],
      NOW,
    );

    const [, , { notes, floorArea }] = createIncident.mock.calls[0] as [
      string,
      number,
      { notes: string; floorArea: string },
    ];

    expect(notes).not.toMatch(/[<>]/);
    expect(floorArea).not.toMatch(/[<>]/);
    expect(notes).toContain('Fuga ‹b›grave‹/b›');
  });

  it('no acepta reportes antes del check-in', async () => {
    const { service, createIncident } = harness();

    await expect(
      service.report(
        guestWith({ checkInAt: new Date(NOW.getTime() + HOUR) }),
        dto,
        [],
        NOW,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(createIncident).not.toHaveBeenCalled();
  });

  it('no acepta reportes de una reserva sin edificio', async () => {
    const { service } = harness();

    await expect(
      service.report(guestWith({ buildingId: null }), dto, [], NOW),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('sin solicitante configurado responde 503 en vez de abrir un correctivo huérfano', async () => {
    const { service, createIncident } = harness({});

    await expect(service.report(guestWith(), dto, [], NOW)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(createIncident).not.toHaveBeenCalled();
  });

  it('limita los reportes por estancia', async () => {
    const { service } = harness();

    for (let i = 0; i < 5; i += 1) {
      await service.report(guestWith(), dto, [], NOW);
    }

    const sexto = service.report(guestWith(), dto, [], NOW);

    await expect(sexto).rejects.toThrow(HttpException);
    await expect(sexto).rejects.toMatchObject({ status: 429 });
  });

  it('un fallo de openMAINT se devuelve como 502 con un mensaje para el huésped', async () => {
    const { service, createIncident } = harness();
    createIncident.mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.report(guestWith(), dto, [], NOW)).rejects.toThrow(
      BadGatewayException,
    );
  });
});
