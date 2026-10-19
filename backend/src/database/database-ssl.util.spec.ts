import { resolveDatabaseSsl } from './database-ssl.util';

const NEON = 'postgresql://user:pass@ep-x.us-west-2.aws.neon.tech/dt4fm';

describe('resolveDatabaseSsl', () => {
  it.each(['require', 'verify-ca', 'verify-full'])(
    'activa TLS verificado con sslmode=%s',
    (mode) => {
      expect(resolveDatabaseSsl(`${NEON}?sslmode=${mode}`)).toEqual({
        rejectUnauthorized: true,
      });
    },
  );

  it('reconoce sslmode aunque no sea el primer parámetro', () => {
    expect(
      resolveDatabaseSsl(`${NEON}?channel_binding=require&sslmode=verify-full`),
    ).toEqual({ rejectUnauthorized: true });
  });

  it('sin sslmode (el contenedor local) no usa TLS', () => {
    expect(
      resolveDatabaseSsl('postgresql://dt4fm:dt4fm@localhost:5555/dt4fm'),
    ).toBe(false);
  });

  it('no confunde otro parámetro que contenga la palabra', () => {
    expect(resolveDatabaseSsl(`${NEON}?sslmode=disable`)).toBe(false);
  });
});
