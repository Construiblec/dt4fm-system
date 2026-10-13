import {
  extractRegisterLog,
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

type Entry = {
  step: string;
  time?: string;
  role?: string;
  author?: string;
  note?: string;
};

/** Entrada tal como la devuelve OpenMAINT; sin nota no trae el bloque `notes`. */
const entry = ({
  step,
  time = '14:12',
  role = 'SupervisorMantenimiento',
  author = 'Supervisor Prueba',
  note,
}: Entry) =>
  '<div class="opm_register_entry"><div class="opm_register_header">' +
  '<b><span data-block="date">12 Oct 2026</span></b> ' +
  `<b><span data-block="time">${time}</span>, </b>paso<b> ` +
  `<span data-block="step">${step}</span></b>, rol <b>` +
  `<span data-block="userrole">${role}</span></b>, usuario <b>` +
  `<span data-block="userdescr">${author}</span></b> ` +
  '(<span data-block="username">usuario</span>)</div>' +
  '<div class="opm_register_content"><span data-block="timers">0.01 h</span>' +
  (note === undefined
    ? ''
    : `<br /><div><span data-block="notes">${note}</span></div>`) +
  '</div></div>';

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

  it('limpia etiquetas y espacios, pero conserva los saltos de línea', () => {
    expect(
      extractReportNotes(register('<p>Sale   agua</p>\n  bajo el lavabo')),
    ).toBe('Sale agua\nbajo el lavabo');
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

describe('extractRegisterLog', () => {
  const opening = entry({ step: 'CM01 - Apertura', note: 'Fuga en el 3B' });

  it('lista las notas posteriores a la apertura con su paso, autor y fecha', () => {
    const html =
      opening +
      entry({ step: 'CM02 - Asignación', note: 'Llevar repuestos' }) +
      entry({
        step: 'CM03 - Ejecución',
        time: '14:15',
        role: 'Equipo TPM',
        author: 'Luis Paredes',
        note: 'Listo',
      });

    expect(extractRegisterLog(html)).toEqual([
      {
        at: '2026-10-12T14:12:00',
        stepCode: 'CM02',
        step: 'Asignación',
        author: 'Supervisor Prueba',
        role: 'SupervisorMantenimiento',
        note: 'Llevar repuestos',
        isRejection: false,
      },
      {
        at: '2026-10-12T14:15:00',
        stepCode: 'CM03',
        step: 'Ejecución',
        author: 'Luis Paredes',
        role: 'Equipo TPM',
        note: 'Listo',
        isRejection: false,
      },
    ]);
  });

  it('omite los pasos sin nota y la apertura', () => {
    const html =
      opening +
      entry({ step: 'CM02 - Asignación' }) +
      entry({ step: 'CM03 - Ejecución', note: 'Listo' });

    expect(extractRegisterLog(html).map((item) => item.note)).toEqual([
      'Listo',
    ]);
    expect(extractRegisterLog(opening)).toEqual([]);
    expect(extractRegisterLog(null)).toEqual([]);
  });

  it('marca como rechazo la nota de CM05 seguida de la vuelta a asignación', () => {
    const html =
      opening +
      entry({ step: 'CM05 - Contabilidad', note: 'Sigue goteando' }) +
      entry({ step: 'CM02 - Asignación' });

    expect(extractRegisterLog(html)[0].isRejection).toBe(true);
  });

  it('un rechazo aún sin reasignar se reconoce por el estado actual', () => {
    const html =
      opening + entry({ step: 'CM05 - Contabilidad', note: 'Sigue goteando' });

    expect(extractRegisterLog(html, 'CM-Assignment')[0].isRejection).toBe(true);
    expect(extractRegisterLog(html, 'CM-Closure')[0].isRejection).toBe(false);
  });
});
