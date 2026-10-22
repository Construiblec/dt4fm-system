import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import * as ts from 'typescript';

/**
 * La convención de `backend/docs/logging.md`, comprobada sobre el código.
 *
 * CI ejecuta `npm test` pero no ESLint: esta prueba es la que impide volver a
 * los patrones que llenaban Render de líneas ilegibles o con secretos. Si
 * falla, la lista dice archivo y línea; el porqué de cada regla está en el
 * nombre de su prueba.
 *
 * Lee el código con el parser de TypeScript y no con expresiones regulares:
 * así ignora los comentarios y no se confunde con literales como `/(['"]?)/`.
 */

const SRC = join(__dirname, '..', '..');

const LEVELS = new Set(['log', 'warn', 'error', 'debug', 'verbose', 'fatal']);

/** `this.logger`, `logger`, `httpLogger`, `Logger`… */
const LOGGER_TARGET = /(^|\.)\w*[lL]ogger$/;

/** Nombres con los que el código suele llamar a un error capturado. */
const ERROR_NAMES = new Set([
  'error',
  'err',
  'e',
  'lastError',
  'finalError',
  'exception',
  'cause',
]);

const EMOJI = /[☀-➿\u{1F300}-\u{1FAFF}]/u;

/** Los únicos archivos que pueden registrar un JSON completo, y por qué. */
const JSON_ALLOWED: Record<string, string> = {
  'modules/iot-alarms/iot-alarms.service.ts':
    'la Raspberry no reintenta: el payload es el único registro de una alarma que no se pudo dar de alta',
};

type Rule =
  | 'console'
  | 'error-crudo'
  | 'mensaje-como-contexto'
  | 'objeto'
  | 'emoji'
  | 'json';

type Violation = { rule: Rule; where: string };

/** `(error as Error)?.message` y similares, sin paréntesis ni casts. */
function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
    ? unwrap(node.expression)
    : node;
}

export function findViolations(file: string, text: string): Violation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const target = node.expression.expression.getText(source);
      const method = node.expression.name.text;
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const where = `${file}:${line}`;

      if (target === 'console') {
        found.push({ rule: 'console', where });
      } else if (LOGGER_TARGET.test(target) && LEVELS.has(method)) {
        const args = node.arguments.map(unwrap);

        if (
          args.some((arg) => ts.isIdentifier(arg) && ERROR_NAMES.has(arg.text))
        ) {
          found.push({ rule: 'error-crudo', where });
        }

        if (
          args
            .slice(1)
            .some(
              (arg) =>
                ts.isPropertyAccessExpression(arg) &&
                arg.name.text === 'message',
            )
        ) {
          found.push({ rule: 'mensaje-como-contexto', where });
        }

        if (args.some((arg) => ts.isObjectLiteralExpression(arg))) {
          found.push({ rule: 'objeto', where });
        }

        const call = node.getText(source);

        if (EMOJI.test(call)) {
          found.push({ rule: 'emoji', where });
        }

        if (call.includes('JSON.stringify(') && !(file in JSON_ALLOWED)) {
          found.push({ rule: 'json', where });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(full);
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [full]
      : [];
  });
}

describe('Convención de logs (backend/docs/logging.md)', () => {
  const violations = sourceFiles(SRC).flatMap((full) =>
    findViolations(
      relative(SRC, full).split(sep).join('/'),
      readFileSync(full, 'utf8'),
    ),
  );

  const offenders = (rule: Rule) =>
    violations.filter((v) => v.rule === rule).map((v) => v.where);

  it('nadie usa console: no pasa por AppLogger, que tapa secretos y respeta LOG_LEVEL', () => {
    expect(offenders('console')).toEqual([]);
  });

  it('ningún error se pasa tal cual al logger: la causa va en el texto con describeError()', () => {
    expect(offenders('error-crudo')).toEqual([]);
  });

  it('nadie pasa error.message como segundo argumento: Nest lo muestra como [contexto]', () => {
    expect(offenders('mensaje-como-contexto')).toEqual([]);
  });

  it('ningún objeto como argumento: los datos van como clave=valor dentro del texto', () => {
    expect(offenders('objeto')).toEqual([]);
  });

  it('sin emojis en los logs', () => {
    expect(offenders('emoji')).toEqual([]);
  });

  it('sin JSON completo en los logs (solo ids), salvo las excepciones justificadas', () => {
    expect(offenders('json')).toEqual([]);
  });
});

describe('el detector de la convención', () => {
  it('reconoce cada patrón prohibido', () => {
    const bad = `
      class Ejemplo {
        f(error: Error) {
          console.log('depurando');
          this.logger.error('Falló', error);
          this.logger.error('Falló:', (error as Error)?.message);
          this.logger.warn('Estado', { status: 500 });
          this.logger.log('✅ listo');
          this.logger.log(\`payload=\${JSON.stringify({ a: 1 })}\`);
        }
      }`;

    expect(
      findViolations('ejemplo.ts', bad)
        .map((v) => v.rule)
        .sort(),
    ).toEqual(
      [
        'console',
        'error-crudo',
        'mensaje-como-contexto',
        'objeto',
        'emoji',
        'json',
      ].sort(),
    );
  });

  it('acepta las formas correctas e ignora los comentarios', () => {
    const good = `
      // console.log('esto es un comentario'); this.logger.error('x', error);
      class Ejemplo {
        f(error: Error, reason: string) {
          this.logger.error(\`Falló — \${describeError(error)}\`);
          this.logger.error(reason, error instanceof Error ? error.stack : undefined);
          httpLogger.warn('GET /x 404 (3 ms)');
        }
      }`;

    expect(findViolations('ejemplo.ts', good)).toEqual([]);
  });

  it('da archivo y línea de cada caso', () => {
    const text = `\n\nthis.logger.error('Falló', error);`;

    expect(findViolations('modules/x.ts', text)).toEqual([
      { rule: 'error-crudo', where: 'modules/x.ts:3' },
    ]);
  });
});
