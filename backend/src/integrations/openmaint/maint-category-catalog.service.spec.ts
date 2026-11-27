import { BadRequestException } from '@nestjs/common';
import { OpenmaintClient } from './openmaint.client';
import { OpenmaintServiceSession } from './openmaint.service-session';
import {
  cleanCategoryName,
  correctiveTitle,
  MaintCategoryCatalogService,
} from './maint-category-catalog.service';

const categories = {
  data: [
    { _id: 1, Code: 'MNT', Description: 'MNT - Mantenimiento' },
    { _id: 2, Code: 'LIM', Description: 'LIM - Limpieza' },
  ],
};

const subcategories = {
  data: [
    { _id: 11, Category: 1, Code: 'OTRO', Description: 'Otro' },
    { _id: 12, Category: 1, Code: 'PLM', Description: 'Plomería' },
    { _id: 13, Category: 1, Code: 'AGC', Description: 'Agua caliente' },
    { _id: 21, Category: 2, Code: 'MAN', Description: 'Manchas' },
  ],
};

const buildService = (get: jest.Mock) =>
  new MaintCategoryCatalogService(
    { get } as unknown as OpenmaintClient,
    { get: () => Promise.resolve('svc') } as unknown as OpenmaintServiceSession,
  );

const okGet = () =>
  jest.fn((path: string) =>
    Promise.resolve(
      path.includes('MaintSubcategory') ? subcategories : categories,
    ),
  );

describe('MaintCategoryCatalogService', () => {
  it('agrupa, limpia nombres y deja «Otro» al final', async () => {
    const list = await buildService(okGet()).list();

    expect(list.map((c) => c.name)).toEqual(['Limpieza', 'Mantenimiento']);
    expect(list[1].subcategories).toEqual([
      { id: 13, name: 'Agua caliente', isOther: false },
      { id: 12, name: 'Plomería', isOther: false },
      { id: 11, name: 'Otro', isOther: true },
    ]);
  });

  it('cachea la lectura', async () => {
    const get = okGet();
    const service = buildService(get);

    await service.list();
    await service.list();

    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each(['MaintCategory', 'MaintSubcategory'])(
    'una respuesta de %s sin data falla y no cachea un catálogo vacío',
    async (broken) => {
      const get = jest.fn((path: string) =>
        Promise.resolve(
          path.includes(broken)
            ? {}
            : path.includes('MaintSubcategory')
              ? subcategories
              : categories,
        ),
      );
      const service = buildService(get);

      await expect(service.list()).rejects.toThrow('sin listado');

      get.mockImplementation(okGet());
      expect(await service.list()).toHaveLength(2);
    },
  );

  it('usa la sesión recibida sin pedir la de servicio', async () => {
    const get = okGet();
    const serviceGet = jest.fn(() => Promise.resolve('svc'));
    const service = new MaintCategoryCatalogService(
      { get } as unknown as OpenmaintClient,
      { get: serviceGet } as unknown as OpenmaintServiceSession,
    );

    await service.resolve(1, 12, 'compartida');

    expect(serviceGet).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(expect.any(String), 'compartida');
  });

  it('sin sesión recibida usa la de servicio', async () => {
    const get = okGet();

    await buildService(get).list();

    expect(get).toHaveBeenCalledWith(expect.any(String), 'svc');
  });

  it('devuelve la caché anterior si la lectura falla', async () => {
    const get = okGet();
    const service = buildService(get);
    await service.list();

    (service as unknown as { cachedAt: number }).cachedAt = 0;
    get.mockRejectedValue(new Error('caído'));

    await expect(service.list()).resolves.toHaveLength(2);
  });

  it('rechaza una subcategoría de otra categoría', async () => {
    const service = buildService(okGet());

    await expect(service.resolve(2, 12)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.resolve(1, 12)).resolves.toMatchObject({
      subcategory: { name: 'Plomería' },
    });
  });
});

describe('correctiveTitle', () => {
  it('usa la subcategoría o el texto de «Otro»', () => {
    expect(
      correctiveTitle({ id: 1, name: 'Plomería', isOther: false }, 'x'),
    ).toBe('Plomería');
    expect(
      correctiveTitle({ id: 2, name: 'Otro', isOther: true }, ' Puerta '),
    ).toBe('Puerta');
  });

  it('exige texto cuando es «Otro»', () => {
    expect(() =>
      correctiveTitle({ id: 2, name: 'Otro', isOther: true }, ' '),
    ).toThrow(BadRequestException);
  });
});

describe('cleanCategoryName', () => {
  it('quita el prefijo de código', () => {
    expect(cleanCategoryName('MNT - Mantenimiento')).toBe('Mantenimiento');
    expect(cleanCategoryName('Sistema de agua caliente')).toBe(
      'Sistema de agua caliente',
    );
  });
});
