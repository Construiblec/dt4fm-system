import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CM_STATUS_IDS } from '../maintenance-supervision/constants/corrective-maint.constants';
import { CorrectiveMaintOpenmaintService } from '../maintenance-supervision/corrective-maint.openmaint.service';
import { PM_STATUS_IDS } from '../preventive-maintenance/constants/preventive-maint.constants';
import { PreventiveMaintenanceOpenmaintService } from '../preventive-maintenance/preventive-maintenance.openmaint.service';
import { CorrectiveDocumentsService } from './corrective-documents.service';
import { EquipmentOpenmaintService } from './equipment.openmaint.service';

const SESSION_ID = 'session-token';

const card = {
  _id: 9001,
  Number: 'MC.2026.0101',
  ShortDescr: 'Fuga en lavamanos',
  ProcessStatus: CM_STATUS_IDS.EXECUTION,
  _FlowStatus_code: 'open.running',
  Asset: 3209930,
};

const equipmentCard = {
  _id: 3209930,
  _type: 'Boiler',
  Code: 'GAS 01',
  Description: 'GAS 01 - Calentador',
  CISubset: 3209399,
  _Building_description: 'I - Inglaterra',
  _Floor_description: 'Planta Alta 1',
};

type Mocked<T> = Record<keyof T, jest.Mock>;

describe('CorrectiveDocumentsService', () => {
  let service: CorrectiveDocumentsService;
  let corrective: Partial<Mocked<CorrectiveMaintOpenmaintService>>;
  let preventive: Partial<Mocked<PreventiveMaintenanceOpenmaintService>>;
  let equipment: Mocked<EquipmentOpenmaintService>;

  beforeEach(() => {
    corrective = {
      findById: jest.fn().mockResolvedValue({ data: card }),
      findByAsset: jest.fn().mockResolvedValue({ data: [] }),
      findAttachments: jest.fn().mockResolvedValue({ data: [] }),
      uploadAttachment: jest.fn().mockResolvedValue(true),
      deleteAttachment: jest.fn().mockResolvedValue(true),
      downloadAttachment: jest.fn(),
    };
    preventive = {
      findByEquipment: jest.fn().mockResolvedValue({ data: [] }),
      findAttachments: jest.fn().mockResolvedValue({ data: [] }),
    };
    equipment = {
      findById: jest.fn().mockResolvedValue(equipmentCard),
      search: jest.fn(),
      findAttachments: jest.fn().mockResolvedValue([]),
      downloadAttachment: jest.fn(),
      findManualIdsBySubset: jest.fn().mockResolvedValue([]),
      findManualAttachments: jest.fn().mockResolvedValue([]),
      downloadManualAttachment: jest.fn(),
    };

    service = new CorrectiveDocumentsService(
      corrective as unknown as CorrectiveMaintOpenmaintService,
      preventive as unknown as PreventiveMaintenanceOpenmaintService,
      equipment as unknown as EquipmentOpenmaintService,
    );
  });

  describe('getAttachments', () => {
    it('marca el informe generado y las fotos', async () => {
      corrective.findAttachments!.mockResolvedValue({
        data: [
          { _id: 'a1', fileName: 'foto.jpg' },
          {
            _id: 'a2',
            fileName: 'informe.pdf',
            description: '[MC.2026.0101] Informe',
          },
        ],
      });

      const result = await service.getAttachments(SESSION_ID, 9001);

      expect(result.data).toEqual([
        expect.objectContaining({ id: 'a1', isImage: true, isReport: false }),
        expect.objectContaining({
          id: 'a2',
          isReport: true,
          downloadUrl: '/corrective-maintenance/9001/attachments/a2/download',
        }),
      ]);
    });

    it('devuelve 404 si el correctivo no existe', async () => {
      corrective.findById!.mockResolvedValue({});

      await expect(
        service.getAttachments(SESSION_ID, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propaga la sesión caducada como 401', async () => {
      corrective.findById!.mockRejectedValue({ response: { status: 401 } });

      await expect(
        service.getAttachments(SESSION_ID, 1),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('uploadAttachment', () => {
    const photo = {
      buffer: Buffer.from('x'),
      originalname: 'foto.jpg',
      mimetype: 'image/jpeg',
    };

    it('sube el archivo y devuelve la lista actualizada', async () => {
      corrective.findAttachments!.mockResolvedValue({
        data: [{ _id: 'a1', fileName: 'foto.jpg' }],
      });

      const result = await service.uploadAttachment(SESSION_ID, 9001, photo);

      expect(corrective.uploadAttachment).toHaveBeenCalledWith(
        SESSION_ID,
        9001,
        photo,
      );
      expect(result.data[0].fileName).toBe('foto.jpg');
    });

    it('rechaza adjuntar a un correctivo cerrado', async () => {
      corrective.findById!.mockResolvedValue({
        data: { ...card, ProcessStatus: CM_STATUS_IDS.COMPLETED },
      });

      await expect(
        service.uploadAttachment(SESSION_ID, 9001, photo),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(corrective.uploadAttachment).not.toHaveBeenCalled();
    });

    it('traduce un fallo de la subida a 502', async () => {
      corrective.uploadAttachment!.mockRejectedValue(new Error('boom'));

      await expect(
        service.uploadAttachment(SESSION_ID, 9001, photo),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('deleteAttachment', () => {
    beforeEach(() => {
      corrective.findAttachments!.mockResolvedValue({
        data: [
          { _id: 'd1', fileName: 'cotizacion.pdf' },
          {
            _id: 'r1',
            fileName: 'informe.pdf',
            description: '[MC.2026.0101] Informe',
          },
        ],
      });
    });

    it('elimina un archivo subido por un usuario', async () => {
      await service.deleteAttachment(SESSION_ID, 9001, 'd1');

      expect(corrective.deleteAttachment).toHaveBeenCalledWith(
        SESSION_ID,
        9001,
        'd1',
      );
    });

    it('no deja borrar el informe generado', async () => {
      await expect(
        service.deleteAttachment(SESSION_ID, 9001, 'r1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('devuelve 404 si el adjunto no existe', async () => {
      await expect(
        service.deleteAttachment(SESSION_ID, 9001, 'zz'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getEquipmentDocuments', () => {
    it('sin equipo devuelve una lista vacía', async () => {
      corrective.findById!.mockResolvedValue({
        data: { ...card, Asset: null },
      });

      const result = await service.getEquipmentDocuments(SESSION_ID, 9001);

      expect(result).toEqual({
        success: true,
        data: [],
        meta: { total: 0, equipment: null },
      });
      expect(equipment.findById).not.toHaveBeenCalled();
    });

    it('junta los adjuntos del equipo y los de sus manuales', async () => {
      equipment.findAttachments.mockResolvedValue([
        { _id: 'e1', name: 'ficha.pdf' },
      ]);
      equipment.findManualIdsBySubset.mockResolvedValue([7236684]);
      equipment.findManualAttachments.mockResolvedValue([
        { _id: 'm1', name: 'manual.pdf' },
      ]);

      const result = await service.getEquipmentDocuments(SESSION_ID, 9001);

      expect(result.data.map((doc) => doc.downloadUrl)).toEqual([
        '/corrective-maintenance/9001/documents/asset/e1/download',
        '/corrective-maintenance/9001/documents/manual-7236684/m1/download',
      ]);
      expect(result.meta.equipment).toEqual({
        id: 3209930,
        code: 'GAS 01',
        description: 'GAS 01 - Calentador',
        place: 'I - Inglaterra · Planta Alta 1',
      });
    });

    it('no descarga manuales que no son del equipo', async () => {
      equipment.findManualIdsBySubset.mockResolvedValue([1]);
      const res = { setHeader: jest.fn(), send: jest.fn() };

      await expect(
        service.streamEquipmentDocument(
          SESSION_ID,
          9001,
          'manual-999',
          'm1',
          res as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(equipment.downloadManualAttachment).not.toHaveBeenCalled();
    });
  });

  describe('getEquipmentHistory', () => {
    it('mezcla correctivos y preventivos, sin el actual y del más reciente al más antiguo', async () => {
      corrective.findByAsset!.mockResolvedValue({
        data: [
          {
            _id: 9001,
            Number: 'MC.2026.0101',
            ExecEndDate: '2026-10-08T00:00:00Z',
          },
          {
            _id: 8001,
            Number: 'MC.2026.0050',
            ExecEndDate: '2026-08-21T00:00:00Z',
          },
        ],
      });
      preventive.findByEquipment!.mockImplementation(
        (_session, { equipmentAttr }) =>
          Promise.resolve({
            data:
              equipmentAttr === 'CI'
                ? [
                    {
                      _id: 7001,
                      Number: 'PM.0120',
                      ExecEndDate: '2026-09-12T00:00:00Z',
                    },
                  ]
                : [
                    {
                      _id: 7001,
                      Number: 'PM.0120',
                      ExecEndDate: '2026-09-12T00:00:00Z',
                    },
                  ],
          }),
      );
      preventive.findAttachments!.mockResolvedValue({ data: [{ _id: 'p' }] });

      const result = await service.getEquipmentHistory(SESSION_ID, 9001, 3);

      expect(
        result.data.map((entry) => [
          entry.kind,
          entry.id,
          entry.attachmentCount,
        ]),
      ).toEqual([
        ['preventive', 7001, 1],
        ['corrective', 8001, 0],
      ]);
      expect(corrective.findByAsset).toHaveBeenCalledWith(SESSION_ID, 3209930, {
        limit: 4,
        statusIds: [CM_STATUS_IDS.COMPLETED],
      });
      expect(preventive.findByEquipment).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({
          equipmentAttr: 'CISubset',
          statusIds: [PM_STATUS_IDS.COMPLETED],
        }),
      );
    });

    it('sin equipo no consulta el historial', async () => {
      corrective.findById!.mockResolvedValue({
        data: { ...card, Asset: null },
      });

      const result = await service.getEquipmentHistory(SESSION_ID, 9001, 3);

      expect(result.data).toEqual([]);
      expect(corrective.findByAsset).not.toHaveBeenCalled();
    });
  });
});
