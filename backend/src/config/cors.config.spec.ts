import { isOriginAllowed, resolveAllowedOrigins } from './cors.config';

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
