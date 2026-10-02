import { AccessIotMockGateway } from './access-iot.mock';
import { PutCredentialRequest } from './access-iot.types';

const ING = 3025058;
const PRA = 3019998;

const peticion = (
  overrides: Partial<PutCredentialRequest> = {},
): PutCredentialRequest => ({
  buildingId: ING,
  scope: 'pedestrian',
  subjectType: 'guest',
  pin: '5073',
  validFrom: '2026-09-14T12:00:00-05:00',
  validTo: '2026-09-18T15:00:00-05:00',
  displayName: 'Ana Pérez',
  ...overrides,
});

/**
 * El mock es lo que se le entrega al equipo IoT como referencia ejecutable del
 * contrato, así que conviene que cumpla lo que el documento promete.
 */
describe('AccessIotMockGateway', () => {
  let gateway: AccessIotMockGateway;

  beforeEach(() => {
    gateway = new AccessIotMockGateway();
  });

  it('solo declara cubiertos los edificios con puertas con PIN', async () => {
    const codigos = (await gateway.listBuildings()).map(
      (edificio) => edificio.code,
    );

    expect(codigos).toEqual(['ING', 'PRA']);
    expect(codigos).not.toContain('BAT');
    expect(codigos).not.toContain('REP');
  });

  it('escribe en todas las puertas del ámbito pedido', async () => {
    const resultado = await gateway.putCredential('cred-1', peticion());

    expect(resultado.state).toBe('written');
    expect(resultado.devices).toHaveLength(1);
    expect(resultado.devices[0].deviceId).toBe('ING-PEATONAL-1');
  });

  it('devuelve partial cuando una de las puertas está caída', async () => {
    const resultado = await gateway.putCredential(
      'cred-2',
      peticion({ buildingId: PRA, scope: 'both' }),
    );

    expect(resultado.state).toBe('partial');
    expect(
      resultado.devices.filter((device) => device.state === 'unreachable'),
    ).toHaveLength(1);
  });

  it('devuelve pin_conflict si el PIN ya lo usa un usuario cargado a mano', async () => {
    const resultado = await gateway.putCredential(
      'cred-3',
      peticion({ pin: '4821' }),
    );

    expect(resultado.state).toBe('failed');
    expect(resultado.errorCode).toBe('pin_conflict');
  });

  it('rechaza un edificio que no existe en el catálogo', async () => {
    const resultado = await gateway.putCredential(
      'cred-4',
      peticion({ buildingId: 999 }),
    );

    expect(resultado.errorCode).toBe('invalid_request');
  });

  it('es idempotente: reescribir deja el mismo employeeNo', async () => {
    const primera = await gateway.putCredential('cred-5', peticion());
    const segunda = await gateway.putCredential('cred-5', peticion());

    expect(segunda.devices[0].employeeNo).toBe(primera.devices[0].employeeNo);
  });

  it('deriva el employeeNo con el prefijo reservado del tipo de sujeto', async () => {
    const huesped = await gateway.putCredential('cred-6', peticion());
    const personal = await gateway.putCredential(
      'cred-7',
      peticion({ subjectType: 'employee', pin: '7412' }),
    );

    expect(huesped.devices[0].employeeNo).toMatch(/^DT4G[0-9A-F]{8}$/);
    expect(personal.devices[0].employeeNo).toMatch(/^DT4E[0-9A-F]{8}$/);
  });

  it('borrar algo ya borrado es éxito, no un fallo', async () => {
    await gateway.putCredential('cred-8', peticion());

    await expect(gateway.deleteCredential('cred-8')).resolves.toMatchObject({
      state: 'written',
      devices: [{ deviceId: 'ING-PEATONAL-1', state: 'deleted' }],
    });
    await expect(gateway.deleteCredential('cred-8')).resolves.toMatchObject({
      state: 'written',
    });
    await expect(gateway.getCredential('cred-8')).resolves.toBeNull();
  });

  it('el inventario distingue lo gestionado de lo cargado a mano', async () => {
    await gateway.putCredential('cred-9', peticion());

    const { users } = await gateway.getDeviceInventory('ING-PEATONAL-1');
    const manual = users.find((user) => user.employeeNo === '77');
    const gestionado = users.find((user) => user.managed);

    expect(manual?.managed).toBe(false);
    expect(gestionado?.employeeNo).toMatch(/^DT4[GTE][0-9A-F]{8}$/);
  });

  it('el inventario nunca expone PINes', async () => {
    await gateway.putCredential('cred-10', peticion());

    const { users } = await gateway.getDeviceInventory('ING-PEATONAL-1');

    expect(JSON.stringify(users)).not.toContain('5073');
  });

  describe('triggerDevice', () => {
    const id = (n: number) =>
      `6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c${String(n).padStart(2, '0')}`;

    it('pulsa una barrera vehicular en línea', async () => {
      await expect(
        gateway.triggerDevice('ING-VEHICULAR-1', { requestId: id(1) }),
      ).resolves.toEqual({ outcome: 'triggered' });
    });

    it('una puerta peatonal es device_not_compatible', async () => {
      await expect(
        gateway.triggerDevice('ING-PEATONAL-1', { requestId: id(2) }),
      ).resolves.toEqual({
        outcome: 'failed',
        errorCode: 'device_not_compatible',
      });
    });

    it('una barrera caída falla con device_unreachable', async () => {
      await expect(
        gateway.triggerDevice('PRA-VEHICULAR-1', { requestId: id(3) }),
      ).resolves.toEqual({
        outcome: 'failed',
        errorCode: 'device_unreachable',
      });
    });

    it('una puerta desconocida es not_found', async () => {
      await expect(
        gateway.triggerDevice('NO-EXISTE', { requestId: id(4) }),
      ).resolves.toEqual({ outcome: 'failed', errorCode: 'not_found' });
    });

    it('rechaza actor u otro campo, como la API central', async () => {
      await expect(
        gateway.triggerDevice('ING-VEHICULAR-1', {
          requestId: id(5),
          actor: { type: 'staff', ref: 'cav.mock' },
        } as never),
      ).resolves.toEqual({ outcome: 'failed', errorCode: 'invalid_request' });
    });

    it('rechaza un requestId en mayúsculas o con llaves', async () => {
      for (const requestId of [id(6).toUpperCase(), `{${id(6)}}`]) {
        await expect(
          gateway.triggerDevice('ING-VEHICULAR-1', { requestId }),
        ).resolves.toEqual({ outcome: 'failed', errorCode: 'invalid_request' });
      }
    });

    it('repetir el requestId devuelve el mismo pulso, no un segundo', async () => {
      const primera = await gateway.triggerDevice('ING-VEHICULAR-1', {
        requestId: id(7),
      });
      const segunda = await gateway.triggerDevice('ING-VEHICULAR-1', {
        requestId: id(7),
      });

      expect(segunda).toBe(primera);
    });

    it('ya no expone open ni close', () => {
      expect('commandDevice' in gateway).toBe(false);
    });
  });

  it('la salud separa el túnel del gateway de la LAN de cada terminal', async () => {
    const { buildings } = await gateway.getHealth();
    const pradera = buildings.find((building) => building.buildingId === PRA);

    expect(pradera?.gatewayOnline).toBe(true);
    expect(pradera?.devices?.some((device) => device.online === false)).toBe(
      true,
    );
  });

  describe('cámaras en vivo', () => {
    const REQUEST_ID = '6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13';

    it('filtra el catálogo por edificio', async () => {
      const camaras = await gateway.listCameras(ING);

      expect(camaras.map((camara) => camara.cameraId)).toEqual([
        'ING-CAM-01',
        'ING-CAM-02',
      ]);
    });

    it('emite una sesión solo por relay, con el eco de la petición', async () => {
      const resultado = await gateway.createLiveSession('ING-CAM-01', {
        requestId: REQUEST_ID,
      });

      expect(resultado).toMatchObject({
        outcome: 'issued',
        session: {
          requestId: REQUEST_ID,
          cameraId: 'ING-CAM-01',
          buildingId: ING,
          iceTransportPolicy: 'relay',
        },
      });
    });

    it('una cámara desconocida es not_found y un requestId en mayúsculas, invalid_request', async () => {
      await expect(
        gateway.createLiveSession('BAT-CAM-01', { requestId: REQUEST_ID }),
      ).resolves.toEqual({ outcome: 'failed', errorCode: 'not_found' });
      await expect(
        gateway.createLiveSession('ING-CAM-01', {
          requestId: REQUEST_ID.toUpperCase(),
        }),
      ).resolves.toEqual({ outcome: 'failed', errorCode: 'invalid_request' });
    });

    it('PRA-CAM-02 simula los cupos agotados', async () => {
      await expect(
        gateway.createLiveSession('PRA-CAM-02', { requestId: REQUEST_ID }),
      ).resolves.toEqual({
        outcome: 'failed',
        errorCode: 'live_capacity_reached',
      });
    });
  });
});
