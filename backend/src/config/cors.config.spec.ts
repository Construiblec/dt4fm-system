import { Logger } from '@nestjs/common';
import {
  corsOptions,
  isOriginAllowed,
  resolveAllowedOrigins,
} from './cors.config';

describe('resolveAllowedOrigins', () => {
  const ORIGINAL_ENV = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = ORIGINAL_ENV;
  });

  it('usa los tres dominios del piloto cuando la variable no está definida', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;

    expect(resolveAllowedOrigins()).toEqual([
      'http://localhost:5173',
      'https://dt4fm-staging.vercel.app',
      'https://dt4fm-system-f7cc.vercel.app',
    ]);
  });

  it('usa los tres dominios del piloto cuando la variable está vacía', () => {
    process.env.CORS_ALLOWED_ORIGINS = '   ';

    expect(resolveAllowedOrigins()).toHaveLength(3);
  });

  it('parsea una lista separada por comas, recortando espacios', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      ' https://a.example.com ,https://b.example.com,, ';

    expect(resolveAllowedOrigins()).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('normaliza barra final y mayúsculas de la variable', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      'https://Construiblec.cloud/,HTTPS://B.EXAMPLE.COM';

    expect(resolveAllowedOrigins()).toEqual([
      'https://construiblec.cloud',
      'https://b.example.com',
    ]);
  });
});

describe('isOriginAllowed', () => {
  const ORIGINAL_ENV = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = ORIGINAL_ENV;
  });

  it('acepta el origen declarado aunque se escribiera con barra final', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://construiblec.cloud/';

    expect(isOriginAllowed('https://construiblec.cloud')).toBe(true);
  });

  it('trata www y el dominio raíz como orígenes distintos', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://construiblec.cloud';

    expect(isOriginAllowed('https://www.construiblec.cloud')).toBe(false);
  });

  it('trata http y https como orígenes distintos', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://construiblec.cloud';

    expect(isOriginAllowed('http://construiblec.cloud')).toBe(false);
  });
});

describe('corsOptions', () => {
  const ORIGINAL_ENV = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    // El rechazo escribe un warn a propósito; aquí solo ensucia la salida.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.CORS_ALLOWED_ORIGINS = ORIGINAL_ENV;
  });

  /** Invoca el callback de `origin` y devuelve lo que le pasó a `callback`. */
  function decide(origin: string | undefined) {
    const decidir = corsOptions.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;

    let resultado: { err: Error | null; allow?: boolean } = { err: null };
    decidir(origin, (err, allow) => {
      resultado = { err, allow };
    });
    return resultado;
  }

  it('no declara allowedHeaders, para que el preflight las refleje', () => {
    // Si vuelve a declararse, cada cabecera nueva de un cliente (el
    // `X-Requested-With` que ExtJS añade solo) exige un despliegue.
    expect(corsOptions.allowedHeaders).toBeUndefined();
  });

  it('cachea el preflight 24 h', () => {
    expect(corsOptions.maxAge).toBe(86400);
  });

  it('acepta un origen declarado en la variable', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://187.77.250.224:8091';

    expect(decide('http://187.77.250.224:8091')).toEqual({
      err: null,
      allow: true,
    });
  });

  it('acepta peticiones sin Origin (curl, webhook IoT: no hay navegador)', () => {
    expect(decide(undefined)).toEqual({ err: null, allow: true });
  });

  it('rechaza con false y no con Error, para que el preflight no sea 500', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://construiblec.cloud';

    // Un Error aquí hacía que Nest respondiera 500 al preflight, que en el
    // navegador se lee como "se cayó el servidor" en vez de como un CORS mal
    // configurado.
    expect(decide('https://otro.example.com')).toEqual({
      err: null,
      allow: false,
    });
  });
});
