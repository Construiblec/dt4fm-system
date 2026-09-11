import { OpenmaintClient } from './openmaint.client';
import { OpenmaintServiceSession } from './openmaint.service-session';
import { UnitResolverService } from './unit-resolver.service';

/** Forma real de una card `Unit`, verificada contra openMAINT. */
const card = (id: number, building: number | null = 3025058) => ({
  _id: id,
  Code: 'I47',
  HostawayListingID: '566095',
  Building: building,
});

const buildService = (get: jest.Mock) =>
  new UnitResolverService(
    { get } as unknown as OpenmaintClient,
    {
      get: () => Promise.resolve('session-id'),
    } as unknown as OpenmaintServiceSession,
  );

describe('UnitResolverService', () => {
  it('resuelve la unidad y el edificio de un listing mapeado', async () => {
    const get = jest.fn().mockResolvedValue({ data: [card(3728730)] });

    await expect(buildService(get).byListingId('566095')).resolves.toEqual({
      unitId: 3728730,
      buildingId: 3025058,
    });
  });

  it('filtra por HostawayListingID, con la D final en mayúscula', async () => {
    const get = jest.fn().mockResolvedValue({ data: [card(3728730)] });

    await buildService(get).byListingId('566095');

    const [url] = get.mock.calls[0] as [string];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('"attribute":"HostawayListingID"');
    expect(decoded).toContain('/classes/Unit/cards');
  });

  it('devuelve null si el listing no está mapeado', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });

    await expect(buildService(get).byListingId('000000')).resolves.toBeNull();
  });

  it('devuelve null si el listing apunta a más de una unidad', async () => {
    // Ambiguo es peor que ausente: colocar el PIN en el edificio equivocado
    // abre una puerta que no toca.
    const get = jest
      .fn()
      .mockResolvedValue({ data: [card(1), card(2, 3019998)] });

    await expect(buildService(get).byListingId('566095')).resolves.toBeNull();
  });

  it('devuelve null, sin romper, si la unidad no tiene edificio', async () => {
    const get = jest.fn().mockResolvedValue({ data: [card(3728730, null)] });

    await expect(buildService(get).byListingId('566095')).resolves.toEqual({
      unitId: 3728730,
      buildingId: null,
    });
  });

  it('cachea la respuesta y no vuelve a consultar openMAINT', async () => {
    const get = jest.fn().mockResolvedValue({ data: [card(3728730)] });
    const service = buildService(get);

    await service.byListingId('566095');
    await service.byListingId('566095');

    expect(get).toHaveBeenCalledTimes(1);
  });

  // Un fallo no es «sin mapear»: el llamador decide si reintentar o reutilizar el edificio.
  it('propaga un fallo de red en vez de confundirlo con un listing sin mapear', async () => {
    const get = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

    await expect(buildService(get).byListingId('566095')).rejects.toThrow(
      'ECONNRESET',
    );
  });

  it('no cachea un fallo de red: un corte no puede dejar el listing sin resolver 5 minutos', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ data: [card(3728730)] });
    const service = buildService(get);

    await expect(service.byListingId('566095')).rejects.toThrow();
    await expect(service.byListingId('566095')).resolves.toMatchObject({
      unitId: 3728730,
    });
  });

  it('acota la consulta con un timeout', async () => {
    const get = jest.fn().mockResolvedValue({ data: [card(3728730)] });

    await buildService(get).byListingId('566095');

    const [, , config] = get.mock.calls[0] as [string, string, unknown];
    expect(config).toEqual({ timeout: 5_000 });
  });

  it('olvida una entrada cacheada cuando se le pide', async () => {
    const get = jest.fn().mockResolvedValue({ data: [card(3728730)] });
    const service = buildService(get);

    await service.byListingId('566095');
    service.forget('566095');
    await service.byListingId('566095');

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('no consulta con un listing vacío', async () => {
    const get = jest.fn();

    await expect(buildService(get).byListingId('  ')).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
