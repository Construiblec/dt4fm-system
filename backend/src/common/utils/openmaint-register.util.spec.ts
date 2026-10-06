import {
  extractRegisterNotes,
  extractReportNotes,
} from './openmaint-register.util';

/** Bitácora con la forma real de OpenMAINT: un `notes` por paso, en orden. */
const register = (...notes: string[]) =>
  notes
    .map(
      (note, i) =>
        `<div><span data-block="step">Paso ${i}</span>` +
        `<span data-block="notes">${note}</span></div>`,
    )
    .join('');

describe('extractReportNotes', () => {
  it('devuelve la nota del reporte aunque otros pasos añadan las suyas', () => {
    const html = register(
      'Fuga en el baño del 3B',
      'Asignado a Pedro',
      'se cancelo',
    );

    expect(extractReportNotes(html)).toBe('Fuga en el baño del 3B');
    // La de siempre sigue devolviendo la más reciente.
    expect(extractRegisterNotes(html)).toBe('se cancelo');
  });

  it('limpia etiquetas y espacios', () => {
    expect(
      extractReportNotes(register('<p>Sale   agua</p>\n<br>bajo el lavabo')),
    ).toBe('Sale agua bajo el lavabo');
  });

  it.each([null, '', '<div>sin notas</div>'])(
    'sin nota del reporte devuelve null (%s)',
    (html) => {
      expect(extractReportNotes(html)).toBeNull();
    },
  );

  it('un reporte sin nota no toma la de un paso posterior', () => {
    expect(extractReportNotes(register('', 'Asignado a Pedro'))).toBeNull();
  });
});
