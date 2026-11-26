import { Logger } from '@nestjs/common';
import { IntegrationsApiModule } from './integrations-api.module';
import { resetKeyListWarnings } from './utils/read-key-list.util';

describe('IntegrationsApiModule', () => {
  beforeEach(() => resetKeyListWarnings());

  it('avisa al arrancar de las variables obsoletas, sin esperar a una petición', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const values: Record<string, string> = {
      CLEANINGS_API_KEYS: 'a:' + 'x'.repeat(32),
      CLEANINGS_WRITE_API_KEYS: 'b:' + 'y'.repeat(32),
    };

    new IntegrationsApiModule({
      get: (key: string) => values[key],
    } as never).onModuleInit();

    const messages = warn.mock.calls.map(([message]) => String(message));
    expect(messages).toEqual([
      expect.stringContaining('CLEANINGS_API_KEYS está obsoleta'),
      expect.stringContaining('CLEANINGS_WRITE_API_KEYS está obsoleta'),
    ]);
    warn.mockRestore();
  });

  it('no avisa si solo están las variables nuevas', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    new IntegrationsApiModule({
      get: (key: string) =>
        key.startsWith('INTEGRATIONS') ? 'a:' + 'x'.repeat(32) : undefined,
    } as never).onModuleInit();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
