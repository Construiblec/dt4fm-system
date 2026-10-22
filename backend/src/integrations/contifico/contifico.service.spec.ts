import { ConfigService } from '@nestjs/config';
import { ContificoClient } from './contifico.client';
import { ContificoService } from './contifico.service';
import { ContificoCreateDocumentoDto } from './contifico.types';

const factura: ContificoCreateDocumentoDto = {
  pos: 'pos-token',
  fecha_emision: '14/10/2026',
  tipo_documento: 'FAC',
  documento: '001-001-012345678',
  autorizacion: 'HMABC123',
  cliente: {
    cedula: '9999999999',
    razon_social: 'Bruno Salas',
    tipo: 'I',
  },
  subtotal_0: 120,
  subtotal_12: 0,
  iva: 0,
  ice: 0,
  total: 120,
  detalles: [],
};

// Los dobles se guardan como `jest.fn()` sueltos, no como métodos de
// `jest.Mocked<Clase>`, para que las aserciones no disparen unbound-method.
const buildHarness = (useMock: string | undefined) => {
  const post = jest.fn().mockResolvedValue({
    id: 'real-1',
    documento: '001-001-012345678',
    total: '120.00',
    estado: 'P',
    fecha_emision: '14/10/2026',
    electronico: true,
  });
  const get = jest.fn();
  const client = { post, get } as unknown as ContificoClient;

  const config = {
    get: (key: string) => (key === 'CONTIFICO_USE_MOCK' ? useMock : undefined),
  } as unknown as ConfigService;

  return { service: new ContificoService(client, config), post, get };
};

describe('ContificoService', () => {
  describe('con CONTIFICO_USE_MOCK=true', () => {
    it('no llama a Contifico al crear la factura', async () => {
      const { service, post } = buildHarness('true');

      await service.createDocumento(factura);

      expect(post).not.toHaveBeenCalled();
    });

    it('devuelve un documento marcado como simulado', async () => {
      const { service } = buildHarness('true');

      const documento = await service.createDocumento(factura);

      expect(documento.id).toMatch(/^MOCK-/);
      expect(documento.documento).toBe('MOCK-001-001-012345678');
      expect(documento.total).toBe('120.00');
      expect(documento.electronico).toBe(false);
    });

    it('tampoco sale a la red al consultar un documento', async () => {
      const { service, get } = buildHarness('true');

      await service.getDocumento('real-1');

      expect(get).not.toHaveBeenCalled();
    });
  });

  // Solo "true" exacto activa el mock, como el resto de flags del backend.
  it.each([undefined, 'false', 'TRUE'])(
    'con CONTIFICO_USE_MOCK=%s factura contra Contifico',
    async (valor) => {
      const { service, post } = buildHarness(valor);

      const documento = await service.createDocumento(factura);

      expect(post).toHaveBeenCalledWith('/documento/', factura);
      expect(documento.id).toBe('real-1');
    },
  );
});
