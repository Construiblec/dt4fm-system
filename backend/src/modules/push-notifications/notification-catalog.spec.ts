import {
  CleaningPlanCounts,
  cleaningCompleted,
  cleaningCorrectionsAssigned,
  cleaningCorrectionsFixed,
  cleaningPlanUpdated,
  cleaningReopened,
  correctiveOpened,
  joinLocation,
} from './notification-catalog';

describe('joinLocation', () => {
  it('separa los segmentos con "·" y no con guion', () => {
    expect(joinLocation('I-P1 - Planta Alta 1', 'I - Inglaterra')).toBe(
      'Planta Alta 1 · Inglaterra',
    );
  });

  it('recorta el código con el que openMAINT prefija cada descripción', () => {
    expect(joinLocation('CAL 01 - Calefón 1', 'I - Inglaterra')).toBe(
      'Calefón 1 · Inglaterra',
    );
  });

  it('corta solo por el primer separador, porque el nombre puede llevar guiones', () => {
    expect(joinLocation('SPR-1 - Sensor - prueba')).toBe('Sensor - prueba');
  });

  it('deja intacto el segmento que no lleva código delante', () => {
    expect(joinLocation('Depto 402', 'I - Inglaterra')).toBe(
      'Depto 402 · Inglaterra',
    );
  });

  it('conserva el segmento cuando detrás del código no queda nada', () => {
    expect(joinLocation('CAL 01 - ')).toBe('CAL 01 -');
  });

  it('encadena unidad, piso y edificio en ese orden', () => {
    expect(
      joinLocation('Depto 402', 'I-P4 - Planta Alta 4', 'I - Inglaterra'),
    ).toBe('Depto 402 · Planta Alta 4 · Inglaterra');
  });

  it('descarta los segmentos vacíos en lugar de dejar separadores sueltos', () => {
    expect(joinLocation(null, 'I - Inglaterra', undefined, '  ')).toBe(
      'Inglaterra',
    );
  });

  it('avisa cuando no hay ningún segmento', () => {
    expect(joinLocation(null, undefined, '')).toBe('ubicación no especificada');
  });
});

describe('correctiveOpened', () => {
  it('compone el aviso del supervisor con la ubicación ya limpia', () => {
    const message = correctiveOpened({
      id: 8193346,
      requesterName: 'Sistema IoT',
      location: joinLocation('CAL 01 - Calefón 1', 'I - Inglaterra'),
    });

    expect(message.body).toBe(
      'Sistema IoT ha reportado un problema en Calefón 1 · Inglaterra',
    );
  });
});

describe('cleaningReopened', () => {
  it('avisa al operario con el motivo y abre su vista de la tarea', () => {
    const message = cleaningReopened({
      id: 777,
      location: joinLocation('R315 - Estudio 15', 'R - República'),
      reason: 'Faltó limpiar la nevera',
    });

    expect(message.type).toBe('cleaning.reopened');
    expect(message.title).toBe('Reabierta: Limpieza');
    expect(message.body).toBe(
      'Supervisión reabrió tu limpieza en Estudio 15 · República: «Faltó limpiar la nevera»',
    );
    expect(message.deepLink).toBe('/cleaning-tasks/777/execute');
  });

  it('sin motivo no deja dos puntos colgando', () => {
    const message = cleaningReopened({
      id: 777,
      location: 'R315',
      reason: '  ',
    });

    expect(message.body).toBe('Supervisión reabrió tu limpieza en R315');
  });

  it('recorta un motivo largo', () => {
    const message = cleaningReopened({
      id: 777,
      location: 'R315',
      reason: 'x'.repeat(300),
    });

    expect(message.body).toMatch(/…»$/);
    expect(message.body.length).toBeLessThan(160);
  });
});

describe('cleaningCompleted', () => {
  const base = { id: 777, employeeName: 'María', location: 'R302' };

  it('SupervisorLimpieza abre el inicio de la supervisión', () => {
    expect(
      cleaningCompleted({ ...base, toSupervisionPanel: true }).deepLink,
    ).toBe('/supervision/tarea/777');
  });

  it('AsistenteSL y SuperUser abren su ficha, a la que sí pueden entrar', () => {
    expect(cleaningCompleted(base).deepLink).toBe('/asistente-sl/tasks/777');
  });
});

describe('cleaningPlanUpdated', () => {
  const build = (counts: Partial<CleaningPlanCounts>) =>
    cleaningPlanUpdated({
      cleaningEmployeeId: 42,
      counts: {
        assigned: 0,
        rescheduled: 0,
        removed: 0,
        cancelled: 0,
        ...counts,
      },
    });

  it('agrupa por operario y abre el listado de limpiezas', () => {
    expect(build({ rescheduled: 1 })).toEqual({
      type: 'cleaning.plan-updated',
      title: 'Plan actualizado: Limpieza',
      body: '1 reprogramada',
      deepLink: '/dashboard?tab=cleaning',
      entityKind: 'cleaning',
      entityId: 'plan-42',
    });
  });

  it('concuerda en singular y omite los ceros', () => {
    expect(build({ assigned: 2, rescheduled: 1, removed: 1 }).body).toBe(
      '2 asignadas, 1 reprogramada, 1 retirada',
    );
    expect(build({ cancelled: 1 }).body).toBe('1 cancelada');
  });

  it('concuerda en plural', () => {
    expect(
      build({ assigned: 1, rescheduled: 3, removed: 2, cancelled: 4 }).body,
    ).toBe('1 asignada, 3 reprogramadas, 2 retiradas, 4 canceladas');
  });
});

describe('correcciones de limpieza', () => {
  it('el aviso al Corrector abre sus correcciones y cuenta las novedades', () => {
    const message = cleaningCorrectionsAssigned({
      id: 777,
      supervisionId: 5000,
      location: 'R302',
      findingsCount: 2,
    });

    expect(message.type).toBe('cleaning.corrections-assigned');
    expect(message.body).toBe('Tienes 2 correcciones en R302');
    expect(message.deepLink).toBe('/cleaning-corrections/5000');
    expect(message.entityKind).toBe('cleaning');
    expect(message.entityId).toBe('777');
  });

  it('en singular con una sola novedad', () => {
    const message = cleaningCorrectionsAssigned({
      id: 777,
      supervisionId: 5000,
      location: 'R302',
      findingsCount: 1,
    });

    expect(message.body).toBe('Tienes 1 corrección en R302');
  });

  it('«Resuelto» avisa a supervisión y abre el resumen', () => {
    const message = cleaningCorrectionsFixed({
      id: 777,
      supervisionId: 5000,
      employeeName: 'María',
      location: 'R302',
    });

    expect(message.type).toBe('cleaning.corrections-fixed');
    expect(message.deepLink).toBe('/supervision/5000');
  });
});
