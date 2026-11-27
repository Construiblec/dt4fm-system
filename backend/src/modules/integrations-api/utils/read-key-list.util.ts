import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const logger = new Logger('IntegrationsApi');
const warned = new Set<string>();

/**
 * Valor de la variable nueva si no está vacía; si no, el de la obsoleta. Usar
 * la obsoleta (o tener las dos) deja un aviso, una sola vez por proceso.
 */
export const readKeyList = (
  config: ConfigService,
  variable: string,
  legacy: string,
): string => {
  const current = config.get<string>(variable)?.trim() ?? '';
  const old = config.get<string>(legacy)?.trim() ?? '';

  if (old && !warned.has(legacy)) {
    warned.add(legacy);
    logger.warn(`${legacy} está obsoleta: renombrar a ${variable}`);
  }

  return current || old;
};

/** Solo para pruebas. */
export const resetKeyListWarnings = (): void => warned.clear();
