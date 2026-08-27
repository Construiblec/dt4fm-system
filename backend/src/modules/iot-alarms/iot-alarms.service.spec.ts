import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import {
  MAINT_PROCESS_TYPE,
  SHORT_DESCR_MAX,
} from './constants/iot-alarm.constants';
import { CM_PRIORITY_IDS } from '../maintenance-supervision/constants/corrective-maint.constants';
import { CreateIotAlarmDto } from './dto/create-iot-alarm.dto';
import { IotAlarmOpenmaintService } from './iot-alarm.openmaint.service';
import { IotAlarmsService } from './iot-alarms.service';

/** Activo real de la instancia (`CAL 01`), recortado a lo que se usa. */
const assetCard = {
  _id: 3209930,
  _type: 'Boiler',
  Code: 'CAL 01',
  Description: 'CAL 01 - Calefón 1',
  Building: 3025058,
  _Building_description: 'I - Inglaterra',
  Floor: 3055144,
  _Floor_description: 'I-P1 - Planta Alta 1',
};

const SESSION_ID = 'session-token';
const REQUESTER_ID = 8191305;
const FALLBACK_SITE_ID = 3019998;

/** Cuerpo tal como lo emite la Raspberry, con campos fuera del DTO. */
const rawPayload = {
  building: 'Pradera',
  place: 'Area comunal',
  event: 'GLP1_LOW_PRESSURE',
  device: 'GLP001',
  psi: 78,
  timestamp: '2026-08-25T10:52:55-05:00',
  message: 'Presion baja en tanque GLP',
  assetCode: 'CAL 01',
};

const dto: CreateIotAlarmDto = {
  assetCode: 'CAL 01',
  event: 'GLP1_LOW_PRESSURE',
  timestamp: '2026-08-25T10:52:55-05:00',
  message: 'Presion baja en tanque GLP',
  device: 'GLP001',
};

type OpenmaintGatewayMock = Record<keyof IotAlarmOpenmaintService, jest.Mock>;

const config: Record<string, string> = {
  OPENMAINT_IOT_REQUESTER_ID: String(REQUESTER_ID),
  OPENMAINT_IOT_FALLBACK_SITE_ID: String(FALLBACK_SITE_ID),
  IOT_CREATE_MAX_ATTEMPTS: '2',
};

describe('IotAlarmsService', () => {
  let service: IotAlarmsService;
  let openmaint: OpenmaintGatewayMock;
  let pushDispatch: { notifyCorrectiveOpened: jest.Mock };

  /** Campos que se enviaron a `createCorrective` en la última llamada. */
  const sentFields = (): Record<string, unknown> => {
    const call = openmaint.createCorrective.mock.calls[0] as unknown[];

    return call[1] as Record<string, unknown>;
  };

  beforeEach(async () => {
    openmaint = {
      findAssetByCode: jest
        .fn()
        .mockResolvedValue({ outcome: 'found', asset: assetCard }),
      createCorrective: jest
        .fn()
        .mockResolvedValue({ id: 8192662, number: 'CM.2026.0149' }),
    } as unknown as OpenmaintGatewayMock;

    pushDispatch = {
      notifyCorrectiveOpened: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        IotAlarmsService,
        { provide: IotAlarmOpenmaintService, useValue: openmaint },
        {
          provide: OpenmaintServiceSession,
          useValue: { get: jest.fn().mockResolvedValue(SESSION_ID) },
        },
        { provide: PushDispatchService, useValue: pushDispatch },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(IotAlarmsService);
  });

  describe('activo resuelto', () => {
    it('cuelga el correctivo del activo y hereda su ubicación', async () => {
      const result = await service.handle(dto, rawPayload);

      expect(sentFields()).toMatchObject({
        Asset: 3209930,
        Site: 3025058,
        Floor: 3055144,
        Requester: REQUESTER_ID,
        Priority: CM_PRIORITY_IDS.CRITICAL,
        Type: MAINT_PROCESS_TYPE.BREAKDOWN,
        OpeningDate: dto.timestamp,
      });

      expect(result).toEqual({
        incidentId: 8192662,
        number: 'CM.2026.0149',
        assetResolved: true,
        assetId: 3209930,
      });
    });

    it('avisa al supervisor como "Sistema IoT", no como lo llama openMAINT', async () => {
      await service.handle(dto, rawPayload);

      expect(pushDispatch.notifyCorrectiveOpened).toHaveBeenCalledWith({
        id: 8192662,
        requesterName: 'Sistema IoT',
        // El activo es lo primero que debe leer el supervisor; desplaza al piso.
        assetName: 'CAL 01 - Calefón 1',
        floorName: 'I-P1 - Planta Alta 1',
        buildingName: 'I - Inglaterra',
      });
    });

    it('conserva en las notas los campos que el DTO no declara', async () => {
      await service.handle(dto, rawPayload);

      const notes = String(sentFields().ProcessNotes);

      expect(notes).toContain('psi: 78');
      expect(notes).toContain('place: Area comunal');
    });
  });

  describe('activo no resuelto', () => {
    it('registra igual la alarma en el Site de respaldo cuando el código no existe', async () => {
      openmaint.findAssetByCode.mockResolvedValue({ outcome: 'missing' });

      const result = await service.handle(dto, rawPayload);

      const fields = sentFields();
      expect(fields.Site).toBe(FALLBACK_SITE_ID);
      expect(fields).not.toHaveProperty('Asset');
      expect(fields).not.toHaveProperty('Floor');
      expect(String(fields.ProcessNotes)).toContain('no existe ningún activo');
      expect(result.assetResolved).toBe(false);
    });

    it('no adivina cuando el código es ambiguo y deja los candidatos en las notas', async () => {
      openmaint.findAssetByCode.mockResolvedValue({
        outcome: 'ambiguous',
        candidateIds: [4804473, 8189834, 8190907],
      });

      await service.handle({ ...dto, assetCode: 'SPR-1' }, rawPayload);

      const fields = sentFields();
      expect(fields).not.toHaveProperty('Asset');
      expect(fields.Site).toBe(FALLBACK_SITE_ID);
      expect(String(fields.ProcessNotes)).toContain(
        '4804473, 8189834, 8190907',
      );
    });

    it('usa el código recibido en el asunto para no perder la pista', async () => {
      openmaint.findAssetByCode.mockResolvedValue({ outcome: 'missing' });

      await service.handle(dto, rawPayload);

      expect(sentFields().ShortDescr).toBe(
        '[IoT] Presion baja en tanque GLP - CAL 01',
      );
    });
  });

  describe('asunto', () => {
    it('cae al tipo de evento cuando la alarma no trae mensaje', async () => {
      await service.handle({ ...dto, message: undefined }, rawPayload);

      expect(sentFields().ShortDescr).toBe(
        '[IoT] GLP1_LOW_PRESSURE - CAL 01 - Calefón 1',
      );
    });

    it('trunca a los 255 caracteres de la columna de CMDBuild', async () => {
      await service.handle({ ...dto, message: 'x'.repeat(400) }, rawPayload);

      expect(String(sentFields().ShortDescr)).toHaveLength(SHORT_DESCR_MAX);
    });
  });

  describe('fallo de openMAINT', () => {
    it('reintenta ante un 5xx y devuelve 502 al agotar los intentos', async () => {
      const serverError = { response: { status: 500 } };
      openmaint.createCorrective.mockRejectedValue(serverError);

      await expect(service.handle(dto, rawPayload)).rejects.toBeInstanceOf(
        BadGatewayException,
      );

      expect(openmaint.createCorrective).toHaveBeenCalledTimes(2);
    });

    it('no insiste ante un 4xx, que no mejora repitiendo', async () => {
      openmaint.createCorrective.mockRejectedValue({
        response: { status: 400 },
      });

      await expect(service.handle(dto, rawPayload)).rejects.toBeInstanceOf(
        BadGatewayException,
      );

      expect(openmaint.createCorrective).toHaveBeenCalledTimes(1);
    });
  });
});
