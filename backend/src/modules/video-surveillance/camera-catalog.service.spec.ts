import { ServiceUnavailableException } from '@nestjs/common';
import { AccessIotGateway } from '../access-control/access-iot.gateway';
import { AccessIotCamera } from '../access-control/access-iot.types';
import { BuildingCatalogService } from '../access-control/building-catalog.service';
import { CameraCatalogService } from './camera-catalog.service';

const ING = 3025058;
const PRA = 3019998;

const camara = (cameraId: string, buildingId: number): AccessIotCamera => ({
  cameraId,
  name: cameraId,
  buildingId,
});

describe('CameraCatalogService', () => {
  const listCameras = jest.fn<Promise<AccessIotCamera[]>, []>();
  let catalog: CameraCatalogService;

  beforeEach(() => {
    listCameras.mockReset();
    catalog = new CameraCatalogService(
      { listCameras } as unknown as AccessIotGateway,
      {
        list: () =>
          Promise.resolve([
            { buildingId: ING, name: 'Inglaterra' },
            { buildingId: PRA, name: 'Pradera' },
          ]),
      } as unknown as BuildingCatalogService,
    );
  });

  it('agrupa por edificio con su nombre', async () => {
    listCameras.mockResolvedValue([
      camara('PRA-CAM-01', PRA),
      camara('ING-CAM-02', ING),
      camara('ING-CAM-01', ING),
    ]);

    const { stale, buildings } = await catalog.overview();

    expect(stale).toBe(false);
    expect(buildings).toEqual([
      {
        buildingId: ING,
        name: 'Inglaterra',
        reachable: true,
        cameras: [
          { cameraId: 'ING-CAM-01', name: 'ING-CAM-01' },
          { cameraId: 'ING-CAM-02', name: 'ING-CAM-02' },
        ],
      },
      {
        buildingId: PRA,
        name: 'Pradera',
        reachable: true,
        cameras: [{ cameraId: 'PRA-CAM-01', name: 'PRA-CAM-01' }],
      },
    ]);
  });

  it('una respuesta corta no borra: el edificio ausente queda sin conexión', async () => {
    listCameras.mockResolvedValueOnce([
      camara('ING-CAM-01', ING),
      camara('PRA-CAM-01', PRA),
    ]);
    await catalog.overview();

    listCameras.mockResolvedValueOnce([camara('ING-CAM-01', ING)]);
    const { buildings } = await catalog.overview();
    const pradera = buildings.find((b) => b.buildingId === PRA);

    expect(pradera).toMatchObject({
      reachable: false,
      cameras: [{ cameraId: 'PRA-CAM-01' }],
    });
  });

  it('con la VPS caída sirve lo conocido y lo marca stale', async () => {
    listCameras.mockResolvedValueOnce([camara('ING-CAM-01', ING)]);
    await catalog.overview();

    listCameras.mockRejectedValueOnce(new ServiceUnavailableException());
    const { stale, buildings } = await catalog.overview();

    expect(stale).toBe(true);
    expect(buildings[0].cameras).toHaveLength(1);
  });

  it('sin nada conocido, la caída de la VPS sube', async () => {
    listCameras.mockRejectedValueOnce(new ServiceUnavailableException());

    await expect(catalog.overview()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('forget retira la cámara que la VPS ya no reconoce', async () => {
    listCameras.mockResolvedValueOnce([camara('ING-CAM-01', ING)]);
    await catalog.overview();

    catalog.forget('ING-CAM-01');

    expect(catalog.find('ING-CAM-01')).toBeUndefined();
  });
});
