import {
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
