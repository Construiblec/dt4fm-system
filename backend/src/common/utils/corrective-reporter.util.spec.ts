import { resolveReporter } from './corrective-reporter.util';

describe('resolveReporter', () => {
  it('usa el nombre del huésped de la nota, no el solicitante técnico', () => {
    const notes =
      'No hay agua caliente\n\n--- Datos del huésped ---\nNombre: Bruno Salas\nCorreo: b@x.com';

    expect(resolveReporter(notes, 'Portal Huésped')).toEqual({
      name: 'Bruno Salas',
      kind: 'guest',
    });
  });

  it('reconoce al visitante', () => {
    const notes =
      'Foco quemado\n\n--- Datos del visitante ---\nNombre: Ana Ruiz\nTeléfono: 099';

    expect(resolveReporter(notes, 'Visitante')).toEqual({
      name: 'Ana Ruiz',
      kind: 'visitor',
    });
  });

  it('reconoce la alarma IoT por la cabecera de la nota', () => {
    expect(
      resolveReporter(
        'Alarma automática del Sistema IoT: Presión baja.',
        'Iot Sistema',
      ),
    ).toEqual({ name: 'Sistema IoT', kind: 'iot' });
  });

  it('cae al solicitante de OpenMAINT para el personal', () => {
    expect(resolveReporter('Fuga en el baño', 'María Quispe')).toEqual({
      name: 'María Quispe',
      kind: 'staff',
    });
  });

  it('sin nombre en el bloque ni solicitante devuelve null', () => {
    expect(
      resolveReporter(
        'x\n--- Datos del huésped ---\nNombre: No disponible',
        null,
      ),
    ).toBeNull();
  });
});
