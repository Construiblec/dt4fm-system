import { OpenmaintClient } from '../../src/integrations/openmaint/openmaint.client';

/**
 * Alambre trampa: sustituye al cliente HTTP de más bajo nivel hacia openMAINT.
 *
 * Cada gateway (OpenmaintService, CleaningTasksOpenmaintService, etc.) se
 * mockea por su nombre semántico en cada suite, así que en el camino feliz
 * ESTE trap nunca debería dispararse. Si se dispara, significa que una ruta
 * de código está llegando hasta el cliente HTTP real sin pasar por ningún
 * mock — mejor un fallo inmediato y explícito aquí que un intento real de
 * red contra el VPS de openMAINT en medio de un CI.
 */
const trap =
  (method: string) =>
  (...args: unknown[]) => {
    throw new Error(
      `[openmaint-client.trap] OpenmaintClient.${method}(${args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(', ')}) se llamó sin mockear. ` +
        'Alguna ruta de código se está escapando de los gateways mockeados.',
    );
  };

/**
 * `jest.fn<Promise<any>, any[]>` a propósito: si se infiriera del `trap()`
 * que siempre lanza, TypeScript le asignaría tipo de retorno `never` y
 * `.mockResolvedValueOnce(...)` dejaría de aceptar nada en las suites que
 * necesitan configurar una llamada puntual (p. ej. owners, que inyecta
 * OpenmaintClient directo).
 */
const trapFn = (method: string): jest.Mock<Promise<any>, any[]> =>
  jest.fn(trap(method));

export const openmaintClientTrap = {
  get: trapFn('get'),
  post: trapFn('post'),
  put: trapFn('put'),
  delete: trapFn('delete'),
  postFormData: trapFn('postFormData'),
  getBuffer: trapFn('getBuffer'),
} satisfies Record<keyof OpenmaintClient, jest.Mock>;
